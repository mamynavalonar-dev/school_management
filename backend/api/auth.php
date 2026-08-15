<?php
require_once '../config/database.php';
require_once '../config/feature_permissions.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

// Gérer les requêtes OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on';
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $secure,
    'httponly' => true,
    'samesite' => 'Strict'
]);
session_start();

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);
// Handle case where data is sent as form-encoded instead of JSON
if ($input === null && !empty($_POST)) {
    $input = $_POST;
}

if ($method === 'POST' && ($_GET['action'] ?? '') === 'logout') {
    logout($db);
} elseif ($method === 'POST') {
    // L'inscription publique est désactivée : les comptes sont créés depuis
    // la gestion des utilisateurs par un administrateur ou un directeur.
    if (isset($input['name'])) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => "L'inscription publique est désactivée. Contactez un administrateur ou un directeur."
        ]);
    } else {
        login($db, $input);
    }
} elseif ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'me') {
    me($db);
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée']);
}

/**
 * Génère (ou réutilise si déjà présent) le token CSRF de cette session
 * cookie PHP. Voir csrf_guard.php pour l'explication complète du
 * mécanisme. Appelé après chaque connexion réussie, pour que le
 * frontend récupère toujours une valeur à jour dans la réponse.
 */
function issueCsrfToken() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Génère un token opaque aléatoire et le stocke en base, lié à l'utilisateur.
 * Ce token permet à chaque onglet du navigateur d'avoir sa propre identité
 * (contrairement au cookie de session PHP, partagé par tout le navigateur).
 * Le front le garde en sessionStorage (isolé par onglet) et l'envoie via
 * le header Authorization: Bearer <token> sur chaque requête.
 */
function issueToken($db, $userId) {
    // Nettoyage opportuniste pour éviter que les anciens jetons expirés ne
    // s'accumulent indéfiniment dans une installation utilisée longtemps.
    $db->exec('DELETE FROM auth_tokens WHERE expires_at <= UTC_TIMESTAMP()');
    $token = bin2hex(random_bytes(32));

    $query = "INSERT INTO auth_tokens (token, user_id, expires_at, created_at)
              VALUES (:token, :user_id, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), UTC_TIMESTAMP())";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':token', $token);
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();

    return $token;
}

function login($db, $data) {
    // Limitation par session sur une fenêtre glissante de 15 minutes. Cette
    // protection locale complète les limites à configurer au niveau du
    // reverse proxy en production.
    $now = time();
    if (!isset($_SESSION['login_attempt_window']) || $now - (int)$_SESSION['login_attempt_window'] >= 900) {
        $_SESSION['login_attempts'] = 0;
        $_SESSION['login_attempt_window'] = $now;
    }
    if ($_SESSION['login_attempts'] >= 10) {
        http_response_code(429); // Too many requests
        header('Retry-After: ' . max(1, 900 - ($now - (int)$_SESSION['login_attempt_window'])));
        echo json_encode(['success' => false, 'message' => 'Trop de tentatives, veuillez patienter.']);
        return;
    }

    $identifier = strtolower(trim((string)($data['username'] ?? $data['email'] ?? '')));
    if ($identifier === '' || empty($data['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Nom d'utilisateur et mot de passe requis."]);
        return;
    }

    // Le formulaire moderne envoie username. La comparaison sur email reste
    // volontairement disponible pour les anciens clients déjà déployés.
    $query = "SELECT id, name, username, email, password, role, status
              FROM users
              WHERE (username = :identifier OR email = :identifier)
                AND deleted_at IS NULL
              LIMIT 1";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':identifier', $identifier);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        $_SESSION['login_attempts']++;
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => "Nom d'utilisateur ou mot de passe incorrect."]);
        return;
    }

    if (!password_verify($data['password'], $user['password'])) {
        $_SESSION['login_attempts']++;
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => "Nom d'utilisateur ou mot de passe incorrect."]);
        return;
    }

    if ($user['status'] !== 'active') {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => $user['status'] === 'suspended'
                ? 'Ce compte est suspendu. Contactez un administrateur.'
                : 'Ce compte est inactif. Contactez un administrateur.'
        ]);
        return;
    }

    // Authentification réussie, on reset les tentatives
    $_SESSION['login_attempts'] = 0;
    $_SESSION['login_attempt_window'] = $now;
    session_regenerate_id(true);
    // On garde le remplissage de session pour compatibilité (accès direct via cookie,
    // utile par ex. en debug ou pour d'anciens clients), mais l'identité "officielle"
    // par onglet passe désormais par le token retourné ci-dessous.
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_username'] = $user['username'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['LAST_ACTIVITY'] = time();

    $token = issueToken($db, $user['id']);
    $csrfToken = issueCsrfToken();

    echo json_encode([
        'success' => true,
        'message' => 'Connexion réussie',
        'data'    => [
            'id' => $user['id'],
            'name' => $user['name'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $user['role'],
            'permissions' => loadFeaturePermissions($db, (int)$user['id'], $user['role']),
            'token' => $token,
            'csrf_token' => $csrfToken
        ]
    ]);
}

/**
 * Retourne l'utilisateur associé au token Bearer envoyé dans le header
 * Authorization. Utilisé au chargement de l'app (F5, ouverture d'un nouvel
 * onglet) pour restaurer la session sans redemander un login.
 */
function me($db) {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');

    if (!preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Non authentifié']);
        return;
    }

    $token = trim($matches[1]);

    $query = "SELECT u.id, u.name, u.username, u.email, u.role
              FROM auth_tokens t
              INNER JOIN users u ON u.id = t.user_id
              WHERE t.token = :token
                AND t.expires_at > UTC_TIMESTAMP()
                AND u.status = 'active'
                AND u.deleted_at IS NULL";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':token', $token);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Session expirée ou invalide']);
        return;
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'id' => $user['id'],
            'name' => $user['name'],
            'username' => $user['username'],
            'email' => $user['email'],
            'role' => $user['role'],
            'permissions' => loadFeaturePermissions($db, (int)$user['id'], $user['role']),
            // Présent seulement si une session cookie a par ailleurs été
            // établie (ex: onglet précédent connecté en mode cookie) ;
            // me() lui-même n'authentifie qu'en Bearer, exempté du CSRF.
            'csrf_token' => $_SESSION['csrf_token'] ?? null
        ]
    ]);
}

function logout($db) {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    $hasBearer = preg_match('/Bearer\s+(.+)/i', $authHeader, $matches) === 1;
    if (!$hasBearer) {
        $csrfToken = $headers['X-CSRF-Token']
            ?? $headers['X-Csrf-Token']
            ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if (empty($_SESSION['csrf_token']) || empty($csrfToken) || !hash_equals($_SESSION['csrf_token'], $csrfToken)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Jeton CSRF manquant ou invalide.']);
            return;
        }
    }

    if ($hasBearer) {
        $token = trim($matches[1]);
        $stmt = $db->prepare("DELETE FROM auth_tokens WHERE token = :token");
        $stmt->bindParam(':token', $token);
        $stmt->execute();
    }

    session_unset();
    session_destroy();
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Déconnexion réussie']);
}
?>
