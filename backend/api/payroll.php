<?php
require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$resource = $_GET['resource'] ?? 'overview';
$role = $_SESSION['user_role'] ?? '';
$userId = (int)($_SESSION['user_id'] ?? 0);
$input = json_decode(file_get_contents('php://input'), true) ?: [];

function payrollReply($status, $success, $message = null, $data = null) {
    http_response_code($status);
    $payload = ['success' => $success];
    if ($message !== null) $payload['message'] = $message;
    if ($data !== null) $payload['data'] = $data;
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}
function payrollAdmin($role) {
    if (!in_array($role, ['admin', 'directeur'], true)) payrollReply(403, false, 'Cette action est réservée à l’administration et à la direction.');
}
function payrollRows($db, $sql, $params = []) {
    $stmt = $db->prepare($sql); $stmt->execute($params); return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
function payrollRow($db, $sql, $params = []) {
    $stmt = $db->prepare($sql); $stmt->execute($params); return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}
function payrollMonth($value) {
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string)$value)) payrollReply(400, false, 'Période mensuelle invalide.');
    return $value . '-01';
}
function payrollDate($value) {
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$value);
    if (!$date || $date->format('Y-m-d') !== (string)$value) {
        payrollReply(400, false, 'Date de présence invalide.');
    }
    return (string)$value;
}
function payrollItemSelect() {
    return "SELECT pi.*, CONCAT(t.first_name, ' ', t.last_name) teacher_name, t.teacher_number,
                   pr.period_month, pr.status run_status
            FROM payroll_items pi JOIN teachers t ON t.id = pi.teacher_id
            JOIN payroll_runs pr ON pr.id = pi.payroll_run_id";
}
function calculatePayrollItem($base, $lateMinutes, $absenceCount, $policy, $manual = 0, $bonus = 0) {
    $base = max(0, (float)$base);
    $late = max(0, (float)$lateMinutes * (float)$policy['late_amount_per_minute']);
    $absence = max(0, ($base / max(1, (int)$policy['standard_working_days'])) * (float)$policy['absence_daily_multiplier'] * (int)$absenceCount);
    $cap = $base * max(0, min(100, (float)$policy['maximum_deduction_percent'])) / 100;
    $automatic = min($cap, $late + $absence);
    if ($late + $absence > 0 && $automatic < $late + $absence) {
        $factor = $automatic / ($late + $absence);
        $late *= $factor; $absence *= $factor;
    }
    $manual = max(0, (float)$manual); $bonus = max(0, (float)$bonus);
    return [round($late, 2), round($absence, 2), round(max(0, $base - $late - $absence - $manual + $bonus), 2)];
}

