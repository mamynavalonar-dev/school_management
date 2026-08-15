<?php
/**
 * csrf_guard.php
 *
 * Protection CSRF (Task #5), en defense-in-depth par-dessus le Bearer
 * token déjà utilisé par le frontend (intrinsèquement sûr contre le CSRF,
 * car un site tiers ne peut pas lire le sessionStorage d'un autre domaine)
 * et le cookie de session SameSite=Strict (déjà une bonne protection sur
 * les navigateurs modernes, mais pas une garantie absolue à 100%).
 *
 * Principe (double-submit token, adapté à ce projet) :
 *  - Un token aléatoire est généré à la connexion (voir auth.php::login/
 *    register/me) et stocké à la fois en $_SESSION['csrf_token'] et
 *    renvoyé au client dans le corps de la réponse JSON.
 *  - Le frontend doit renvoyer ce token dans le header X-CSRF-Token sur
 *    toute requête state-changing (POST/PUT/DELETE).
 *  - Ce guard compare les deux valeurs avec hash_equals() (comparaison à
 *    temps constant, pour éviter une fuite d'information par timing).
 *
 * Pourquoi ça bloque un vrai CSRF et pas une requête légitime : un site
 * tiers peut forcer le navigateur de la victime à envoyer une requête avec
 * ses cookies (c'est la définition même du CSRF), mais il ne peut pas lire
 * la valeur du token CSRF de la victime (protégé par same-origin policy)
 * pour la recopier dans un header custom — donc il ne peut jamais fournir
 * un X-CSRF-Token valide.
 *
 * Usage : require_once ce fichier dans chaque endpoint state-changing,
 * JUSTE APRÈS require_once auth_guard.php (qui remplit $_SESSION['user_id']
 * / éventuellement $_SESSION['csrf_token'] selon le mode d'authentification
 * utilisé). Ce guard ne fait rien sur GET/OPTIONS (lecture seule, jamais
 * de risque CSRF).
 */

function csrfGuard() {
    $method = $_SERVER['REQUEST_METHOD'];

    // GET/HEAD/OPTIONS sont sans effet de bord : aucune protection CSRF
    // n'est nécessaire (et n'en ajouter romprait la simple consultation).
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }

    // Si la requête est authentifiée via Bearer token (header Authorization),
    // elle est déjà intrinsèquement sûre contre le CSRF : un site tiers ne
    // peut pas lire le sessionStorage d'un autre domaine pour reconstruire
    // ce header. On n'exige donc pas de token CSRF supplémentaire dans ce
    // cas — cela permettrait aussi de futurs clients API légitimes
    // (mobile, intégrations tierces) sans leur imposer ce mécanisme.
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/Bearer\s+.+/i', $authHeader)) {
        return;
    }

    // Authentification en mode cookie-only : on exige un token CSRF valide.
    $sentToken = $headers['X-CSRF-Token'] ?? $headers['X-Csrf-Token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');

    if (empty($_SESSION['csrf_token']) || empty($sentToken) || !hash_equals($_SESSION['csrf_token'], $sentToken)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode([
            'success' => false,
            'message' => 'Jeton CSRF manquant ou invalide.',
        ]);
        exit();
    }
}

csrfGuard();
?>
