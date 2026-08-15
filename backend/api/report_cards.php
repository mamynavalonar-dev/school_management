<?php
require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';
require_once '../config/academic_progress.php';

$db=(new Database())->getConnection(); $role=$_SESSION['user_role']??''; $userId=(int)($_SESSION['user_id']??0);
$method=$_SERVER['REQUEST_METHOD']; $resource=$_GET['resource']??'bulletin'; $input=json_decode(file_get_contents('php://input'),true)?:[];

function reportReply($status,$success,$message=null,$data=null){http_response_code($status);$p=['success'=>$success];if($message!==null)$p['message']=$message;if($data!==null)$p['data']=$data;echo json_encode($p,JSON_UNESCAPED_UNICODE);exit();}
function reportRows($db,$sql,$params=[]){$s=$db->prepare($sql);$s->execute($params);return $s->fetchAll(PDO::FETCH_ASSOC);}
function reportRow($db,$sql,$params=[]){$s=$db->prepare($sql);$s->execute($params);return $s->fetch(PDO::FETCH_ASSOC)?:null;}
function reportInt($value,$label){$n=filter_var($value,FILTER_VALIDATE_INT);if($n===false||$n<1)reportReply(400,false,"$label invalide.");return(int)$n;}
function reportScopeStudent($db,$studentId,$role,$userId){
    if(in_array($role,['admin','directeur'],true))return;
    if($role==='student'){$r=reportRow($db,'SELECT id FROM students WHERE id=:student AND user_id=:user',[':student'=>$studentId,':user'=>$userId]);if(!$r)reportReply(403,false,'Vous ne pouvez consulter que votre bulletin.');return;}
    if($role==='teacher'){$r=reportRow($db,"SELECT s.id FROM students s JOIN enrollments e ON e.student_id=s.id AND e.status='Enrolled' JOIN teachers t ON t.user_id=:user WHERE s.id=:student AND EXISTS(SELECT 1 FROM planning_schedules ps WHERE ps.teacher_id=t.id AND ps.level_id=e.level_id AND COALESCE(ps.specialization_id,0)=COALESCE(e.specialization_id,0))",[':user'=>$userId,':student'=>$studentId]);if(!$r)reportReply(403,false,'Cet élève ne fait pas partie de vos cours.');return;}
    reportReply(403,false,'Accès refusé.');
}
function reportResults($db,$studentId,$term){
    $rows=reportRows($db,"SELECT c.id course_id,c.code,c.name course_name,c.credits,ev.title evaluation_title,g.score,g.max_score,g.is_absent,g.status FROM grades g JOIN evaluations ev ON ev.id=g.evaluation_id JOIN courses c ON c.id=ev.course_id WHERE g.student_id=:student AND g.status IN ('completed','absent') AND ev.evaluation_date BETWEEN :start_date AND :end_date ORDER BY c.name,ev.evaluation_date",[':student'=>$studentId,':start_date'=>$term['start_date'],':end_date'=>$term['end_date']]);
    $courses=[];
    foreach($rows as $row){$id=(int)$row['course_id'];if(!isset($courses[$id]))$courses[$id]=['course_id'=>$id,'code'=>$row['code'],'course_name'=>$row['course_name'],'coefficient'=>max(1,(int)$row['credits']),'scores'=>[],'absent_count'=>0];if(!empty($row['is_absent'])){$courses[$id]['absent_count']++;continue;}if($row['score']!==null&&(float)$row['max_score']>0)$courses[$id]['scores'][]=((float)$row['score']/(float)$row['max_score'])*20;}
    $weighted=0;$coefficients=0;$results=[];
    foreach($courses as $course){$average=count($course['scores'])?array_sum($course['scores'])/count($course['scores']):null;if($average!==null){$weighted+=$average*$course['coefficient'];$coefficients+=$course['coefficient'];}$results[]=['course_id'=>$course['course_id'],'code'=>$course['code'],'course_name'=>$course['course_name'],'coefficient'=>$course['coefficient'],'average'=>$average===null?null:round($average,2),'evaluation_count'=>count($course['scores']),'absent_count'=>$course['absent_count']];}
    return ['courses'=>$results,'average'=>$coefficients?round($weighted/$coefficients,2):null];
}
function reportBuild($db,$studentId,$yearId,$termId,$role,$userId){
    reportScopeStudent($db,$studentId,$role,$userId);
    $term=reportRow($db,'SELECT t.*,ay.name academic_year_name FROM academic_terms t JOIN academic_years ay ON ay.id=t.academic_year_id WHERE t.id=:term AND t.academic_year_id=:year',[':term'=>$termId,':year'=>$yearId]);if(!$term)reportReply(404,false,'Période introuvable pour cette année.');
    $student=reportRow($db,"SELECT s.*,e.level_id,e.specialization_id,e.group_id,l.name level_name,sp.name specialization_name,sg.name group_name FROM students s LEFT JOIN enrollments e ON e.student_id=s.id AND e.academic_year_id=:year LEFT JOIN levels l ON l.id=e.level_id LEFT JOIN specializations sp ON sp.id=e.specialization_id LEFT JOIN student_groups sg ON sg.id=e.group_id WHERE s.id=:student ORDER BY (e.status='Enrolled') DESC,e.enrollment_date DESC LIMIT 1",[':year'=>$yearId,':student'=>$studentId]);if(!$student)reportReply(404,false,'Élève introuvable.');
    $result=reportResults($db,$studentId,$term);
    $classIds=reportRows($db,"SELECT DISTINCT student_id FROM enrollments WHERE academic_year_id=:year AND status='Enrolled' AND level_id=:level AND COALESCE(specialization_id,0)=:spec AND (:group_id=0 OR group_id=:group_id_again)",[':year'=>$yearId,':level'=>$student['level_id']?:0,':spec'=>$student['specialization_id']?:0,':group_id'=>(int)($student['group_id']??0),':group_id_again'=>(int)($student['group_id']??0)]);
    $ranking=[];foreach($classIds as $classStudent){$r=reportResults($db,(int)$classStudent['student_id'],$term);if($r['average']!==null)$ranking[]=['student_id'=>(int)$classStudent['student_id'],'average'=>$r['average']];}usort($ranking,fn($a,$b)=>$b['average']<=>$a['average']);$rank=null;foreach($ranking as $i=>$line){if($line['student_id']===$studentId){$rank=$i+1;break;}}
    $absence=reportRow($db,"SELECT COUNT(*) total FROM absences WHERE student_id=:student AND date BETWEEN :start_date AND :end_date AND status IN ('pending','unjustified')",[':student'=>$studentId,':start_date'=>$term['start_date'],':end_date'=>$term['end_date']]);
    $meta=reportRow($db,'SELECT * FROM report_cards WHERE student_id=:student AND academic_year_id=:year AND term_id=:term',[':student'=>$studentId,':year'=>$yearId,':term'=>$termId]);
    if($role==='student'&&(!$meta||$meta['status']!=='published'))reportReply(403,false,"Ce bulletin n'est pas encore publié.");
    return ['student'=>$student,'term'=>$term,'course_results'=>$result['courses'],'overall_average'=>$result['average'],'rank'=>$rank,'class_size'=>count($ranking),'absence_count'=>(int)($absence['total']??0),'metadata'=>$meta?:['appreciation'=>'','decision'=>'','status'=>'draft']];
}