try {
    if (!in_array($role, ['admin', 'directeur', 'teacher'], true)) payrollReply(403, false, 'Accès refusé.');

    if ($method === 'GET') {
        if ($resource === 'overview') {
            payrollAdmin($role);
            $data = [
                'teachers' => payrollRows($db, "SELECT id, teacher_number, first_name, last_name, salary, status FROM teachers ORDER BY last_name, first_name"),
                'policies' => payrollRows($db, 'SELECT * FROM payroll_policies ORDER BY is_active DESC, updated_at DESC'),
                'runs' => payrollRows($db, "SELECT pr.*, pp.name policy_name, COUNT(pi.id) employee_count, COALESCE(SUM(pi.net_salary),0) total_net FROM payroll_runs pr JOIN payroll_policies pp ON pp.id=pr.policy_id LEFT JOIN payroll_items pi ON pi.payroll_run_id=pr.id GROUP BY pr.id ORDER BY pr.period_month DESC"),
            ];
            payrollReply(200, true, null, $data);
        }
        if ($resource === 'attendance') {
            payrollAdmin($role);
            $period = payrollMonth($_GET['period'] ?? date('Y-m'));
            $rows = payrollRows($db, "SELECT ea.*, CONCAT(t.first_name, ' ', t.last_name) teacher_name, t.teacher_number FROM employee_attendance ea JOIN teachers t ON t.id=ea.teacher_id WHERE ea.attendance_date >= :period_start AND ea.attendance_date < :period_end ORDER BY ea.attendance_date DESC, t.last_name", [
                ':period_start' => $period,
                ':period_end' => date('Y-m-d', strtotime($period . ' +1 month')),
            ]);
            payrollReply(200, true, null, $rows);
        }
        if ($resource === 'run') {
            $runId = (int)($_GET['id'] ?? 0);
            if ($runId < 1) payrollReply(400, false, 'Paie invalide.');
            $run = payrollRow($db, 'SELECT pr.*, pp.name policy_name, pp.late_amount_per_minute, pp.absence_daily_multiplier, pp.standard_working_days, pp.maximum_deduction_percent FROM payroll_runs pr JOIN payroll_policies pp ON pp.id=pr.policy_id WHERE pr.id=:id', [':id' => $runId]);
            if (!$run) payrollReply(404, false, 'Paie introuvable.');
            $params = [':run_id' => $runId];
            $where = ' WHERE pi.payroll_run_id=:run_id';
            if ($role === 'teacher') { $where .= ' AND t.user_id=:user_id'; $params[':user_id'] = $userId; }
            $items = payrollRows($db, payrollItemSelect() . $where . ' ORDER BY t.last_name, t.first_name', $params);
            payrollReply(200, true, null, ['run' => $run, 'items' => $items]);
        }
        payrollReply(404, false, 'Ressource inconnue.');
    }

    payrollAdmin($role);
    if ($method === 'POST' && $resource === 'attendance') {
        $teacherId = (int)($input['teacher_id'] ?? 0);
        $date = payrollDate($input['attendance_date'] ?? '');
        $status = $input['status'] ?? 'present';
        $justification = $input['justification_status'] ?? 'none';
        if ($teacherId < 1 || !in_array($status, ['present','late','absent','excused'], true) || !in_array($justification, ['none','pending','valid','invalid'], true)) payrollReply(400, false, 'Présence invalide.');
        $stmt = $db->prepare("INSERT INTO employee_attendance (teacher_id, attendance_date, status, late_minutes, justification_status, justification_note, notes, recorded_by) VALUES (:teacher,:date,:status,:late,:justification,:justification_note,:notes,:user) ON DUPLICATE KEY UPDATE status=VALUES(status), late_minutes=VALUES(late_minutes), justification_status=VALUES(justification_status), justification_note=VALUES(justification_note), notes=VALUES(notes), recorded_by=VALUES(recorded_by)");
        $stmt->execute([':teacher'=>$teacherId, ':date'=>$date, ':status'=>$status, ':late'=>$status === 'late' ? max(0,(int)($input['late_minutes']??0)) : 0, ':justification'=>$justification, ':justification_note'=>trim((string)($input['justification_note']??'')) ?: null, ':notes'=>trim((string)($input['notes']??'')) ?: null, ':user'=>$userId]);
        payrollReply(200, true, 'Présence du personnel enregistrée.', ['id' => (int)($db->lastInsertId() ?: payrollRow($db, 'SELECT id FROM employee_attendance WHERE teacher_id=:teacher AND attendance_date=:date', [':teacher'=>$teacherId, ':date'=>$date])['id'])]);
    }
    if (($method === 'POST' || $method === 'PUT') && $resource === 'policy') {
        $name = trim((string)($input['name'] ?? ''));
        if ($name === '') payrollReply(400, false, 'Le nom de la politique est obligatoire.');
        $values = [':name'=>$name, ':late'=>max(0,(float)($input['late_amount_per_minute']??0)), ':multiplier'=>max(0,(float)($input['absence_daily_multiplier']??1)), ':days'=>max(1,(int)($input['standard_working_days']??22)), ':cap'=>max(0,min(100,(float)($input['maximum_deduction_percent']??30))), ':active'=>!empty($input['is_active'])?1:0];
        $id = $method === 'PUT' ? (int)($_GET['id'] ?? 0) : 0;
        if ($method === 'PUT' && $id < 1) payrollReply(400, false, 'Politique invalide.');
        if ($method === 'PUT' && !payrollRow($db, 'SELECT id FROM payroll_policies WHERE id=:id', [':id'=>$id])) {
            payrollReply(404, false, 'Politique de paie introuvable.');
        }
        $db->beginTransaction();
        if ($values[':active']) $db->exec('UPDATE payroll_policies SET is_active=0');
        if ($method === 'POST') {
            $stmt=$db->prepare('INSERT INTO payroll_policies (name,late_amount_per_minute,absence_daily_multiplier,standard_working_days,maximum_deduction_percent,is_active,created_by) VALUES (:name,:late,:multiplier,:days,:cap,:active,:user)'); $stmt->execute($values + [':user'=>$userId]); $id=(int)$db->lastInsertId();
        } else {
            $stmt=$db->prepare('UPDATE payroll_policies SET name=:name,late_amount_per_minute=:late,absence_daily_multiplier=:multiplier,standard_working_days=:days,maximum_deduction_percent=:cap,is_active=:active WHERE id=:id'); $stmt->execute($values + [':id'=>$id]);
        }
        $db->commit(); payrollReply(200,true,'Politique de paie enregistrée.',['id'=>$id]);
    }
    if ($method === 'POST' && $resource === 'generate') {
        $period = payrollMonth($input['period'] ?? date('Y-m'));
        $policyId = (int)($input['policy_id'] ?? 0);
        $policy = payrollRow($db, 'SELECT * FROM payroll_policies WHERE id=:id', [':id'=>$policyId]);
        if (!$policy) payrollReply(400, false, 'Politique de paie invalide.');
        $existing = payrollRow($db, 'SELECT * FROM payroll_runs WHERE period_month=:period', [':period'=>$period]);
        if ($existing && $existing['status'] !== 'draft') payrollReply(409, false, 'Une paie déjà validée existe pour ce mois.');
        $db->beginTransaction();
        if ($existing) { $runId=(int)$existing['id']; $db->prepare('UPDATE payroll_runs SET policy_id=:policy WHERE id=:id')->execute([':policy'=>$policyId,':id'=>$runId]); }
        else { $db->prepare('INSERT INTO payroll_runs (period_month,policy_id,created_by) VALUES (:period,:policy,:user)')->execute([':period'=>$period,':policy'=>$policyId,':user'=>$userId]); $runId=(int)$db->lastInsertId(); }
        $periodEnd = date('Y-m-d', strtotime($period . ' +1 month'));
        $teachers=payrollRows($db,"SELECT id,salary FROM teachers WHERE status='active'");
        foreach($teachers as $teacher){
            $stats=payrollRow($db,"SELECT COALESCE(SUM(status='late'),0) late_count, COALESCE(SUM(CASE WHEN status='late' THEN late_minutes ELSE 0 END),0) late_minutes, COALESCE(SUM(status='absent' AND justification_status IN ('none','invalid')),0) absences FROM employee_attendance WHERE teacher_id=:teacher AND attendance_date>=:period_start AND attendance_date<:period_end",[':teacher'=>$teacher['id'],':period_start'=>$period,':period_end'=>$periodEnd]);
            [$lateDeduction,$absenceDeduction,$net]=calculatePayrollItem($teacher['salary'],$stats['late_minutes']??0,$stats['absences']??0,$policy);
            $stmt=$db->prepare('INSERT INTO payroll_items (payroll_run_id,teacher_id,base_salary,late_count,late_minutes,unjustified_absences,late_deduction,absence_deduction,net_salary) VALUES (:run,:teacher,:base,:late_count,:late_minutes,:absences,:late_deduction,:absence_deduction,:net) ON DUPLICATE KEY UPDATE base_salary=VALUES(base_salary),late_count=VALUES(late_count),late_minutes=VALUES(late_minutes),unjustified_absences=VALUES(unjustified_absences),late_deduction=VALUES(late_deduction),absence_deduction=VALUES(absence_deduction),net_salary=GREATEST(0,VALUES(net_salary)-manual_deduction+bonus_amount)');
            $stmt->execute([':run'=>$runId,':teacher'=>$teacher['id'],':base'=>$teacher['salary']??0,':late_count'=>$stats['late_count']??0,':late_minutes'=>$stats['late_minutes']??0,':absences'=>$stats['absences']??0,':late_deduction'=>$lateDeduction,':absence_deduction'=>$absenceDeduction,':net'=>$net]);
        }
        $db->commit(); payrollReply(200,true,'Brouillon de paie généré.',['id'=>$runId]);
    }
    if ($method === 'PUT' && $resource === 'item') {
        $id=(int)($_GET['id']??0); $item=payrollRow($db,payrollItemSelect().' WHERE pi.id=:id',[':id'=>$id]);
        if(!$item||$item['run_status']!=='draft') payrollReply(409,false,'Seul un brouillon de paie peut être modifié.');
        $policy=payrollRow($db,'SELECT pp.* FROM payroll_runs pr JOIN payroll_policies pp ON pp.id=pr.policy_id WHERE pr.id=:id',[':id'=>$item['payroll_run_id']]);
        $manual=max(0,(float)($input['manual_deduction']??0)); $bonus=max(0,(float)($input['bonus_amount']??0));
        [,, $net]=calculatePayrollItem($item['base_salary'],$item['late_minutes'],$item['unjustified_absences'],$policy,$manual,$bonus);
        $stmt=$db->prepare('UPDATE payroll_items SET manual_deduction=:manual,bonus_amount=:bonus,net_salary=:net,notes=:notes WHERE id=:id'); $stmt->execute([':manual'=>$manual,':bonus'=>$bonus,':net'=>$net,':notes'=>trim((string)($input['notes']??''))?:null,':id'=>$id]);
        payrollReply(200,true,'Ligne de paie mise à jour.');
    }
    if ($method === 'PUT' && $resource === 'run') {
        $id=(int)($_GET['id']??0); $run=payrollRow($db,'SELECT * FROM payroll_runs WHERE id=:id',[':id'=>$id]); $next=$input['status']??'';
        $allowed=['draft'=>['approved','cancelled'],'approved'=>['paid'],'paid'=>[],'cancelled'=>[]];
        if(!$run||!in_array($next,$allowed[$run['status']]??[],true)) payrollReply(409,false,'Transition de paie non autorisée.');
        $stmt=$db->prepare("UPDATE payroll_runs SET status=:status, approved_by=CASE WHEN :approved_status='approved' THEN :user ELSE approved_by END, approved_at=CASE WHEN :approved_time_status='approved' THEN NOW() ELSE approved_at END, paid_at=CASE WHEN :paid_status='paid' THEN NOW() ELSE paid_at END WHERE id=:id");
        $stmt->execute([':status'=>$next,':approved_status'=>$next,':approved_time_status'=>$next,':paid_status'=>$next,':user'=>$userId,':id'=>$id]);
        $message = $next === 'paid' ? 'Paie marquée comme versée.' : ($next === 'cancelled' ? 'Paie annulée.' : 'Paie validée.');
        payrollReply(200,true,$message);
    }
    if ($method === 'DELETE' && $resource === 'attendance') {
        $id=(int)($_GET['id']??0); $stmt=$db->prepare('DELETE FROM employee_attendance WHERE id=:id'); $stmt->execute([':id'=>$id]); if(!$stmt->rowCount()) payrollReply(404,false,'Présence introuvable.'); payrollReply(200,true,'Présence supprimée.');
    }
    if ($method === 'DELETE' && $resource === 'run') {
        $id=(int)($_GET['id']??0); $stmt=$db->prepare("DELETE FROM payroll_runs WHERE id=:id AND status='draft'"); $stmt->execute([':id'=>$id]); if(!$stmt->rowCount()) payrollReply(409,false,'Seul un brouillon peut être supprimé.'); payrollReply(200,true,'Brouillon supprimé.');
    }
    payrollReply(404,false,'Ressource inconnue.');
} catch (PDOException $e) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('PDOException in payroll.php: '.$e->getMessage());
    payrollReply(500,false,'Erreur de gestion de la paie. Vérifiez que la migration 008 est appliquée.');
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('Throwable in payroll.php: '.$e->getMessage()); payrollReply(500,false,'Erreur serveur.');
}
?>
