<?php
require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';
require_once '../config/academic_progress.php';

$db = (new Database())->getConnection();
$role = $_SESSION['user_role'] ?? '';
$userId = (int)($_SESSION['user_id'] ?? 0);
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?: [];

function policyReply(int $status, bool $success, ?string $message = null, $data = null): void {
    http_response_code($status);
    $payload = ['success' => $success];
    if ($message !== null) $payload['message'] = $message;
    if ($data !== null) $payload['data'] = $data;
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

if (!in_array($role, ['admin', 'directeur'], true)) policyReply(403, false, 'Accès réservé à l’administration et à la direction.');

try {
    if ($method === 'GET') {
        $policy = getActiveAcademicPolicy($db);
        $blockedStmt = $db->query("SELECT sas.student_id,s.student_number,s.first_name,s.last_name,sas.warning_count,sas.repeat_count,sas.blocked_at,sas.block_reason,u.status account_status
            FROM student_academic_status sas
            JOIN students s ON s.id=sas.student_id
            JOIN users u ON u.id=s.user_id
            WHERE sas.account_blocked=1
            ORDER BY sas.blocked_at DESC, s.last_name, s.first_name");
        $alertsStmt = $db->query("SELECT aa.*,s.student_number,CONCAT(s.first_name,' ',s.last_name) student_name
            FROM academic_alerts aa JOIN students s ON s.id=aa.student_id
            ORDER BY aa.created_at DESC LIMIT 50");
        policyReply(200, true, null, [
            'policy' => $policy,
            'blocked_students' => $blockedStmt->fetchAll(PDO::FETCH_ASSOC),
            'recent_alerts' => $alertsStmt->fetchAll(PDO::FETCH_ASSOC),
        ]);
    }

    if ($method === 'PUT') {
        $warning = filter_var($input['warning_average_threshold'] ?? null, FILTER_VALIDATE_FLOAT);
        $repeatMin = filter_var($input['repeat_min_average'] ?? null, FILTER_VALIDATE_FLOAT);
        $maxWarnings = filter_var($input['max_warnings_before_action'] ?? null, FILTER_VALIDATE_INT);
        $maxRepeats = filter_var($input['max_repeat_count'] ?? null, FILTER_VALIDATE_INT);
        if ($warning === false || $warning < 0 || $warning > 20 || $repeatMin === false || $repeatMin < 0 || $repeatMin > 20 || $repeatMin > $warning) {
            policyReply(400, false, 'Les seuils doivent être compris entre 0 et 20, et le seuil de redoublement ne peut pas dépasser le seuil d’avertissement.');
        }
        if ($maxWarnings === false || $maxWarnings < 1 || $maxWarnings > 20 || $maxRepeats === false || $maxRepeats < 0 || $maxRepeats > 10) {
            policyReply(400, false, 'Nombre d’avertissements ou de redoublements invalide.');
        }
        $current = getActiveAcademicPolicy($db);
        if (!empty($current['id'])) {
            $stmt = $db->prepare('UPDATE academic_progress_policies SET warning_average_threshold=:warning,repeat_min_average=:repeat_min,max_warnings_before_action=:max_warnings,max_repeat_count=:max_repeats,updated_by=:user WHERE id=:id');
            $stmt->execute([':warning'=>$warning, ':repeat_min'=>$repeatMin, ':max_warnings'=>$maxWarnings, ':max_repeats'=>$maxRepeats, ':user'=>$userId, ':id'=>(int)$current['id']]);
        } else {
            $stmt = $db->prepare('INSERT INTO academic_progress_policies (warning_average_threshold,repeat_min_average,max_warnings_before_action,max_repeat_count,created_by,updated_by) VALUES (:warning,:repeat_min,:max_warnings,:max_repeats,:user,:user_again)');
            $stmt->execute([':warning'=>$warning, ':repeat_min'=>$repeatMin, ':max_warnings'=>$maxWarnings, ':max_repeats'=>$maxRepeats, ':user'=>$userId, ':user_again'=>$userId]);
        }
        policyReply(200, true, 'Politique académique enregistrée.', getActiveAcademicPolicy($db));
    }

    if ($method === 'POST' && ($_GET['action'] ?? '') === 'reactivate') {
        $studentId = filter_var($input['student_id'] ?? null, FILTER_VALIDATE_INT);
        if ($studentId === false || $studentId < 1) policyReply(400, false, 'Étudiant invalide.');
        reactivateAcademicStudent($db, (int)$studentId, $userId);
        policyReply(200, true, 'Compte étudiant réactivé.');
    }

    policyReply(405, false, 'Méthode non autorisée.');
} catch (Throwable $e) {
    error_log('academic_policies.php: '.$e->getMessage());
    policyReply(500, false, 'Erreur lors de la gestion de la politique académique.');
}
