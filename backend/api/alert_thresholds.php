<?php
require_once '../models/AlertThreshold.php';

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
require_once '../config/feature_permissions.php';

// Role-based access control - only teachers and admins can manage alert thresholds
$allowedRoles = [];
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $allowedRoles = ['admin', 'directeur', 'teacher'];
} else {
    // POST, PUT, DELETE
    $allowedRoles = ['admin', 'directeur', 'teacher'];
}
if (!in_array($_SESSION['user_role'], $allowedRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$featurePermissions = loadFeaturePermissions(
    $db,
    (int)($_SESSION['user_id'] ?? 0),
    (string)($_SESSION['user_role'] ?? '')
);
$alertThreshold = new AlertThreshold($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

function getAlertSessionTeacherId($db) {
    if ($_SESSION['user_role'] !== 'teacher') return null;
    $stmt = $db->prepare('SELECT id FROM teachers WHERE user_id = :user_id');
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int)$id;
}

function alertCourseBelongsToTeacher($db, $teacherId, $courseId) {
    if ($courseId === null) return true;
    $stmt = $db->prepare('
        SELECT 1 FROM planning_schedules
        WHERE teacher_id = :teacher_id AND course_id = :course_id
        LIMIT 1
    ');
    $stmt->execute([':teacher_id' => $teacherId, ':course_id' => $courseId]);
    return (bool)$stmt->fetchColumn();
}

$sessionTeacherId = getAlertSessionTeacherId($db);
if ($_SESSION['user_role'] === 'teacher' && $sessionTeacherId === null) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Aucun profil enseignant associé à ce compte.']);
    exit();
}

try {
    if ($method === 'GET') {
        // Get alert thresholds
        if (isset($_GET['teacher_id'])) {
            // Get thresholds for specific teacher
            $teacherId = intval($_GET['teacher_id']);
            // Verify permission: teachers can only see their own thresholds unless admin/directeur
            if ($_SESSION['user_role'] === 'teacher' && $teacherId !== $sessionTeacherId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Accès refusé - vous ne pouvez voir que vos propres seuils']);
                exit();
            }
            $stmt = $alertThreshold->readByTeacher($teacherId);
        } else {
            // Get all thresholds (admin/directeur only)
            if ($_SESSION['user_role'] === 'teacher') {
                // Teachers can only see their own thresholds
                $stmt = $alertThreshold->readByTeacher($sessionTeacherId);
            } else {
                // Admin/directeur can see all
                $stmt = $alertThreshold->readAll();
            }
        }
        $rows = array_values(array_filter(
            $stmt->fetchAll(PDO::FETCH_ASSOC),
            static fn($row) => $row['metric'] === 'average_below'
                ? !empty($featurePermissions['grades']['view'])
                : !empty($featurePermissions['absences']['view'])
        ));
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        // Create new alert threshold
        $required = ['metric', 'threshold_value'];
        foreach ($required as $k) {
            if (empty($input[$k])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Champ $k manquant."]);
                exit();
            }
        }

        // Validate metric
        $allowedMetrics = ['average_below', 'absences_above'];
        if (!in_array($input['metric'], $allowedMetrics)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Métrique invalide. Valeurs autorisées: average_below, absences_above"]);
            exit();
        }
        enforceFeaturePermission($db, $input['metric'] === 'average_below' ? 'grades' : 'absences', true);

        // Teachers can only create thresholds for themselves unless admin/directeur
        $targetTeacherId = $_SESSION['user_role'] === 'teacher'
            ? $sessionTeacherId
            : intval($input['teacher_id'] ?? 0);
        if ($targetTeacherId < 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Enseignant requis.']);
            exit();
        }

        // Validate course_id if provided (teachers can only set thresholds for their own courses)
        $targetCourseId = !empty($input['course_id']) ? intval($input['course_id']) : null;
        if ($_SESSION['user_role'] === 'teacher'
            && !alertCourseBelongsToTeacher($db, $sessionTeacherId, $targetCourseId)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => "Ce cours ne vous appartient pas."]);
            exit();
        }

        $alertThreshold->teacher_id = $targetTeacherId;
        $alertThreshold->course_id = $targetCourseId;
        $alertThreshold->metric = $input['metric'];
        $alertThreshold->threshold_value = floatval($input['threshold_value']);
        $alertThreshold->is_active = isset($input['is_active']) ? boolval($input['is_active']) : true;

        if ($alertThreshold->create()) {
            // Log audit entry
            $userId = $_SESSION['user_id'] ?? null;
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $action = 'CREATE';
            $tableName = 'alert_thresholds';
            $recordId = $alertThreshold->id;

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
            echo json_encode(['success' => true, 'message' => 'Seuil d\'alerte créé.', 'id' => $alertThreshold->id]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la création du seuil d'alerte."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $alertThreshold->id = intval($_GET['id']);

        // First, get the existing threshold to check permissions
        $existing = $alertThreshold->readOne();
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Seuil d\'alerte non trouvé.']);
            exit();
        }
        // Check permissions: teachers can only modify their own thresholds unless admin/directeur
        if ($_SESSION['user_role'] === 'teacher' && (int)$existing['teacher_id'] !== $sessionTeacherId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Accès refusé - vous ne pouvez modifier que vos propres seuils']);
            exit();
        }

        $updateData = $input ?? [];
        foreach (['teacher_id','course_id','metric','threshold_value','is_active'] as $k) {
            if (isset($updateData[$k])) $alertThreshold->$k = $updateData[$k];
        }

        // Validate metric if being updated
        if (isset($updateData['metric'])) {
            $allowedMetrics = ['average_below', 'absences_above'];
            if (!in_array($updateData['metric'], $allowedMetrics)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Métrique invalide. Valeurs autorisées: average_below, absences_above"]);
                exit();
            }
        }
        $effectiveMetric = $updateData['metric'] ?? $existing['metric'];
        enforceFeaturePermission($db, $effectiveMetric === 'average_below' ? 'grades' : 'absences', true);

        // Validate course_id if being updated (teachers can only set thresholds for their own courses)
        if (isset($updateData['course_id']) && $_SESSION['user_role'] === 'teacher') {
            $targetCourseId = !empty($updateData['course_id']) ? (int)$updateData['course_id'] : null;
            if (!alertCourseBelongsToTeacher($db, $sessionTeacherId, $targetCourseId)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => "Ce cours ne vous appartient pas."]);
                exit();
            }
        }

        // Prevent teachers from changing teacher_id
        if ($_SESSION['user_role'] === 'teacher' && isset($updateData['teacher_id']) && intval($updateData['teacher_id']) !== $sessionTeacherId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Accès refusé - vous ne pouvez pas changer le propriétaire du seuil']);
            exit();
        }

        if ($alertThreshold->update()) {
            // Log audit entry
            $userId = $_SESSION['user_id'] ?? null;
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $action = 'UPDATE';
            $tableName = 'alert_thresholds';
            $recordId = $alertThreshold->id;

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

            echo json_encode(['success' => true, 'message' => 'Seuil d\'alerte mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la modification du seuil d'alerte."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $alertThreshold->id = intval($_GET['id']);

        // First, get the existing threshold to check permissions
        $existing = $alertThreshold->readOne();
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Seuil d\'alerte non trouvé.']);
            exit();
        }
        // Check permissions: teachers can only delete their own thresholds unless admin/directeur
        if ($_SESSION['user_role'] === 'teacher' && (int)$existing['teacher_id'] !== $sessionTeacherId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Accès refusé - vous ne pouvez supprimer que vos propres seuils']);
            exit();
        }
        enforceFeaturePermission($db, $existing['metric'] === 'average_below' ? 'grades' : 'absences', true);

        if ($alertThreshold->delete()) {
            // Log audit entry
            $userId = $_SESSION['user_id'] ?? null;
            $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
            $action = 'DELETE';
            $tableName = 'alert_thresholds';
            $recordId = $alertThreshold->id;

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

            echo json_encode(['success' => true, 'message' => 'Seuil d\'alerte supprimé.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la suppression du seuil d'alerte."]);
        }
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in alert_thresholds.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
