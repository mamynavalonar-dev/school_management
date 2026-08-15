<?php
header('Content-Type: application/json; charset=utf-8');
require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept, Authorization, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config/database.php';
require_once '../config/auth_guard.php';

if (!in_array($_SESSION['user_role'] ?? '', ['admin', 'directeur'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès réservé à la direction.']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

function send_json($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

try {
    $action = isset($_GET['action']) ? $_GET['action'] : null;
    if (!$action) {
        send_json(400, ['success'=>false, 'message'=>'Paramètre "action" manquant.']);
    }

    switch ($action) {
        case 'stats':
            $studentStats = $db->query("
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(status = 'active'), 0) AS active,
                    COALESCE(SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 0) AS new_students
                FROM students
            ")->fetch(PDO::FETCH_ASSOC);

            $teacherStats = $db->query("
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(status = 'active'), 0) AS active
                FROM teachers
            ")->fetch(PDO::FETCH_ASSOC);

            $courseStats = $db->query("
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(is_mandatory = 1), 0) AS mandatory
                FROM courses
            ")->fetch(PDO::FETCH_ASSOC);

            $roomStats = $db->query("
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(is_available = 1), 0) AS available
                FROM rooms
            ")->fetch(PDO::FETCH_ASSOC);

            $gradeStats = $db->query("
                SELECT
                    COALESCE(SUM(status = 'pending'), 0) AS pending,
                    COALESCE(SUM(status = 'completed' OR score IS NOT NULL), 0) AS completed
                FROM grades
            ")->fetch(PDO::FETCH_ASSOC);

            $absenceStats = $db->query("
                SELECT
                    COALESCE(SUM(date = CURDATE()), 0) AS today,
                    COALESCE(SUM(date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS this_month
                FROM absences
            ")->fetch(PDO::FETCH_ASSOC);

            $evaluationStats = $db->query("
                SELECT
                    COALESCE(SUM(evaluation_date >= CURDATE()), 0) AS upcoming,
                    COALESCE(SUM(evaluation_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                        AND evaluation_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)), 0) AS this_month
                FROM evaluations
            ")->fetch(PDO::FETCH_ASSOC);

            $trendStmt = $db->query("
                SELECT
                    DATE_FORMAT(enrollment_date, '%Y-%m') AS period,
                    COUNT(*) AS value
                FROM enrollments
                WHERE enrollment_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01')
                GROUP BY DATE_FORMAT(enrollment_date, '%Y-%m')
                ORDER BY period
            ");
            $enrollmentTrend = array_map(static function ($row) {
                return ['period' => $row['period'], 'value' => (int)$row['value']];
            }, $trendStmt->fetchAll(PDO::FETCH_ASSOC));

            $distributionStmt = $db->query("
                SELECT sp.name AS label, COUNT(DISTINCT e.student_id) AS value
                FROM enrollments e
                INNER JOIN specializations sp ON sp.id = e.specialization_id
                WHERE e.status = 'Enrolled'
                GROUP BY sp.id, sp.name
                ORDER BY value DESC, sp.name
            ");
            $specializationDistribution = array_map(static function ($row) {
                return ['label' => $row['label'], 'value' => (int)$row['value']];
            }, $distributionStmt->fetchAll(PDO::FETCH_ASSOC));

            $data = [
                'students' => [
                    'total' => (int)$studentStats['total'],
                    'new' => (int)$studentStats['new_students'],
                    'active' => (int)$studentStats['active'],
                ],
                'teachers' => [
                    'total' => (int)$teacherStats['total'],
                    'active' => (int)$teacherStats['active'],
                ],
                'courses' => [
                    'total' => (int)$courseStats['total'],
                    'mandatory' => (int)$courseStats['mandatory'],
                ],
                'rooms' => [
                    'total' => (int)$roomStats['total'],
                    'available' => (int)$roomStats['available'],
                ],
                'grades' => [
                    'pending' => (int)$gradeStats['pending'],
                    'completed' => (int)$gradeStats['completed'],
                ],
                'absences' => [
                    'today' => (int)$absenceStats['today'],
                    'thisMonth' => (int)$absenceStats['this_month'],
                ],
                'evaluations' => [
                    'upcoming' => (int)$evaluationStats['upcoming'],
                    'thisMonth' => (int)$evaluationStats['this_month'],
                ],
                'enrollment_trend' => $enrollmentTrend,
                'specialization_distribution' => $specializationDistribution,
            ];
            send_json(200, ['success'=>true, 'data'=>$data]);
            break;
        case 'activities':
            $stmt = $db->query("
                SELECT recent.id, recent.type, recent.description, recent.actor, recent.activity_time
                FROM (
                    SELECT
                        CONCAT('grade-', g.id) AS id,
                        'grade' AS type,
                        CONCAT('Note enregistrée en ', c.name) AS description,
                        'Notes' AS actor,
                        g.created_at AS activity_time
                    FROM grades g
                    INNER JOIN evaluations ev ON ev.id = g.evaluation_id
                    INNER JOIN courses c ON c.id = ev.course_id
                    UNION ALL
                    SELECT
                        CONCAT('absence-', a.id) AS id,
                        'absence' AS type,
                        CONCAT('Absence enregistrée en ', c.name) AS description,
                        'Absences' AS actor,
                        a.created_at AS activity_time
                    FROM absences a
                    INNER JOIN courses c ON c.id = a.course_id
                    UNION ALL
                    SELECT
                        CONCAT('course-', id) AS id,
                        'course' AS type,
                        CONCAT('Cours créé : ', name) AS description,
                        'Cours' AS actor,
                        created_at AS activity_time
                    FROM courses
                ) recent
                WHERE recent.activity_time IS NOT NULL
                ORDER BY recent.activity_time DESC
                LIMIT 10
            ");
            $data = array_map(static function ($row) {
                return [
                    'id' => $row['id'],
                    'type' => $row['type'],
                    'description' => $row['description'],
                    'user' => $row['actor'],
                    'time' => $row['activity_time'],
                ];
            }, $stmt->fetchAll(PDO::FETCH_ASSOC));
            send_json(200, ['success'=>true, 'data'=>$data]);
            break;
        case 'upcoming':
            $stmt = $db->query("
                SELECT events.id, events.title, events.event_date, events.event_time, events.type
                FROM (
                    SELECT
                        CONCAT('evaluation-', e.id) AS id,
                        CONCAT(e.title, IF(c.name IS NULL OR c.name = '', '', CONCAT(' - ', c.name))) AS title,
                        e.evaluation_date AS event_date,
                        COALESCE(NULLIF(e.evaluation_time, ''), '00:00') AS event_time,
                        'exam' AS type
                    FROM evaluations e
                    LEFT JOIN courses c ON c.id = e.course_id
                    WHERE e.evaluation_date >= CURDATE()
                      AND (e.status IS NULL OR e.status NOT IN ('cancelled', 'completed'))
                    UNION ALL
                    SELECT
                        CONCAT('booking-', rb.id) AS id,
                        rb.title,
                        rb.booking_date AS event_date,
                        TIME_FORMAT(rb.start_time, '%H:%i') AS event_time,
                        'meeting' AS type
                    FROM room_bookings rb
                    WHERE rb.booking_date >= CURDATE() AND rb.status = 'confirmed'
                ) events
                ORDER BY events.event_date, events.event_time
                LIMIT 10
            ");
            $data = array_map(static function ($row) {
                return [
                    'id' => $row['id'],
                    'title' => $row['title'],
                    'date' => $row['event_date'],
                    'time' => substr((string)$row['event_time'], 0, 5),
                    'type' => $row['type'],
                ];
            }, $stmt->fetchAll(PDO::FETCH_ASSOC));
            send_json(200, ['success'=>true, 'data'=>$data]);
            break;
        default:
            send_json(404, ['success'=>false, 'message'=>'Action inconnue']);
            break;
    }
} catch (Throwable $e) {
    error_log("Throwable in dashboard.php: " . $e->getMessage());
    send_json(500, ['success'=>false, 'message'=>'Une erreur serveur est survenue.']);
}
?>
