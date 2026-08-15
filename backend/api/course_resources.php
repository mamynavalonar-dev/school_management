<?php
/**
 * Ressources pédagogiques V7.
 * - l'enseignant propriétaire dépose leçon/exercice/autre ;
 * - la direction/admin valide ou refuse chaque document ;
 * - un étudiant ne voit que les documents validés ET si son compte de frais
 *   est Paid/Exempt, sauf dérogation explicite de la direction.
 */
require_once '../config/database.php';
require_once '../config/upload_guard.php';
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

$db=(new Database())->getConnection();$method=$_SERVER['REQUEST_METHOD'];$role=$_SESSION['user_role']??'';$userId=(int)($_SESSION['user_id']??0);
function crReply($status,$success,$message=null,$data=null){http_response_code($status);header('Content-Type: application/json; charset=UTF-8');$p=['success'=>$success];if($message!==null)$p['message']=$message;if($data!==null)$p['data']=$data;echo json_encode($p,JSON_UNESCAPED_UNICODE);exit();}
function crRow(PDO $db,string $sql,array $params=[]):?array{$s=$db->prepare($sql);$s->execute($params);$r=$s->fetch(PDO::FETCH_ASSOC);return$r?:null;}
function crRows(PDO $db,string $sql,array $params=[]):array{$s=$db->prepare($sql);$s->execute($params);return$s->fetchAll(PDO::FETCH_ASSOC);}
function getSessionTeacherId($db){$r=crRow($db,'SELECT id FROM teachers WHERE user_id=:user',[':user'=>(int)$_SESSION['user_id']]);return$r?(int)$r['id']:null;}
function isCourseOwnedByTeacher($db,$courseId,$teacherId){return(bool)crRow($db,'SELECT 1 ok FROM planning_schedules WHERE course_id=:course AND teacher_id=:teacher LIMIT 1',[':course'=>$courseId,':teacher'=>$teacherId]);}
function crStudentAccess(PDO $db,int $courseId,int $userId):array{
    $row=crRow($db,"SELECT DISTINCT s.id student_id,e.id enrollment_id,COALESCE(fa.status,'Pending') fee_status
        FROM students s
        JOIN enrollments e ON e.student_id=s.id AND e.status='Enrolled'
        JOIN planning_schedules ps ON ps.level_id=e.level_id AND COALESCE(ps.specialization_id,0)=COALESCE(e.specialization_id,0) AND ps.course_id=:course
        LEFT JOIN student_fee_accounts fa ON fa.enrollment_id=e.id
        WHERE s.user_id=:user ORDER BY e.enrollment_date DESC LIMIT 1",[':course'=>$courseId,':user'=>$userId]);
    if(!$row)return['enrolled'=>false,'allowed'=>false,'fee_status'=>null,'override'=>false,'student_id'=>null,'reason'=>'Vous n’êtes pas inscrit à ce cours.'];
    $override=crRow($db,"SELECT is_allowed,reason,expires_at FROM student_resource_access_overrides WHERE student_id=:student AND course_id=:course AND is_allowed=1 AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1",[':student'=>(int)$row['student_id'],':course'=>$courseId]);
    $paid=in_array($row['fee_status'],['Paid','Exempt'],true);$allowed=$paid||$override;
    return['enrolled'=>true,'allowed'=>(bool)$allowed,'fee_status'=>$row['fee_status'],'override'=>(bool)$override,'student_id'=>(int)$row['student_id'],'reason'=>$allowed?($override?'Accès exceptionnel accordé par la direction.':'Droits et écolage à jour.'):'Accès suspendu : droits/écolage non intégralement régularisés. La direction peut accorder une dérogation.'];
}
function crCanStaff():bool{return in_array($_SESSION['user_role']??'',['admin','directeur'],true);}

try{
    if($method==='GET'&&isset($_GET['download'])){downloadResource($db,(int)$_GET['download']);}
    if($method==='GET'&&isset($_GET['course_id'])&&isset($_GET['access_roster'])){accessRoster($db,(int)$_GET['course_id']);}
    if($method==='POST'&&isset($_GET['course_id']))uploadResource($db,(int)$_GET['course_id']);
    if($method==='GET'&&isset($_GET['course_id']))listResources($db,(int)$_GET['course_id']);
    if($method==='PUT'&&isset($_GET['review_id']))reviewResource($db,(int)$_GET['review_id']);
    if($method==='PUT'&&($_GET['action']??'')==='override')saveAccessOverride($db);
    if($method==='DELETE'&&isset($_GET['id']))deleteResource($db,(int)$_GET['id']);
    crReply(400,false,'Requête invalide.');
}catch(UploadException $e){crReply(400,false,$e->getMessage());}
catch(Throwable $e){error_log('course_resources.php: '.$e->getMessage());crReply(500,false,'Une erreur serveur est survenue.');}

function uploadResource(PDO $db,int $courseId):void{
    if(($_SESSION['user_role']??'')!=='teacher')crReply(403,false,'Seul un enseignant peut déposer un document.');
    $teacherId=getSessionTeacherId($db);if(!$teacherId||!isCourseOwnedByTeacher($db,$courseId,$teacherId))crReply(403,false,"Vous n'enseignez pas ce cours.");
    $title=trim((string)($_POST['title']??''));$type=$_POST['resource_type']??'lesson';
    if($title==='')crReply(400,false,'Titre du document requis.');if(!in_array($type,['lesson','exercise','other'],true))crReply(400,false,'Type de ressource invalide.');if(empty($_FILES['file']))crReply(400,false,'Aucun fichier reçu.');
    $uploaded=handleSecureUpload($_FILES['file'],'course_resources');
    $stmt=$db->prepare("INSERT INTO course_resources(course_id,teacher_id,title,resource_type,original_name,stored_name,mime_type,size_bytes,review_status) VALUES(:course,:teacher,:title,:type,:original,:stored,:mime,:size,'pending')");
    $stmt->execute([':course'=>$courseId,':teacher'=>$teacherId,':title'=>$title,':type'=>$type,':original'=>$uploaded['original_name'],':stored'=>$uploaded['stored_name'],':mime'=>$uploaded['mime_type'],':size'=>$uploaded['size_bytes']]);
    crReply(201,true,'Document déposé. Il est en attente de validation par la direction.',['id'=>(int)$db->lastInsertId()]);
}
function listResources(PDO $db,int $courseId):void{
    $role=$_SESSION['user_role']??'';$staff=crCanStaff();$teacher=false;$access=null;
    if($role==='teacher'){$teacherId=getSessionTeacherId($db);$teacher=$teacherId&&isCourseOwnedByTeacher($db,$courseId,$teacherId);}
    if($role==='student')$access=crStudentAccess($db,$courseId,(int)$_SESSION['user_id']);
    if(!$staff&&!$teacher&&$role!=='student')crReply(403,false,'Accès refusé.');
    if($role==='student'&&!$access['enrolled'])crReply(403,false,$access['reason'],['access'=>$access]);
    if($role==='student'&&!$access['allowed'])crReply(403,false,$access['reason'],['access'=>$access]);
    $statusSql=$role==='student'?" AND cr.review_status='approved'":'';
    $rows=crRows($db,"SELECT cr.id,cr.title,cr.resource_type,cr.original_name,cr.mime_type,cr.size_bytes,cr.review_status,cr.review_note,cr.reviewed_at,cr.created_at,CONCAT(t.first_name,' ',t.last_name) teacher_name FROM course_resources cr JOIN teachers t ON t.id=cr.teacher_id WHERE cr.course_id=:course{$statusSql} ORDER BY cr.created_at DESC",[':course'=>$courseId]);
    crReply(200,true,null,['resources'=>$rows,'access'=>$access]);
}
function downloadResource(PDO $db,int $resourceId):void{
    $r=crRow($db,'SELECT * FROM course_resources WHERE id=:id',[':id'=>$resourceId]);if(!$r)crReply(404,false,'Document introuvable.');
    $role=$_SESSION['user_role']??'';$allowed=crCanStaff();
    if($role==='teacher'){$teacherId=getSessionTeacherId($db);$allowed=$teacherId&&(int)$r['teacher_id']===$teacherId;}
    if($role==='student'){$access=crStudentAccess($db,(int)$r['course_id'],(int)$_SESSION['user_id']);$allowed=$access['allowed']&&$r['review_status']==='approved';}
    if(!$allowed)crReply(403,false,'Accès au document refusé. Vérifiez la validation de la direction et votre situation financière.');
    $path=resolveSecureUploadPath('course_resources',$r['stored_name']);if(!$path||!is_file($path))crReply(404,false,'Fichier introuvable sur le disque.');
    header('Content-Type: '.$r['mime_type']);header("Content-Disposition: attachment; filename*=UTF-8''".rawurlencode($r['original_name']));header('Content-Length: '.filesize($path));header('X-Content-Type-Options: nosniff');readfile($path);exit();
}
function reviewResource(PDO $db,int $resourceId):void{
    if(!crCanStaff())crReply(403,false,'Validation réservée à l’administration et à la direction.');$input=json_decode(file_get_contents('php://input'),true)?:[];$status=$input['review_status']??'';$note=trim((string)($input['review_note']??''));
    if(!in_array($status,['approved','rejected'],true))crReply(400,false,'Décision invalide.');if(mb_strlen($note)>500)crReply(400,false,'Commentaire trop long.');
    $stmt=$db->prepare('UPDATE course_resources SET review_status=:status,reviewed_by=:user,reviewed_at=NOW(),review_note=:note WHERE id=:id');$stmt->execute([':status'=>$status,':user'=>(int)$_SESSION['user_id'],':note'=>$note?:null,':id'=>$resourceId]);if(!$stmt->rowCount())crReply(404,false,'Document introuvable.');crReply(200,true,$status==='approved'?'Document validé.':'Document refusé.');
}
function accessRoster(PDO $db,int $courseId):void{
    if(!crCanStaff())crReply(403,false,'Suivi financier réservé à l’administration et à la direction.');
    $rows=crRows($db,"SELECT DISTINCT s.id student_id,s.student_number,s.first_name,s.last_name,e.id enrollment_id,COALESCE(fa.status,'Pending') fee_status,o.is_allowed override_allowed,o.reason override_reason,o.expires_at override_expires_at
        FROM planning_schedules ps JOIN enrollments e ON e.status='Enrolled' AND e.level_id=ps.level_id AND COALESCE(e.specialization_id,0)=COALESCE(ps.specialization_id,0) JOIN students s ON s.id=e.student_id LEFT JOIN student_fee_accounts fa ON fa.enrollment_id=e.id LEFT JOIN student_resource_access_overrides o ON o.student_id=s.id AND o.course_id=:course_override AND (o.expires_at IS NULL OR o.expires_at>NOW())
        WHERE ps.course_id=:course ORDER BY s.last_name,s.first_name",[':course_override'=>$courseId,':course'=>$courseId]);
    foreach($rows as &$row){$row['access_allowed']=in_array($row['fee_status'],['Paid','Exempt'],true)||((int)($row['override_allowed']??0)===1);}$row=null;
    crReply(200,true,null,$rows);
}
function saveAccessOverride(PDO $db):void{
    if(!crCanStaff())crReply(403,false,'Dérogation réservée à l’administration et à la direction.');$input=json_decode(file_get_contents('php://input'),true)?:[];$studentId=(int)($input['student_id']??0);$courseId=(int)($input['course_id']??0);$allowed=!empty($input['is_allowed']);$reason=trim((string)($input['reason']??''));$expires=trim((string)($input['expires_at']??''));
    if($studentId<1||$courseId<1)crReply(400,false,'Étudiant ou cours invalide.');if(mb_strlen($reason)>500)crReply(400,false,'Motif trop long.');
    if(!$allowed){$db->prepare('DELETE FROM student_resource_access_overrides WHERE student_id=:student AND course_id=:course')->execute([':student'=>$studentId,':course'=>$courseId]);crReply(200,true,'Dérogation retirée.');}
    $stmt=$db->prepare("INSERT INTO student_resource_access_overrides(student_id,course_id,is_allowed,reason,expires_at,granted_by) VALUES(:student,:course,1,:reason,:expires,:user) ON DUPLICATE KEY UPDATE is_allowed=1,reason=VALUES(reason),expires_at=VALUES(expires_at),granted_by=VALUES(granted_by),updated_at=CURRENT_TIMESTAMP");$stmt->execute([':student'=>$studentId,':course'=>$courseId,':reason'=>$reason?:null,':expires'=>$expires?:null,':user'=>(int)$_SESSION['user_id']]);crReply(200,true,'Dérogation d’accès enregistrée.');
}
function deleteResource(PDO $db,int $resourceId):void{
    $r=crRow($db,'SELECT * FROM course_resources WHERE id=:id',[':id'=>$resourceId]);if(!$r)crReply(404,false,'Document introuvable.');$role=$_SESSION['user_role']??'';$allowed=crCanStaff();if($role==='teacher'){$teacherId=getSessionTeacherId($db);$allowed=$teacherId&&(int)$r['teacher_id']===$teacherId;}
    if(!$allowed)crReply(403,false,'Suppression non autorisée.');$db->prepare('DELETE FROM course_resources WHERE id=:id')->execute([':id'=>$resourceId]);$path=resolveSecureUploadPath('course_resources',$r['stored_name']);if($path&&is_file($path))@unlink($path);crReply(200,true,'Document supprimé.');
}
