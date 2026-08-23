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
} elseif ($method === 'POST' && ($_GET['action'] ?? '') === 'demo') {
    loginPublicDemo($db);
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

function publicDemoEnabled(): bool {
    return filter_var(
        getenv('PUBLIC_DEMO_ENABLED') ?: 'false',
        FILTER_VALIDATE_BOOLEAN
    );
}

function publicDemoUsername(): string {
    $value = strtolower(trim((string)(getenv('PUBLIC_DEMO_USERNAME') ?: 'portfolio-demo')));
    return preg_match('/^[a-z0-9._-]{3,50}$/', $value) ? $value : 'portfolio-demo';
}

function isPublicDemoUserRow(array $user): bool {
    return publicDemoEnabled()
        && strtolower((string)($user['username'] ?? '')) === publicDemoUsername();
}

function ensurePublicDemoUser(PDO $db): array {
    $username = publicDemoUsername();
    $name = trim((string)(getenv('PUBLIC_DEMO_NAME') ?: 'Visiteur Démo'));
    $email = strtolower(trim((string)(getenv('PUBLIC_DEMO_EMAIL') ?: 'portfolio-demo@example.invalid')));

    if ($name === '') $name = 'Visiteur Démo';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $email = 'portfolio-demo@example.invalid';
    }

    // Aucun mot de passe public : le compte reçoit un secret aléatoire
    // inconnu du visiteur. La connexion publique passe uniquement par
    // auth.php?action=demo lorsque PUBLIC_DEMO_ENABLED=true.
    $passwordHash = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);

    $db->beginTransaction();
    try {
        $select = $db->prepare(
            'SELECT id FROM users WHERE username = :username LIMIT 1 FOR UPDATE'
        );
        $select->execute([':username' => $username]);
        $userId = (int)($select->fetchColumn() ?: 0);

        if ($userId > 0) {
            $update = $db->prepare(
                "UPDATE users
                 SET name = :name,
                     email = :email,
                     password = :password,
                     role = 'teacher',
                     status = 'active',
                     deleted_at = NULL
                 WHERE id = :id"
            );
            $update->execute([
                ':name' => $name,
                ':email' => $email,
                ':password' => $passwordHash,
                ':id' => $userId,
            ]);
        } else {
            $insert = $db->prepare(
                "INSERT INTO users
                    (name, username, email, password, role, status)
                 VALUES
                    (:name, :username, :email, :password, 'teacher', 'active')"
            );
            $insert->execute([
                ':name' => $name,
                ':username' => $username,
                ':email' => $email,
                ':password' => $passwordHash,
            ]);
            $userId = (int)$db->lastInsertId();
        }

        // Démo publique = consultation des modules principaux, sans écriture.
        $viewable = [
            'students', 'teachers', 'courses', 'rooms', 'room-bookings',
            'planning', 'evaluations', 'grades', 'absences',
            'school-operations', 'messaging',
        ];

        $deletePermissions = $db->prepare(
            'DELETE FROM user_feature_permissions WHERE user_id = :user_id'
        );
        $deletePermissions->execute([':user_id' => $userId]);

        $insertPermission = $db->prepare(
            'INSERT INTO user_feature_permissions
                (user_id, feature_key, can_view, can_manage, granted_by)
             VALUES
                (:user_id, :feature_key, :can_view, 0, NULL)'
        );

        foreach (featurePermissionKeys() as $featureKey) {
            $insertPermission->execute([
                ':user_id' => $userId,
                ':feature_key' => $featureKey,
                ':can_view' => in_array($featureKey, $viewable, true) ? 1 : 0,
            ]);
        }

        $userQuery = $db->prepare(
            'SELECT id, name, username, email, role, status
             FROM users WHERE id = :id LIMIT 1'
        );
        $userQuery->execute([':id' => $userId]);
        $user = $userQuery->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            throw new RuntimeException('Compte de démonstration introuvable après création.');
        }

        $db->commit();
        return $user;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function loginPublicDemo(PDO $db): void {
    if (!publicDemoEnabled()) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => 'La démonstration publique est désactivée.'
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    try {
        $user = ensurePublicDemoUser($db);

        session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_name'] = $user['name'];
        $_SESSION['user_username'] = $user['username'];
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['user_role'] = $user['role'];
        $_SESSION['is_public_demo'] = true;
        $_SESSION['LAST_ACTIVITY'] = time();

        $token = issueToken($db, (int)$user['id']);
        $csrfToken = issueCsrfToken();

        echo json_encode([
            'success' => true,
            'message' => 'Mode démo activé',
            'data' => [
                'id' => $user['id'],
                'name' => $user['name'],
                'username' => $user['username'],
                'email' => $user['email'],
                'role' => $user['role'],
                'is_demo' => true,
                'permissions' => loadFeaturePermissions($db, (int)$user['id'], $user['role']),
                'token' => $token,
                'csrf_token' => $csrfToken,
            ],
        ], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $error) {
        error_log('Public demo login failure: ' . $error->getMessage());
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'La démonstration publique est temporairement indisponible.'
        ], JSON_UNESCAPED_UNICODE);
    }
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
            'is_demo' => isPublicDemoUserRow($user),
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
            'is_demo' => isPublicDemoUserRow($user),
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
