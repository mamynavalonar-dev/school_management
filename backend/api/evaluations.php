<?php
/**
 * evaluations.php - Gestion des évaluations
 * GET    - Liste toutes les évaluations (avec jointures)
 * POST   - Créer une évaluation
 * PUT    ?id=X - Modifier une évaluation
 * DELETE ?id=X - Supprimer une évaluation
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

// Rôles autorisés
$allowedRoles = [];
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $allowedRoles = ['admin', 'directeur', 'teacher', 'student'];
} else {
    $allowedRoles = ['admin', 'directeur', 'teacher'];
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

function getEvaluationSessionTeacherId($db) {
    $stmt = $db->prepare('SELECT id FROM teachers WHERE user_id = :user_id');
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int)$id;
}

function teacherIsAssignedToCourse($db, $teacherId, $courseId) {
    $stmt = $db->prepare("
        SELECT 1
        FROM planning_schedules
        WHERE teacher_id = :teacher_id AND course_id = :course_id
        LIMIT 1
    ");
    $stmt->execute([':teacher_id' => $teacherId, ':course_id' => $courseId]);
    return (bool)$stmt->fetchColumn();
}

try {
    if ($method === 'GET') {
        $conditions = [];
        $params = [];
        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getEvaluationSessionTeacherId($db);
            if ($teacherId === null) {
                echo json_encode(['success' => true, 'data' => []]);
                exit();
            }
            $conditions[] = 'e.teacher_id = :teacher_id';
            $params[':teacher_id'] = $teacherId;
        } elseif ($_SESSION['user_role'] === 'student') {
            $conditions[] = "EXISTS (
                SELECT 1
                FROM students current_student
                INNER JOIN enrollments current_enrollment
                    ON current_enrollment.student_id = current_student.id
                   AND current_enrollment.status = 'Enrolled'
                WHERE current_student.user_id = :current_user_id
                  AND current_enrollment.level_id = e.level_id
                  AND COALESCE(current_enrollment.specialization_id, 0) = COALESCE(e.specialization_id, 0)
            )";
            $params[':current_user_id'] = $_SESSION['user_id'];
        }
        $whereClause = empty($conditions) ? '' : 'WHERE ' . implode(' AND ', $conditions);

        $query = "
            SELECT e.*,
                   c.name AS course_name,
                   CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
                   r.name AS room_name,
                   et.name AS evaluation_type_name,
                   l.name AS level_name,
                   s.name AS specialization_name
            FROM evaluations e
            LEFT JOIN courses c ON e.course_id = c.id
            LEFT JOIN teachers t ON e.teacher_id = t.id
            LEFT JOIN rooms r ON e.room_id = r.id
            LEFT JOIN evaluation_types et ON e.evaluation_type_id = et.id
            LEFT JOIN levels l ON e.level_id = l.id
            LEFT JOIN specializations s ON e.specialization_id = s.id
            $whereClause
            ORDER BY e.evaluation_date DESC
        ";
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    }
    elseif ($method === 'POST') {
        $required = ['title', 'course_id', 'teacher_id', 'room_id', 'evaluation_type_id', 'date', 'time', 'duration'];
        foreach ($required as $k) {
            if (!is_array($input) || !isset($input[$k]) || $input[$k] === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Champ '$k' manquant."]);
                exit();
            }
        }

        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getEvaluationSessionTeacherId($db);
            if ($teacherId === null
                || (int)$input['teacher_id'] !== $teacherId
                || !teacherIsAssignedToCourse($db, $teacherId, (int)$input['course_id'])) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => "Vous ne pouvez créer une évaluation que pour l'un de vos cours."]);
                exit();
            }
        }

        $duration = filter_var($input['duration'], FILTER_VALIDATE_INT);
        if ($duration === false || $duration < 1 || $duration > 1440) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'La durée doit être comprise entre 1 et 1440 minutes.']);
            exit();
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['date']) || !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $input['time'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Date ou heure invalide.']);
            exit();
        }

        $courseStmt = $db->prepare('SELECT level_id, specialization_id FROM courses WHERE id = :id');
        $courseStmt->execute([':id' => intval($input['course_id'])]);
        $course = $courseStmt->fetch(PDO::FETCH_ASSOC);
        if (!$course) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Cours invalide.']);
            exit();
        }

        $enrollmentStmt = $db->prepare("
            SELECT COUNT(DISTINCT student_id)
            FROM enrollments
            WHERE status = 'Enrolled'
              AND level_id = :level_id
              AND COALESCE(specialization_id, 0) = COALESCE(:specialization_id, 0)
        ");
        $enrollmentStmt->execute([
            ':level_id' => $course['level_id'],
            ':specialization_id' => $course['specialization_id'],
        ]);
        $registeredStudents = (int)$enrollmentStmt->fetchColumn();

        $sql = "
            INSERT INTO evaluations
            (title, course_id, teacher_id, room_id, evaluation_type_id, evaluation_date, evaluation_time, duration_minutes, level_id, specialization_id, status, registered_students, completed_grades)
            VALUES
            (:title, :course_id, :teacher_id, :room_id, :evaluation_type_id, :date, :time, :duration, :level_id, :specialization_id, 'upcoming', :registered_students, 0)
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':title' => $input['title'],
            ':course_id' => $input['course_id'],
            ':teacher_id' => $input['teacher_id'],
            ':room_id' => $input['room_id'],
            ':evaluation_type_id' => $input['evaluation_type_id'],
            ':date' => $input['date'],
            ':time' => $input['time'],
            ':duration' => $duration,
            ':level_id' => $course['level_id'],
            ':specialization_id' => $course['specialization_id'],
            ':registered_students' => $registeredStudents,
        ]);
        http_response_code(201);
        echo json_encode(['success' => true, 'message' => 'Évaluation créée.', 'id' => $db->lastInsertId()]);
    }
    elseif ($method === 'PUT' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        $existingStmt = $db->prepare('SELECT teacher_id, course_id FROM evaluations WHERE id = :id');
        $existingStmt->execute([':id' => $id]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Évaluation introuvable.']);
            exit();
        }

        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getEvaluationSessionTeacherId($db);
            $targetTeacherId = isset($input['teacher_id']) ? (int)$input['teacher_id'] : (int)$existing['teacher_id'];
            $targetCourseId = isset($input['course_id']) ? (int)$input['course_id'] : (int)$existing['course_id'];
            if ($teacherId === null
                || (int)$existing['teacher_id'] !== $teacherId
                || $targetTeacherId !== $teacherId
                || !teacherIsAssignedToCourse($db, $teacherId, $targetCourseId)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Vous ne pouvez modifier que vos propres évaluations.']);
                exit();
            }
        }

        $fieldMap = [
            'title' => 'title',
            'course_id' => 'course_id',
            'teacher_id' => 'teacher_id',
            'room_id' => 'room_id',
            'evaluation_type_id' => 'evaluation_type_id',
            'date' => 'evaluation_date',
            'time' => 'evaluation_time',
            'duration' => 'duration_minutes',
            'level_id' => 'level_id',
            'specialization_id' => 'specialization_id',
            'status' => 'status',
            'registered_students' => 'registered_students',
            'completed_grades' => 'completed_grades',
        ];

        if (isset($input['duration'])) {
            $duration = filter_var($input['duration'], FILTER_VALIDATE_INT);
            if ($duration === false || $duration < 1 || $duration > 1440) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'La durée doit être comprise entre 1 et 1440 minutes.']);
                exit();
            }
            $input['duration'] = $duration;
        }

        $updates = [];
        $params = [':id' => $id];
        foreach ($fieldMap as $inputField => $column) {
            $k = $inputField;
            if (isset($input[$k])) {
                $updates[] = "$column = :$k";
                $params[":$k"] = $input[$k];
            }
        }
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Aucune donnée à mettre à jour.']);
            exit();
        }
        $sql = "UPDATE evaluations SET " . implode(', ', $updates) . " WHERE id = :id";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['success' => true, 'message' => 'Évaluation mise à jour.']);
    }
    elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $id = intval($_GET['id']);
        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getEvaluationSessionTeacherId($db);
            $ownerStmt = $db->prepare('SELECT teacher_id FROM evaluations WHERE id = :id');
            $ownerStmt->execute([':id' => $id]);
            $ownerId = $ownerStmt->fetchColumn();
            if ($ownerId === false) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Évaluation introuvable.']);
                exit();
            }
            if ($teacherId === null || (int)$ownerId !== $teacherId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Vous ne pouvez supprimer que vos propres évaluations.']);
                exit();
            }
        }
        $stmt = $db->prepare("DELETE FROM evaluations WHERE id = :id");
        $stmt->execute([':id' => $id]);
        echo json_encode(['success' => true, 'message' => 'Évaluation supprimée.']);
    }
    else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log('PDOException in evaluations.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
} catch (Exception $e) {
    error_log('Exception in evaluations.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
