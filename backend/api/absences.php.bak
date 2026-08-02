<?php
require_once '../config/database.php';

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM absences");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $sql = "INSERT INTO absences (student_id, student_name, student_number, date, reason, status, justification, course_name) 
                VALUES (:student_id, :student_name, :student_number, :date, :reason, :status, :justification, :course_name)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':student_id' => $input['student_id'] ?? null,
            ':student_name' => $input['student_name'] ?? '',
            ':student_number' => $input['student_number'] ?? '',
            ':date' => $input['date'] ?? null,
            ':reason' => $input['reason'] ?? '',
            ':status' => $input['status'] ?? 'pending',
            ':justification' => $input['justification'] ?? '',
            ':course_name' => $input['course_name'] ?? ''
        ]);
        echo json_encode(['success' => true, 'message' => 'Absence ajoutée.', 'id' => $db->lastInsertId()]);
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $sql = "UPDATE absences SET date=:date, reason=:reason, status=:status, justification=:justification WHERE id=:id";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':date' => $input['date'] ?? null,
            ':reason' => $input['reason'] ?? '',
            ':status' => $input['status'] ?? 'pending',
            ':justification' => $input['justification'] ?? ''
        ]);
        echo json_encode(['success' => true, 'message' => 'Absence mise à jour.']);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $stmt = $db->prepare("DELETE FROM absences WHERE id=:id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'message' => 'Absence supprimée.']);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur serveur : " . $e->getMessage()]);
}
?>
