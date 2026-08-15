<?php
require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';
require_once '../config/upload_guard.php';

$db = (new Database())->getConnection();
$role = $_SESSION['user_role'] ?? '';
$userId = (int)($_SESSION['user_id'] ?? 0);
$method = $_SERVER['REQUEST_METHOD'];

function subjectReply(int $status, bool $success, ?string $message = null, $data = null): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    $payload = ['success' => $success];
    if ($message !== null) $payload['message'] = $message;
    if ($data !== null) $payload['data'] = $data;
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}
function subjectRow(PDO $db, string $sql, array $params = []): ?array { $s=$db->prepare($sql);$s->execute($params);$r=$s->fetch(PDO::FETCH_ASSOC);return $r?:null; }
function subjectEvaluation(PDO $db, int $evaluationId): ?array {
    return subjectRow($db, 'SELECT e.*,t.user_id teacher_user_id FROM evaluations e LEFT JOIN teachers t ON t.id=e.teacher_id WHERE e.id=:id', [':id'=>$evaluationId]);
}
function studentMaySeeEvaluation(PDO $db, array $evaluation, int $userId): bool {
    $stmt=$db->prepare("SELECT 1 FROM students s JOIN enrollments en ON en.student_id=s.id AND en.status='Enrolled' WHERE s.user_id=:user AND en.level_id=:level AND COALESCE(en.specialization_id,0)=COALESCE(:spec,0) LIMIT 1");
    $stmt->execute([':user'=>$userId, ':level'=>(int)$evaluation['level_id'], ':spec'=>$evaluation['specialization_id'] !== null ? (int)$evaluation['specialization_id'] : null]);
    return (bool)$stmt->fetchColumn();
}
function subjectAccess(PDO $db, array $subject, array $evaluation, string $role, int $userId, bool $download = false): bool {
    if (in_array($role,['admin','directeur'],true)) return true;
    if ($role==='teacher') return (int)$evaluation['teacher_user_id']===$userId;
    if ($role==='student') {
        if ($subject['review_status']!=='approved') return false;
        if (!studentMaySeeEvaluation($db,$evaluation,$userId)) return false;
        // Le sujet est volontairement inaccessible avant ET après le jour J.
        return (string)$evaluation['evaluation_date'] === date('Y-m-d');
    }
    return false;
}

