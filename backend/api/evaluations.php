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
        $stmt = $db->query("SELECT * FROM evaluations");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $sql = "INSERT INTO evaluations (title, course_id, course_name, course_code, teacher_id, teacher_name, room_id, room_name, evaluation_type_name, evaluation_date, evaluation_time, duration_minutes, level_name, specialization_name, status, registered_students, completed_grades) 
                VALUES (:title, :course_id, :course_name, :course_code, :teacher_id, :teacher_name, :room_id, :room_name, :evaluation_type_name, :evaluation_date, :evaluation_time, :duration_minutes, :level_name, :specialization_name, :status, :registered_students, :completed_grades)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':title' => $input['title'] ?? '',
            ':course_id' => $input['course_id'] ?? null,
            ':course_name' => $input['course_name'] ?? '',
            ':course_code' => $input['course_code'] ?? '',
            ':teacher_id' => $input['teacher_id'] ?? null,
            ':teacher_name' => $input['teacher_name'] ?? '',
            ':room_id' => $input['room_id'] ?? null,
            ':room_name' => $input['room_name'] ?? '',
            ':evaluation_type_name' => $input['evaluation_type_name'] ?? '',
            ':evaluation_date' => $input['evaluation_date'] ?? null,
            ':evaluation_time' => $input['evaluation_time'] ?? '',
            ':duration_minutes' => $input['duration_minutes'] ?? 120,
            ':level_name' => $input['level_name'] ?? '',
            ':specialization_name' => $input['specialization_name'] ?? '',
            ':status' => $input['status'] ?? 'upcoming',
            ':registered_students' => $input['registered_students'] ?? 0,
            ':completed_grades' => $input['completed_grades'] ?? 0
        ]);
        echo json_encode(['success' => true, 'message' => 'Évaluation créée.', 'id' => $db->lastInsertId()]);
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $sql = "UPDATE evaluations SET title=:title, evaluation_type_name=:evaluation_type_name, evaluation_date=:evaluation_date, evaluation_time=:evaluation_time, duration_minutes=:duration_minutes WHERE id=:id";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':title' => $input['title'] ?? '',
            ':evaluation_type_name' => $input['evaluation_type_name'] ?? '',
            ':evaluation_date' => $input['evaluation_date'] ?? null,
            ':evaluation_time' => $input['evaluation_time'] ?? '',
            ':duration_minutes' => $input['duration_minutes'] ?? 120
        ]);
        echo json_encode(['success' => true, 'message' => 'Évaluation mise à jour.']);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $stmt = $db->prepare("DELETE FROM evaluations WHERE id=:id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'message' => 'Évaluation supprimée.']);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur serveur : " . $e->getMessage()]);
}
?>