try{
    if(!in_array($role,['admin','directeur','teacher','student'],true))reportReply(403,false,'Accès refusé.');
    if($method==='GET'&&$resource==='references'){
        $years=reportRows($db,'SELECT * FROM academic_years ORDER BY start_date DESC');$terms=reportRows($db,'SELECT t.*,ay.name academic_year_name FROM academic_terms t JOIN academic_years ay ON ay.id=t.academic_year_id ORDER BY t.start_date DESC');
        if($role==='student')$students=reportRows($db,'SELECT id,student_number,first_name,last_name FROM students WHERE user_id=:user',[':user'=>$userId]);
        elseif($role==='teacher')$students=reportRows($db,"SELECT DISTINCT s.id,s.student_number,s.first_name,s.last_name FROM students s JOIN enrollments e ON e.student_id=s.id AND e.status='Enrolled' JOIN teachers t ON t.user_id=:user JOIN planning_schedules ps ON ps.teacher_id=t.id AND ps.level_id=e.level_id AND COALESCE(ps.specialization_id,0)=COALESCE(e.specialization_id,0) ORDER BY s.last_name,s.first_name",[':user'=>$userId]);
        else $students=reportRows($db,'SELECT id,student_number,first_name,last_name FROM students ORDER BY last_name,first_name');
        reportReply(200,true,null,['years'=>$years,'terms'=>$terms,'students'=>$students]);
    }
    if($method==='GET'&&$resource==='bulletin')reportReply(200,true,null,reportBuild($db,reportInt($_GET['student_id']??0,'Élève'),reportInt($_GET['academic_year_id']??0,'Année'),reportInt($_GET['term_id']??0,'Période'),$role,$userId));
    if(in_array($method,['POST','PUT'],true)){
        if(!in_array($role,['admin','directeur','teacher'],true))reportReply(403,false,'Vous ne pouvez pas modifier un bulletin.');
        $studentId=reportInt($input['student_id']??0,'Élève');$yearId=reportInt($input['academic_year_id']??0,'Année');$termId=reportInt($input['term_id']??0,'Période');reportScopeStudent($db,$studentId,$role,$userId);
        if(!reportRow($db,'SELECT id FROM academic_terms WHERE id=:term AND academic_year_id=:year',[':term'=>$termId,':year'=>$yearId]))reportReply(400,false,'Cette période ne correspond pas à l’année sélectionnée.');
        if(!reportRow($db,"SELECT id FROM enrollments WHERE student_id=:student AND academic_year_id=:year AND status IN ('Enrolled','Completed') LIMIT 1",[':student'=>$studentId,':year'=>$yearId]))reportReply(400,false,'Cet élève n’est pas inscrit pour l’année sélectionnée.');
        $requestedStatus=$input['status']??'draft';
        if(!in_array($requestedStatus,['draft','published'],true))reportReply(400,false,'Statut du bulletin invalide.');
        $status=$requestedStatus;
        $appreciation=trim((string)($input['appreciation']??''));
        $decision=trim((string)($input['decision']??''));
        if(mb_strlen($appreciation)>5000||mb_strlen($decision)>160)reportReply(400,false,'Appréciation ou décision trop longue.');
        $db->beginTransaction();
        $stmt=$db->prepare("INSERT INTO report_cards(student_id,academic_year_id,term_id,appreciation,decision,status,published_at,updated_by) VALUES(:student,:year,:term,:appreciation,:decision,:status,CASE WHEN :status_again='published' THEN NOW() ELSE NULL END,:user) ON DUPLICATE KEY UPDATE appreciation=VALUES(appreciation),decision=VALUES(decision),status=VALUES(status),published_at=CASE WHEN VALUES(status)='published' THEN COALESCE(published_at,NOW()) ELSE NULL END,updated_by=VALUES(updated_by)");
        $stmt->execute([':student'=>$studentId,':year'=>$yearId,':term'=>$termId,':appreciation'=>$appreciation?:null,':decision'=>$decision?:null,':status'=>$status,':status_again'=>$status,':user'=>$userId]);
        $academicAction=['action'=>'none'];
        if($status==='published'){
            $report=reportRow($db,'SELECT id FROM report_cards WHERE student_id=:student AND academic_year_id=:year AND term_id=:term',[':student'=>$studentId,':year'=>$yearId,':term'=>$termId]);
            $term=reportRow($db,'SELECT * FROM academic_terms WHERE id=:term',[':term'=>$termId]);
            $result=$term?reportResults($db,$studentId,$term):['average'=>null];
            if($report)$academicAction=applyAcademicProgressPolicy($db,$studentId,(int)$report['id'],$result['average']===null?null:(float)$result['average'],$userId);
        }
        $db->commit();
        reportReply(200,true,$status==='published'?'Bulletin publié.':'Brouillon du bulletin enregistré.',['academic_action'=>$academicAction]);
    }
    reportReply(404,false,'Ressource inconnue.');
}catch(PDOException $e){if($db->inTransaction())$db->rollBack();error_log('PDOException in report_cards.php: ' . $e->getMessage());reportReply(500,false,'Impossible de générer le bulletin. Vérifiez que la migration 008 est appliquée.');}catch(Throwable $e){if($db->inTransaction())$db->rollBack();error_log('Throwable in report_cards.php: ' . $e->getMessage());reportReply(500,false,'Erreur serveur.');}
?>
