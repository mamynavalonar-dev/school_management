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
        $stmt = $db->query("SELECT * FROM grades");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $sql = "INSERT INTO grades (student_id, student_name, student_number, evaluation_id, evaluation_title, course_name, score, max_score, status, grade_date, is_absent) 
                VALUES (:student_id, :student_name, :student_number, :evaluation_id, :evaluation_title, :course_name, :score, :max_score, :status, :grade_date, :is_absent)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':student_id' => $input['student_id'] ?? null,
            ':student_name' => $input['student_name'] ?? '',
            ':student_number' => $input['student_number'] ?? '',
            ':evaluation_id' => $input['evaluation_id'] ?? null,
            ':evaluation_title' => $input['evaluation_title'] ?? '',
            ':course_name' => $input['course_name'] ?? '',
            ':score' => $input['score'] ?? null,
            ':max_score' => $input['max_score'] ?? 20,
            ':status' => $input['status'] ?? 'pending',
            ':grade_date' => $input['grade_date'] ?? null,
            ':is_absent' => isset($input['is_absent']) ? (int)$input['is_absent'] : 0
        ]);
        echo json_encode(['success' => true, 'message' => 'Note ajoutée.', 'id' => $db->lastInsertId()]);
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $sql = "UPDATE grades SET score=:score, max_score=:max_score, status=:status, is_absent=:is_absent WHERE id=:id";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':score' => $input['score'] ?? null,
            ':max_score' => $input['max_score'] ?? 20,
            ':status' => $input['status'] ?? 'pending',
            ':is_absent' => isset($input['is_absent']) ? (int)$input['is_absent'] : 0
        ]);
        echo json_encode(['success' => true, 'message' => 'Note mise à jour.']);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $stmt = $db->prepare("DELETE FROM grades WHERE id=:id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'message' => 'Note supprimée.']);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur serveur : " . $e->getMessage()]);
}
?>
