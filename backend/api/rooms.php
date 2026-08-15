<?php
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

// Role-based access control
$allowedRoles = [];
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $allowedRoles = ['admin', 'directeur', 'teacher', 'student'];
} else {
    // POST, PUT, DELETE
    $allowedRoles = ['admin', 'directeur'];
}
if (!in_array($_SESSION['user_role'], $allowedRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM rooms");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $sql = "INSERT INTO rooms (number, name, building, floor, capacity, room_type, equipment, is_available, maintenance_date)
                VALUES (:number, :name, :building, :floor, :capacity, :room_type, :equipment, :is_available, :maintenance_date)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':number' => $input['number'] ?? '',
            ':name' => $input['name'] ?? '',
            ':building' => $input['building'] ?? '',
            ':floor' => $input['floor'] ?? 1,
            ':capacity' => $input['capacity'] ?? 30,
            ':room_type' => $input['room_type'] ?? '',
            ':equipment' => $input['equipment'] ?? '',
            ':is_available' => isset($input['is_available']) ? (int)$input['is_available'] : 1,
            ':maintenance_date' => $input['maintenance_date'] ?? null
        ]);
        echo json_encode(['success' => true, 'message' => 'Salle créée.', 'id' => $db->lastInsertId()]);
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $sql = "UPDATE rooms SET number=:number, name=:name, building=:building, floor=:floor, capacity=:capacity, room_type=:room_type, equipment=:equipment, is_available=:is_available, maintenance_date=:maintenance_date WHERE id=:id";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':number' => $input['number'] ?? '',
            ':name' => $input['name'] ?? '',
            ':building' => $input['building'] ?? '',
            ':floor' => $input['floor'] ?? 1,
            ':capacity' => $input['capacity'] ?? 30,
            ':room_type' => $input['room_type'] ?? '',
            ':equipment' => $input['equipment'] ?? '',
            ':is_available' => isset($input['is_available']) ? (int)$input['is_available'] : 1,
            ':maintenance_date' => $input['maintenance_date'] ?? null
        ]);
        echo json_encode(['success' => true, 'message' => 'Salle mise à jour.']);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $stmt = $db->prepare("DELETE FROM rooms WHERE id=:id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'message' => 'Salle supprimée.']);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in rooms.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
