<?php
require_once '../models/Course.php';

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
$course = new Course($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        if (in_array($_SESSION['user_role'], ['admin', 'directeur'], true)) {
            $stmt = $course->read();
        } elseif ($_SESSION['user_role'] === 'teacher') {
            $stmt = $db->prepare("
                SELECT DISTINCT c.*, l.name AS level_name, s.name AS specialization_name
                FROM courses c
                INNER JOIN planning_schedules ps ON ps.course_id = c.id
                INNER JOIN teachers t ON t.id = ps.teacher_id
                LEFT JOIN levels l ON l.id = c.level_id
                LEFT JOIN specializations s ON s.id = c.specialization_id
                WHERE t.user_id = :user_id
                ORDER BY c.name
            ");
            $stmt->execute([':user_id' => $_SESSION['user_id']]);
        } else {
            $stmt = $db->prepare("
                SELECT DISTINCT c.*, l.name AS level_name, sp.name AS specialization_name
                FROM courses c
                INNER JOIN enrollments e
                    ON e.level_id = c.level_id
                   AND COALESCE(e.specialization_id, 0) = COALESCE(c.specialization_id, 0)
                   AND e.status = 'Enrolled'
                INNER JOIN students st ON st.id = e.student_id
                LEFT JOIN levels l ON l.id = c.level_id
                LEFT JOIN specializations sp ON sp.id = c.specialization_id
                WHERE st.user_id = :user_id
                ORDER BY c.name
            ");
            $stmt->execute([':user_id' => $_SESSION['user_id']]);
        }
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $required = ['code','name','level_id','specialization_id'];
        foreach ($required as $k) {
            if (empty($input[$k])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Champ $k manquant."]);
                exit();
            }
        }
        // Validation complémentaire (type, crédits, etc)
        $course->code = $input['code'];
        $course->name = $input['name'];
        $course->description = $input['description'] ?? '';
        $course->credits = intval($input['credits'] ?? 3);
        $course->hours_per_week = intval($input['hours_per_week'] ?? 2);
        $course->course_type = $input['course_type'] ?? 'Theory';
        $course->level_id = intval($input['level_id']);
        $course->specialization_id = intval($input['specialization_id']);
        $course->is_mandatory = (isset($input['is_mandatory']) ? boolval($input['is_mandatory']) : true);

        if ($course->create()) {
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Cours créé.', 'id' => $course->id]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la création du cours."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $course->id = intval($_GET['id']);
        // Lecture et validation des données existantes
        // (Implémenter metode read_single si besoin)
        $updateData = $input ?? [];
        foreach (['code','name','description','credits','hours_per_week','course_type','level_id','specialization_id','is_mandatory'] as $k) {
            if (isset($updateData[$k])) $course->$k = $updateData[$k];
        }
        if ($course->update()) {
            echo json_encode(['success' => true, 'message' => 'Cours mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la modification du cours."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $course->id = intval($_GET['id']);
        // (Lire/exister d'abord si besoin)
        if ($course->delete()) {
            echo json_encode(['success' => true, 'message' => 'Cours supprimé.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la suppression du cours."]);
        }
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in courses.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
