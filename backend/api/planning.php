<?php
require_once '../models/PlanningSchedule.php';

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
    // Le planning global est administré par la direction. Les enseignants
    // consultent uniquement leurs créneaux, sans pouvoir s'auto-affecter un cours.
    $allowedRoles = ['admin', 'directeur'];
}
if (!in_array($_SESSION['user_role'], $allowedRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$planning = new PlanningSchedule($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

function validateScheduleInput($data) {
    $required = ['course_id', 'teacher_id', 'room_id', 'level_id', 'specialization_id', 'day_of_week', 'start_time', 'end_time', 'type'];
    foreach ($required as $key) {
        if (!isset($data[$key]) || $data[$key] === '') {
            return "Champ $key manquant.";
        }
    }

    $dayOfWeek = filter_var($data['day_of_week'], FILTER_VALIDATE_INT);
    if ($dayOfWeek === false || $dayOfWeek < 1 || $dayOfWeek > 7) {
        return 'Le jour de la semaine doit être compris entre 1 et 7.';
    }

    if (!preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $data['start_time'])
        || !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $data['end_time'])) {
        return 'Les horaires sont invalides.';
    }

    if (substr($data['start_time'], 0, 5) >= substr($data['end_time'], 0, 5)) {
        return "L'heure de fin doit être postérieure à l'heure de début.";
    }

    return null;
}

function findScheduleConflict($db, $data, $excludeId = null) {
    $sql = "
        SELECT id, room_id, teacher_id
        FROM planning_schedules
        WHERE day_of_week = :day_of_week
          AND start_time < :end_time
          AND end_time > :start_time
          AND (room_id = :room_id OR teacher_id = :teacher_id)
    ";
    if ($excludeId !== null) {
        $sql .= ' AND id <> :exclude_id';
    }

    $stmt = $db->prepare($sql);
    $stmt->bindValue(':day_of_week', intval($data['day_of_week']), PDO::PARAM_INT);
    $stmt->bindValue(':end_time', $data['end_time']);
    $stmt->bindValue(':start_time', $data['start_time']);
    $stmt->bindValue(':room_id', intval($data['room_id']), PDO::PARAM_INT);
    $stmt->bindValue(':teacher_id', intval($data['teacher_id']), PDO::PARAM_INT);
    if ($excludeId !== null) {
        $stmt->bindValue(':exclude_id', intval($excludeId), PDO::PARAM_INT);
    }
    $stmt->execute();
    $conflicts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($conflicts as $conflict) {
        if ((int)$conflict['room_id'] === (int)$data['room_id']) {
            return 'Cette salle est déjà occupée sur ce créneau.';
        }
    }
    foreach ($conflicts as $conflict) {
        if ((int)$conflict['teacher_id'] === (int)$data['teacher_id']) {
            return 'Cet enseignant a déjà un cours sur ce créneau.';
        }
    }

    return null;
}

try {
    // Dans planning.php, vers la ligne où se trouve la méthode GET
        if ($method === 'GET') {
            $conditions = [];
            $params = [];
            if ($_SESSION['user_role'] === 'teacher') {
                $conditions[] = 'EXISTS (
                    SELECT 1 FROM teachers current_teacher
                    WHERE current_teacher.id = ps.teacher_id
                      AND current_teacher.user_id = :current_user_id
                )';
                $params[':current_user_id'] = $_SESSION['user_id'];
            } elseif ($_SESSION['user_role'] === 'student') {
                $conditions[] = 'EXISTS (
                    SELECT 1
                    FROM students current_student
                    INNER JOIN enrollments current_enrollment
                        ON current_enrollment.student_id = current_student.id
                       AND current_enrollment.status = \'Enrolled\'
                    WHERE current_student.user_id = :current_user_id
                      AND current_enrollment.level_id = ps.level_id
                      AND COALESCE(current_enrollment.specialization_id, 0) = COALESCE(ps.specialization_id, 0)
                )';
                $params[':current_user_id'] = $_SESSION['user_id'];
            }
            $whereClause = empty($conditions) ? '' : 'WHERE ' . implode(' AND ', $conditions);

            $query = "SELECT ps.*,
                    c.name as course_name,
                    CONCAT(t.first_name, ' ', t.last_name) as teacher_name,
                    l.name as level_name,
                    s.name as specialization_name,
                    r.name as room_name
                    FROM planning_schedules ps
                    LEFT JOIN courses c ON ps.course_id = c.id
                    LEFT JOIN teachers t ON ps.teacher_id = t.id
                    LEFT JOIN levels l ON ps.level_id = l.id
                    LEFT JOIN specializations s ON ps.specialization_id = s.id
                    LEFT JOIN rooms r ON ps.room_id = r.id
                    $whereClause
                    ORDER BY ps.day_of_week, ps.start_time";
            $stmt = $db->prepare($query);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $rows]);
        } elseif ($method === 'POST') {
        $validationError = validateScheduleInput(is_array($input) ? $input : []);
        if ($validationError !== null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $validationError]);
            exit();
        }

        $planning->course_id = intval($input['course_id']);
        $planning->teacher_id = intval($input['teacher_id']);
        $planning->room_id = intval($input['room_id']);
        $planning->level_id = intval($input['level_id']);
        $planning->specialization_id = intval($input['specialization_id']);
        $planning->day_of_week = intval($input['day_of_week']);
        $planning->start_time = $input['start_time'];
        $planning->end_time = $input['end_time'];
        $planning->type = $input['type'];
        $planning->color = $input['color'] ?? 'bg-indigo-500';

        $conflictMessage = findScheduleConflict($db, $input);
        if ($conflictMessage !== null) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => $conflictMessage]);
            exit();
        }

        if ($planning->create()) {
            // Log audit entry
            $userId = $_SESSION['user_id'] ?? null;
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $action = 'CREATE';
            $tableName = 'planning_schedules';
            $recordId = $planning->id;

            $auditQuery = "INSERT INTO audit_logs (user_id, action, table_name, record_id, ip_address, user_agent)
                          VALUES (:user_id, :action, :table_name, :record_id, :ip_address, :user_agent)";
            $auditStmt = $db->prepare($auditQuery);
            $auditStmt->bindParam(':user_id', $userId);
            $auditStmt->bindParam(':action', $action);
            $auditStmt->bindParam(':table_name', $tableName);
            $auditStmt->bindParam(':record_id', $recordId);
            $auditStmt->bindParam(':ip_address', $ipAddress);
            $auditStmt->bindParam(':user_agent', $userAgent);
            $auditStmt->execute();

            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Planification créée.', 'id' => $planning->id]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la création de la planification."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $planning->id = intval($_GET['id']);
        if (!$planning->readOne()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Planification introuvable.']);
            exit();
        }

        $updateData = $input ?? [];
        foreach (['course_id','teacher_id','room_id','level_id','specialization_id','day_of_week','start_time','end_time','type','color'] as $k) {
            if (isset($updateData[$k])) $planning->$k = $updateData[$k];
        }

        $mergedData = [
            'course_id' => $planning->course_id,
            'teacher_id' => $planning->teacher_id,
            'room_id' => $planning->room_id,
            'level_id' => $planning->level_id,
            'specialization_id' => $planning->specialization_id,
            'day_of_week' => $planning->day_of_week,
            'start_time' => $planning->start_time,
            'end_time' => $planning->end_time,
            'type' => $planning->type,
        ];
        $validationError = validateScheduleInput($mergedData);
        if ($validationError !== null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $validationError]);
            exit();
        }
        $conflictMessage = findScheduleConflict($db, $mergedData, $planning->id);
        if ($conflictMessage !== null) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => $conflictMessage]);
            exit();
        }

        if ($planning->update()) {
            // Log audit entry
            $userId = $_SESSION['user_id'] ?? null;
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $action = 'UPDATE';
            $tableName = 'planning_schedules';
            $recordId = $planning->id;

            $auditQuery = "INSERT INTO audit_logs (user_id, action, table_name, record_id, ip_address, user_agent)
                          VALUES (:user_id, :action, :table_name, :record_id, :ip_address, :user_agent)";
            $auditStmt = $db->prepare($auditQuery);
            $auditStmt->bindParam(':user_id', $userId);
            $auditStmt->bindParam(':action', $action);
            $auditStmt->bindParam(':table_name', $tableName);
            $auditStmt->bindParam(':record_id', $recordId);
            $auditStmt->bindParam(':ip_address', $ipAddress);
            $auditStmt->bindParam(':user_agent', $userAgent);
            $auditStmt->execute();

            echo json_encode(['success' => true, 'message' => 'Planification mise à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la modification de la planification."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $planning->id = intval($_GET['id']);
        if ($planning->delete()) {
            // Log audit entry
            $userId = $_SESSION['user_id'] ?? null;
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $action = 'DELETE';
            $tableName = 'planning_schedules';
            $recordId = $planning->id;

            $auditQuery = "INSERT INTO audit_logs (user_id, action, table_name, record_id, ip_address, user_agent)
                          VALUES (:user_id, :action, :table_name, :record_id, :ip_address, :user_agent)";
            $auditStmt = $db->prepare($auditQuery);
            $auditStmt->bindParam(':user_id', $userId);
            $auditStmt->bindParam(':action', $action);
            $auditStmt->bindParam(':table_name', $tableName);
            $auditStmt->bindParam(':record_id', $recordId);
            $auditStmt->bindParam(':ip_address', $ipAddress);
            $auditStmt->bindParam(':user_agent', $userAgent);
            $auditStmt->execute();

            echo json_encode(['success' => true, 'message' => 'Planification supprimée.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la suppression de la planification."]);
        }
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
