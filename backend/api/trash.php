<?php
require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD']==='OPTIONS'){http_response_code(200);exit();}
require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

$db=(new Database())->getConnection();$role=$_SESSION['user_role']??'';$userId=(int)($_SESSION['user_id']??0);$method=$_SERVER['REQUEST_METHOD'];
if(!in_array($role,['admin','directeur'],true)){http_response_code(403);echo json_encode(['success'=>false,'message'=>'Accès réservé à l’administration et à la direction.'],JSON_UNESCAPED_UNICODE);exit();}
function trashReply($status,$success,$message=null,$data=null){http_response_code($status);$p=['success'=>$success];if($message!==null)$p['message']=$message;if($data!==null)$p['data']=$data;echo json_encode($p,JSON_UNESCAPED_UNICODE);exit();}
function trashTarget(PDO $db,int $id):?array{$s=$db->prepare('SELECT id,name,email,role,status,deleted_at,deleted_by,purged_at FROM users WHERE id=:id');$s->execute([':id'=>$id]);$r=$s->fetch(PDO::FETCH_ASSOC);return$r?:null;}
function trashCanManage(string $actorRole,array $target):bool{return $actorRole==='admin'||in_array($target['role'],['teacher','student'],true);}
try{
    if($method==='GET'){
        $where=$role==='admin'?'':' AND role IN (\'teacher\',\'student\')';
        $rows=$db->query("SELECT id,name,email,role,status,deleted_at,deleted_by FROM users WHERE deleted_at IS NOT NULL AND purged_at IS NULL{$where} ORDER BY deleted_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        trashReply(200,true,null,$rows);
    }
    $input=json_decode(file_get_contents('php://input'),true)?:[];
    $id=(int)($_GET['id']??$input['id']??0);if($id<1)trashReply(400,false,'Compte invalide.');
    $target=trashTarget($db,$id);if(!$target||empty($target['deleted_at'])||!empty($target['purged_at']))trashReply(404,false,'Compte introuvable dans la corbeille.');
    if(!trashCanManage($role,$target))trashReply(403,false,'La direction ne peut pas gérer un compte administrateur ou directeur supprimé.');
    if($id===$userId)trashReply(400,false,'Vous ne pouvez pas gérer votre propre compte depuis la corbeille.');

    if($method==='POST'&&($_GET['action']??'')==='restore'){
        $db->beginTransaction();
        $db->prepare("UPDATE users SET status='active',deleted_at=NULL,deleted_by=NULL,purged_at=NULL WHERE id=:id")->execute([':id'=>$id]);
        if($target['role']==='student')$db->prepare("UPDATE students SET status='active' WHERE user_id=:id")->execute([':id'=>$id]);
        if($target['role']==='teacher')$db->prepare("UPDATE teachers SET status='active' WHERE user_id=:id")->execute([':id'=>$id]);
        $db->commit();
        trashReply(200,true,'Compte restauré. Les droits personnalisés devront être revérifiés si nécessaire.');
    }

    if($method==='DELETE'){
        $db->beginTransaction();
        $anonymousEmail=sprintf('purged+%d+%d@invalid.local',$id,time());$anonymousName='Compte purgé #'.$id;$password=password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT);
        $db->prepare('DELETE FROM auth_tokens WHERE user_id=:id')->execute([':id'=>$id]);
        $db->prepare('DELETE FROM ws_tickets WHERE user_id=:id')->execute([':id'=>$id]);
        $db->prepare('DELETE FROM user_feature_permissions WHERE user_id=:id')->execute([':id'=>$id]);
        $db->prepare('DELETE FROM user_profiles WHERE user_id=:id')->execute([':id'=>$id]);
        if($target['role']==='student'){
            $db->prepare("UPDATE students SET first_name='Compte',last_name=:last_name,email=:email,phone=NULL,birth_date=NULL,birth_place=NULL,address=NULL,city=NULL,postal_code=NULL,nationality=NULL,emergency_contact_name=NULL,emergency_contact_phone=NULL,photo_url=NULL,status='inactive' WHERE user_id=:id")
              ->execute([':last_name'=>'purgé #'.$id,':email'=>$anonymousEmail,':id'=>$id]);
        }
        if($target['role']==='teacher'){
            $db->prepare("UPDATE teachers SET first_name='Compte',last_name=:last_name,email=:email,phone=NULL,birth_date=NULL,address=NULL,city=NULL,postal_code=NULL,nationality=NULL,profession=NULL,diploma=NULL,photo_url=NULL,status='inactive' WHERE user_id=:id")
              ->execute([':last_name'=>'purgé #'.$id,':email'=>$anonymousEmail,':id'=>$id]);
        }
        $db->prepare("UPDATE users SET name=:name,email=:email,password=:password,status='inactive',purged_at=UTC_TIMESTAMP() WHERE id=:id")
          ->execute([':name'=>$anonymousName,':email'=>$anonymousEmail,':password'=>$password,':id'=>$id]);
        $db->commit();
        trashReply(200,true,'Compte purgé définitivement. Les identifiants techniques nécessaires aux historiques ont été conservés anonymisés.');
    }
    trashReply(405,false,'Méthode non autorisée.');
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();error_log('trash.php: '.$e->getMessage());trashReply(500,false,'Erreur lors de la gestion de la corbeille.');}
