<?php
/**
 * Authentication guard middleware.
 * Accepte deux modes d'authentification :
 *  1) Token Bearer (header Authorization) -> permet d'avoir un utilisateur
 *     différent par onglet de navigateur, car le token vit en sessionStorage
 *     côté front (isolé par onglet), contrairement au cookie de session.
 *  2) Cookie de session PHP classique (fallback, compatibilité).
 * Dans les deux cas, remplit $_SESSION['user_id'/'user_role'/...] pour que
 * le reste du code (routes API existantes) continue de fonctionner sans
 * modification.
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function resolveAuthToken() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

$token = resolveAuthToken();

if ($token) {
    // Le fichier appelant a déjà fait require_once database.php avant ce guard
    // dans tous les endpoints existants ; $database/$db peuvent donc ne pas
    // exister ici si l'ordre change un jour, donc on se connecte nous-mêmes.
    require_once __DIR__ . '/database.php';
    $database = new Database();
    $db = $database->getConnection();

    $query = "SELECT u.id, u.name, u.role
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
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode([
            'success' => false,
            'message' => 'Session expirée ou invalide'
        ]);
        exit();
    }

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_role'] = $user['role'];
} else {
    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode([
            'success' => false,
            'message' => 'Non authentifié'
        ]);
        exit();
    }

    // Le cookie de session doit être revérifié lui aussi : un compte désactivé
    // après sa connexion ne doit pas conserver l'accès jusqu'à la fin du cookie.
    require_once __DIR__ . '/database.php';
    $database = new Database();
    $db = $database->getConnection();
    $query = "SELECT id, name, role FROM users
              WHERE id = :user_id AND status = 'active' AND deleted_at IS NULL";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $_SESSION['user_id']);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        session_unset();
        http_response_code(401);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['success' => false, 'message' => 'Compte inactif ou suspendu']);
        exit();
    }

    $_SESSION['user_role'] = $user['role'];
}

// Contrôle transversal des fonctionnalités. Les endpoints conservent leurs
// contrôles métier propres (rôle, propriété de la ressource), auxquels
// s'ajoutent ici les restrictions configurées par l'administration.
require_once __DIR__ . '/feature_permissions.php';
$featureByEndpoint = [
    'student.php' => 'students', 'teachers.php' => 'teachers',
    'courses.php' => 'courses', 'course_resources.php' => 'courses',
    'rooms.php' => 'rooms', 'buildings.php' => 'rooms', 'room_types.php' => 'rooms',
    'room_bookings.php' => 'room-bookings',
    'planning.php' => 'planning',
    'evaluations.php' => 'evaluations', 'evaluation_types.php' => 'evaluations', 'evaluation_subjects.php' => 'evaluations',
    'grades.php' => 'grades', 'report_cards.php' => 'grades',
    'absences.php' => 'absences', 'absence_justifications.php' => 'absences',
    'school_operations.php' => 'school-operations', 'enrollments.php' => 'school-operations', 'academic_policies.php' => 'school-operations',
    'messages.php' => 'messaging', 'contacts.php' => 'messaging',
    'payroll.php' => 'payroll', 'admin_users.php' => 'admin-users', 'trash.php' => 'admin-users',
];
$currentEndpoint = basename((string)($_SERVER['SCRIPT_NAME'] ?? ''));
$requiredFeature = $featureByEndpoint[$currentEndpoint] ?? null;
// Le profil du compte appartient au socle de session et doit rester
// accessible même si le module « Scolarité » a été masqué pour l'utilisateur.
if ($currentEndpoint === 'school_operations.php' && ($_GET['resource'] ?? '') === 'profile') {
    $requiredFeature = null;
}
$currentRole = (string)($_SESSION['user_role'] ?? '');
if ($requiredFeature && !in_array($currentRole, ['admin', 'directeur'], true)) {
    $writeRequest = !in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD', 'OPTIONS'], true);

    // Ces écritures font partie de l'usage normal d'un module consultable :
    // elles ne donnent aucun pouvoir de gestion sur les données d'autrui.
    $action = (string)($_GET['action'] ?? '');
    if ($currentEndpoint === 'messages.php' && $action === 'ws_ticket') {
        $writeRequest = false;
    }
    if (
        $currentEndpoint === 'absence_justifications.php'
        && $currentRole === 'student'
        && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
    ) {
        $writeRequest = false;
    }

    enforceFeaturePermission($db, $requiredFeature, $writeRequest);
}
?>
