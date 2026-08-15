<?php
/**
 * contacts.php
 *
 * Liste les utilisateurs que l'utilisateur courant est autorisé à
 * contacter en messagerie, groupés par rôle. Utilisé par le panneau
 * "Nouveau message" du frontend (sélection de destinataire).
 *
 * Respecte exactement les mêmes règles de séparation des rôles que
 * createConversation() dans messages.php, pour qu'un utilisateur ne
 * puisse jamais démarrer une conversation que le backend refuserait
 * ensuite :
 *   - un étudiant peut contacter : enseignants, admins/directeurs
 *   - un étudiant NE PEUT PAS contacter un autre étudiant
 *   - un enseignant/admin/directeur peut contacter tout le monde
 *
 * GET ?action=list                 -> tous les contacts autorisés, groupés par rôle
 * GET ?action=list&search=texte    -> filtre par nom (LIKE, insensible à la casse)
 * GET ?action=list&role=teacher    -> filtre sur un rôle précis (doit rester
 *                                     un rôle autorisé pour l'utilisateur courant)
 */
require_once '../config/database.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';

header("Content-Type: application/json; charset=UTF-8");

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

try {
    if ($action === 'list' && $method === 'GET') {
        listContacts($db);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Requête invalide.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in contacts.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}

/**
 * Rôles que le rôle courant a le droit de contacter. Reflète exactement
 * la règle appliquée côté écriture dans messages.php::createConversation().
 * Tenu à jour manuellement en miroir de cette fonction si les règles
 * métier changent un jour.
 */
function allowedTargetRoles($selfRole) {
    if ($selfRole === 'student') {
        // Un étudiant ne peut pas contacter un autre étudiant.
        return ['teacher', 'admin', 'directeur'];
    }
    // Enseignants, admins, directeurs peuvent contacter tout le monde
    // (y compris les étudiants).
    return null; // null = pas de restriction de rôle
}

function listContacts($db) {
    $selfId = $_SESSION['user_id'];
    $selfRole = $_SESSION['user_role'];
    $allowedRoles = allowedTargetRoles($selfRole);

    $search = trim((string)($_GET['search'] ?? ''));
    if (mb_strlen($search) > 100) $search = mb_substr($search, 0, 100);
    $roleFilter = trim($_GET['role'] ?? '');

    if ($roleFilter !== '' && !in_array($roleFilter, ['admin', 'directeur', 'teacher', 'student'], true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Filtre de rôle invalide.']);
        return;
    }

    // Si un rôle précis est demandé, il doit faire partie des rôles
    // autorisés (sinon on l'ignore silencieusement plutôt que de
    // renvoyer des contacts non autorisés).
    if ($roleFilter !== '' && ($allowedRoles === null || in_array($roleFilter, $allowedRoles, true))) {
        $effectiveRoles = [$roleFilter];
    } elseif ($roleFilter !== '') {
        // Un filtre interdit ne doit pas être ignoré : cela renverrait la
        // liste entière alors que le client demandait un rôle précis.
        $effectiveRoles = [];
    } else {
        $effectiveRoles = $allowedRoles;
    }

    $conditions = ['u.id != :self_id', "u.status = 'active'", 'u.deleted_at IS NULL'];
    $params = [':self_id' => $selfId];

    if ($effectiveRoles === []) {
        echo json_encode(['success' => true, 'data' => [], 'grouped' => []]);
        return;
    }

    if ($effectiveRoles !== null) {
        $placeholders = [];
        foreach ($effectiveRoles as $i => $role) {
            $key = ":role$i";
            $placeholders[] = $key;
            $params[$key] = $role;
        }
        $conditions[] = 'u.role IN (' . implode(',', $placeholders) . ')';
    }

    if ($search !== '') {
        $conditions[] = 'u.name LIKE :search';
        $params[':search'] = '%' . $search . '%';
    }

    $whereClause = implode(' AND ', $conditions);

    $stmt = $db->prepare("
        SELECT u.id, u.name, u.role, u.last_seen_at
        FROM users u
        WHERE $whereClause
        ORDER BY u.name ASC
    ");
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->execute();
    $contacts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Regroupement par rôle pour l'affichage front (onglets/sections).
    $grouped = [];
    foreach ($contacts as $contact) {
        $role = $contact['role'];
        if (!isset($grouped[$role])) {
            $grouped[$role] = [];
        }
        $grouped[$role][] = $contact;
    }

    echo json_encode([
        'success' => true,
        'data' => $contacts,
        'grouped' => $grouped,
    ]);
}
?>
