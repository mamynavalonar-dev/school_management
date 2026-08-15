<?php
require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
require_once '../config/auth_guard.php';
require_once '../config/feature_permissions.php';

$db=(new Database())->getConnection();
$role=$_SESSION['user_role']??'';
$userId=(int)($_SESSION['user_id']??0);
$q=trim((string)($_GET['q']??''));
if(mb_strlen($q)<2){echo json_encode(['success'=>true,'data'=>[]],JSON_UNESCAPED_UNICODE);exit();}
$like='%'.$q.'%';
$permissions=loadFeaturePermissions($db,$userId,$role);
$results=[];

function gsAllowed(array $permissions,string $key,string $role):bool{return in_array($role,['admin','directeur'],true)||!empty($permissions[$key]['view']);}
function gsRows(PDO $db,string $sql,array $params):array{$s=$db->prepare($sql);$s->execute($params);return $s->fetchAll(PDO::FETCH_ASSOC);}
function gsPush(array &$results,array $rows,string $type,string $target,callable $title,callable $subtitle):void{
    foreach($rows as $row){$results[]=['type'=>$type,'id'=>(int)$row['id'],'title'=>$title($row),'subtitle'=>$subtitle($row),'target'=>$target];if(count($results)>=30)return;}
}

try{
    if(in_array($role,['admin','directeur'],true)){
        $rows=gsRows($db,"SELECT id,name,email,role FROM users WHERE deleted_at IS NULL AND purged_at IS NULL AND (name LIKE :q OR email LIKE :q2) ORDER BY name LIMIT 5",[':q'=>$like,':q2'=>$like]);
        gsPush($results,$rows,'Utilisateur','admin-users',fn($r)=>$r['name'],fn($r)=>$r['email'].' · '.$r['role']);
    }

    if(gsAllowed($permissions,'students',$role) && $role!=='student'){
        $sql="SELECT DISTINCT s.id,s.student_number,s.first_name,s.last_name,s.email FROM students s";
        $params=[':q'=>$like,':q2'=>$like,':q3'=>$like];
        if($role==='teacher'){
            $sql.=" JOIN enrollments en ON en.student_id=s.id AND en.status='Enrolled' JOIN teachers t ON t.user_id=:user JOIN planning_schedules ps ON ps.teacher_id=t.id AND ps.level_id=en.level_id AND COALESCE(ps.specialization_id,0)=COALESCE(en.specialization_id,0)";
            $params[':user']=$userId;
        }
        $sql.=" WHERE (CONCAT(s.first_name,' ',s.last_name) LIKE :q OR s.student_number LIKE :q2 OR s.email LIKE :q3) ORDER BY s.last_name,s.first_name LIMIT 5";
        $rows=gsRows($db,$sql,$params);
        gsPush($results,$rows,'Étudiant','students',fn($r)=>$r['first_name'].' '.$r['last_name'],fn($r)=>$r['student_number'].' · '.$r['email']);
    }

    if(gsAllowed($permissions,'teachers',$role) && $role!=='student'){
        $rows=gsRows($db,"SELECT id,teacher_number,first_name,last_name,email,department FROM teachers WHERE CONCAT(first_name,' ',last_name) LIKE :q OR teacher_number LIKE :q2 OR email LIKE :q3 OR department LIKE :q4 ORDER BY last_name,first_name LIMIT 5",[':q'=>$like,':q2'=>$like,':q3'=>$like,':q4'=>$like]);
        gsPush($results,$rows,'Enseignant','teachers',fn($r)=>$r['first_name'].' '.$r['last_name'],fn($r)=>$r['teacher_number'].($r['department']?' · '.$r['department']:''));
    }

    if(gsAllowed($permissions,'courses',$role)){
        $params=[':q'=>$like,':q2'=>$like];
        if($role==='student'){
            $sql="SELECT DISTINCT c.id,c.code,c.name FROM courses c JOIN students s ON s.user_id=:user JOIN enrollments en ON en.student_id=s.id AND en.status='Enrolled' AND en.level_id=c.level_id AND en.specialization_id=c.specialization_id WHERE (c.name LIKE :q OR c.code LIKE :q2)";
            $params[':user']=$userId;
        }elseif($role==='teacher'){
            $sql="SELECT DISTINCT c.id,c.code,c.name FROM courses c JOIN planning_schedules ps ON ps.course_id=c.id JOIN teachers t ON t.id=ps.teacher_id AND t.user_id=:user WHERE (c.name LIKE :q OR c.code LIKE :q2)";
            $params[':user']=$userId;
        }else{
            $sql="SELECT c.id,c.code,c.name FROM courses c WHERE c.name LIKE :q OR c.code LIKE :q2";
        }
        $rows=gsRows($db,$sql.' ORDER BY name LIMIT 5',$params);
        gsPush($results,$rows,'Cours','courses',fn($r)=>$r['name'],fn($r)=>$r['code']);
    }

    if(gsAllowed($permissions,'evaluations',$role)){
        $params=[':q'=>$like];
        if($role==='student'){
            $sql="SELECT DISTINCT e.id,e.title,e.evaluation_date,c.name course_name FROM evaluations e JOIN courses c ON c.id=e.course_id JOIN students s ON s.user_id=:user JOIN enrollments en ON en.student_id=s.id AND en.status='Enrolled' AND en.level_id=e.level_id AND COALESCE(en.specialization_id,0)=COALESCE(e.specialization_id,0) WHERE e.title LIKE :q";
            $params[':user']=$userId;
        }elseif($role==='teacher'){
            $sql="SELECT e.id,e.title,e.evaluation_date,c.name course_name FROM evaluations e JOIN courses c ON c.id=e.course_id JOIN teachers t ON t.id=e.teacher_id AND t.user_id=:user WHERE e.title LIKE :q";
            $params[':user']=$userId;
        }else{
            $sql="SELECT e.id,e.title,e.evaluation_date,c.name course_name FROM evaluations e JOIN courses c ON c.id=e.course_id WHERE e.title LIKE :q";
        }
        $rows=gsRows($db,$sql.' ORDER BY e.evaluation_date DESC LIMIT 5',$params);
        gsPush($results,$rows,'Évaluation','evaluations',fn($r)=>$r['title'],fn($r)=>$r['course_name'].' · '.$r['evaluation_date']);
    }

    if(gsAllowed($permissions,'rooms',$role)){
        $rows=gsRows($db,"SELECT id,number,name,building FROM rooms WHERE name LIKE :q OR number LIKE :q2 OR building LIKE :q3 ORDER BY building,number LIMIT 5",[':q'=>$like,':q2'=>$like,':q3'=>$like]);
        gsPush($results,$rows,'Salle','rooms',fn($r)=>$r['name'].' ('.$r['number'].')',fn($r)=>$r['building']?:'Salle');
    }

    echo json_encode(['success'=>true,'data'=>array_slice($results,0,30)],JSON_UNESCAPED_UNICODE);
}catch(Throwable $e){error_log('global_search.php: '.$e->getMessage());http_response_code(500);echo json_encode(['success'=>false,'message'=>'Recherche indisponible.'],JSON_UNESCAPED_UNICODE);}
