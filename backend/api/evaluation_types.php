<?php
/**
 * evaluation_types.php - Gestion des types d'évaluation (Admin/Directeur)
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
        $stmt = $db->query("SELECT id, name, description, created_at FROM evaluation_types ORDER BY name");
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }
    elseif ($method === 'POST') {
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le nom est requis.']);
            exit();
        }
        $stmt = $db->prepare("INSERT INTO evaluation_types (name, description) VALUES (:name, :description)");
        $stmt->execute([
            ':name' => trim($input['name']),
            ':description' => trim($input['description'] ?? '')
        ]);
        echo json_encode(['success' => true, 'message' => 'Type ajouté.', 'id' => $db->lastInsertId()]);
    }
    elseif ($method === 'PUT' && isset($_GET['id'])) {
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le nom est requis.']);
            exit();
        }
        $stmt = $db->prepare("UPDATE evaluation_types SET name = :name, description = :description WHERE id = :id");
        $stmt->execute([
            ':name' => trim($input['name']),
            ':description' => trim($input['description'] ?? ''),
            ':id' => intval($_GET['id'])
        ]);
        echo json_encode(['success' => true, 'message' => 'Type mis à jour.']);
    }
    elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $stmt = $db->prepare("DELETE FROM evaluation_types WHERE id = :id");
        $stmt->execute([':id' => intval($_GET['id'])]);
        echo json_encode(['success' => true, 'message' => 'Type supprimé.']);
    }
    else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log('PDOException in evaluation_types.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
