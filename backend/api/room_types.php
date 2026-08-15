<?php
/**
 * room_types.php - Gestion des types de salles (Admin/Directeur)
 * GET    - Liste tous les types de salles
 * POST   - Créer un type
 * PUT    ?id=X - Modifier un type
 * DELETE ?id=X - Supprimer un type
 */
require_once '../config/database.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && !in_array($_SESSION['user_role'], ['admin', 'directeur'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé.']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT id, name, created_at FROM room_types ORDER BY name");
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }
    elseif ($method === 'POST') {
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le nom du type est requis.']);
            exit();
        }
        $stmt = $db->prepare("INSERT INTO room_types (name) VALUES (:name)");
        $stmt->execute([':name' => trim($input['name'])]);
        echo json_encode(['success' => true, 'message' => 'Type de salle ajouté.', 'id' => $db->lastInsertId()]);
    }
    elseif ($method === 'PUT' && isset($_GET['id'])) {
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le nom du type est requis.']);
            exit();
        }
        $stmt = $db->prepare("UPDATE room_types SET name = :name WHERE id = :id");
        $stmt->execute([':name' => trim($input['name']), ':id' => intval($_GET['id'])]);
        echo json_encode(['success' => true, 'message' => 'Type de salle mis à jour.']);
    }
    elseif ($method === 'DELETE' && isset($_GET['id'])) {
        // Vérifier si des salles utilisent ce type
        $check = $db->prepare("SELECT COUNT(*) FROM rooms WHERE room_type = (SELECT name FROM room_types WHERE id = :id)");
        $check->execute([':id' => intval($_GET['id'])]);
        if ($check->fetchColumn() > 0) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Impossible de supprimer : des salles utilisent ce type.']);
            exit();
        }
        $stmt = $db->prepare("DELETE FROM room_types WHERE id = :id");
        $stmt->execute([':id' => intval($_GET['id'])]);
        echo json_encode(['success' => true, 'message' => 'Type de salle supprimé.']);
    }
    else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log('PDOException in room_types.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