try {
    if (!in_array($role,['admin','directeur','teacher','student'],true)) subjectReply(403,false,'Accès refusé.');

    if ($method==='GET' && isset($_GET['download'])) {
        $subjectId=(int)$_GET['download'];
        $subject=subjectRow($db,'SELECT * FROM evaluation_subjects WHERE id=:id',[':id'=>$subjectId]);
        if(!$subject) subjectReply(404,false,'Sujet introuvable.');
        $evaluation=subjectEvaluation($db,(int)$subject['evaluation_id']);
        if(!$evaluation || !subjectAccess($db,$subject,$evaluation,$role,$userId,true)) subjectReply(403,false,"Ce sujet n'est pas disponible pour votre compte aujourd'hui.");
        $path=resolveSecureUploadPath('evaluation_subjects',$subject['stored_name']);
        if(!$path || !is_file($path)) subjectReply(404,false,'Fichier introuvable.');
        header('Content-Type: '.$subject['mime_type']);
        header('Content-Length: '.filesize($path));
        header("Content-Disposition: attachment; filename*=UTF-8''".rawurlencode($subject['original_name']));
        header('X-Content-Type-Options: nosniff');
        readfile($path); exit();
    }

    $evaluationId=(int)($_GET['evaluation_id'] ?? 0);
    if($evaluationId<1) subjectReply(400,false,'Évaluation invalide.');
    $evaluation=subjectEvaluation($db,$evaluationId);
    if(!$evaluation) subjectReply(404,false,'Évaluation introuvable.');

    if ($method==='GET') {
        $subject=subjectRow($db,'SELECT es.*,CONCAT(u.name) reviewer_name FROM evaluation_subjects es LEFT JOIN users u ON u.id=es.reviewed_by WHERE es.evaluation_id=:evaluation',[':evaluation'=>$evaluationId]);
        if(!$subject) subjectReply(200,true,null,null);
        $allowed=subjectAccess($db,$subject,$evaluation,$role,$userId);
        if($role==='student' && !$allowed) {
            subjectReply(200,true,null,[
                'id'=>(int)$subject['id'],
                'review_status'=>$subject['review_status'],
                'available'=>false,
                'release_date'=>$evaluation['evaluation_date'],
                'message'=>$subject['review_status']==='approved'
                    ? "Le sujet sera accessible uniquement le jour de l’évaluation."
                    : "Le sujet n'est pas encore validé par la direction.",
            ]);
        }
        if(!$allowed) subjectReply(403,false,'Vous ne pouvez pas consulter ce sujet.');
        $subject['available']=true;
        $subject['release_date']=$evaluation['evaluation_date'];
        subjectReply(200,true,null,$subject);
    }

    if ($method==='POST') {
        if($role!=='teacher') subjectReply(403,false,'Seul l’enseignant responsable peut déposer le sujet.');
        if((int)$evaluation['teacher_user_id']!==$userId) subjectReply(403,false,'Cette évaluation ne vous est pas attribuée.');
        if(empty($_FILES['file'])) subjectReply(400,false,'Fichier du sujet requis.');
        $stored=handleSecureUpload($_FILES['file'],'evaluation_subjects');
        $previous=subjectRow($db,'SELECT stored_name FROM evaluation_subjects WHERE evaluation_id=:evaluation',[':evaluation'=>$evaluationId]);
        $stmt=$db->prepare("INSERT INTO evaluation_subjects (evaluation_id,teacher_id,original_name,stored_name,mime_type,size_bytes,review_status,reviewed_by,reviewed_at,review_note)
            VALUES (:evaluation,:teacher,:original_name,:stored_name,:mime_type,:size_bytes,'pending',NULL,NULL,NULL)
            ON DUPLICATE KEY UPDATE teacher_id=VALUES(teacher_id),original_name=VALUES(original_name),stored_name=VALUES(stored_name),mime_type=VALUES(mime_type),size_bytes=VALUES(size_bytes),review_status='pending',reviewed_by=NULL,reviewed_at=NULL,review_note=NULL,submitted_at=CURRENT_TIMESTAMP");
        $stmt->execute([':evaluation'=>$evaluationId, ':teacher'=>(int)$evaluation['teacher_id'], ':original_name'=>$stored['original_name'], ':stored_name'=>$stored['stored_name'], ':mime_type'=>$stored['mime_type'], ':size_bytes'=>$stored['size_bytes']]);
        if($previous && $previous['stored_name']!==$stored['stored_name']) { $old=resolveSecureUploadPath('evaluation_subjects',$previous['stored_name']); if($old && is_file($old)) @unlink($old); }
        subjectReply(201,true,'Sujet déposé. Il doit maintenant être validé par la direction.');
    }

    if ($method==='PUT') {
        if(!in_array($role,['admin','directeur'],true)) subjectReply(403,false,'Validation réservée à l’administration et à la direction.');
        $input=json_decode(file_get_contents('php://input'),true)?:[];
        $status=$input['review_status']??'';
        if(!in_array($status,['approved','rejected'],true)) subjectReply(400,false,'Décision invalide.');
        $note=trim((string)($input['review_note']??''));
        if(mb_strlen($note)>500) subjectReply(400,false,'Commentaire trop long.');
        $stmt=$db->prepare('UPDATE evaluation_subjects SET review_status=:status,reviewed_by=:user,reviewed_at=NOW(),review_note=:note WHERE evaluation_id=:evaluation');
        $stmt->execute([':status'=>$status, ':user'=>$userId, ':note'=>$note?:null, ':evaluation'=>$evaluationId]);
        if(!$stmt->rowCount()) subjectReply(404,false,'Sujet introuvable.');
        subjectReply(200,true,$status==='approved'?'Sujet validé.':'Sujet refusé.');
    }

    if ($method==='DELETE') {
        $subject=subjectRow($db,'SELECT * FROM evaluation_subjects WHERE evaluation_id=:evaluation',[':evaluation'=>$evaluationId]);
        if(!$subject) subjectReply(404,false,'Sujet introuvable.');
        $teacherOwns=$role==='teacher' && (int)$evaluation['teacher_user_id']===$userId && $subject['review_status']!=='approved';
        if(!in_array($role,['admin','directeur'],true) && !$teacherOwns) subjectReply(403,false,'Suppression non autorisée.');
        $db->prepare('DELETE FROM evaluation_subjects WHERE id=:id')->execute([':id'=>(int)$subject['id']]);
        $path=resolveSecureUploadPath('evaluation_subjects',$subject['stored_name']); if($path&&is_file($path)) @unlink($path);
        subjectReply(200,true,'Sujet supprimé.');
    }

    subjectReply(405,false,'Méthode non autorisée.');
} catch (UploadException $e) { subjectReply(400,false,$e->getMessage()); }
catch (Throwable $e) { error_log('evaluation_subjects.php: '.$e->getMessage()); subjectReply(500,false,'Erreur lors de la gestion du sujet.'); }
