<?php
header("Access-Control-Allow-Origin: http://localhost:5174");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM planning_schedules");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $sql = "INSERT INTO planning_schedules (course_id, course_name, teacher_id, teacher_name, room_id, room_name, level, specialization, day_of_week, start_time, end_time, type, color) 
                VALUES (:course_id, :course_name, :teacher_id, :teacher_name, :room_id, :room_name, :level, :specialization, :day_of_week, :start_time, :end_time, :type, :color)";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':course_id' => $input['courseId'] ?? null,
            ':course_name' => $input['courseName'] ?? '',
            ':teacher_id' => $input['teacherId'] ?? null,
            ':teacher_name' => $input['teacherName'] ?? '',
            ':room_id' => $input['roomId'] ?? null,
            ':room_name' => $input['roomName'] ?? '',
            ':level' => $input['level'] ?? '',
            ':specialization' => $input['specialization'] ?? '',
            ':day_of_week' => $input['dayOfWeek'] ?? null,
            ':start_time' => $input['startTime'] ?? '',
            ':end_time' => $input['endTime'] ?? '',
            ':type' => $input['type'] ?? '',
            ':color' => $input['color'] ?? 'bg-indigo-500'
        ]);
        echo json_encode(['success' => true, 'message' => 'Planification créée.', 'id' => $db->lastInsertId()]);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $stmt = $db->prepare("DELETE FROM planning_schedules WHERE id=:id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'message' => 'Planification supprimée.']);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in planning.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>


