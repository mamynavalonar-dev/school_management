<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
require_once '../config/cors.php';
applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Allow-Credentials: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['success'=>false,'status'=>'method_not_allowed']); exit; }
require_once '../config/demo_database_probe.php';
require_once '../services/AivenWakeService.php';
if (DemoDatabaseProbe::isReady()) { http_response_code(200); echo json_encode(['success'=>true,'status'=>'ready','message'=>'La démonstration est prête.']); exit; }
$retry = 10;
$wake = new AivenWakeService();
if (!$wake->isEnabled()) { http_response_code(503); header('Retry-After: 15'); echo json_encode(['success'=>false,'status'=>'unavailable','message'=>'La base de données est momentanément indisponible.','retryAfter'=>15]); exit; }
if (!$wake->isConfigured()) { error_log('Demo readiness: configuration Aiven incomplète.'); http_response_code(503); header('Retry-After: 15'); echo json_encode(['success'=>false,'status'=>'configuration_error','message'=>'Le réveil automatique doit être vérifié.','retryAfter'=>15]); exit; }
$state = $wake->getState();
$s = $state['state'] ?? 'unknown';
if ($state['ok'] && in_array($s,['poweroff','poweredoff','off'],true)) {
    $r = $wake->powerOn();
    if (!$r['ok']) { http_response_code(503); header('Retry-After: 15'); echo json_encode(['success'=>false,'status'=>'wake_error','message'=>'Le démarrage automatique a rencontré un problème temporaire.','retryAfter'=>15]); exit; }
    http_response_code(202); header('Retry-After: '.$retry); echo json_encode(['success'=>false,'status'=>'waking','message'=>'La base de données est en cours de démarrage.','retryAfter'=>$retry]); exit;
}
if ($state['ok'] && in_array($s,['rebuilding','rebalancing'],true)) { http_response_code(202); header('Retry-After: '.$retry); echo json_encode(['success'=>false,'status'=>'waking','message'=>'La base de données est en cours de restauration.','retryAfter'=>$retry]); exit; }
if ($state['ok'] && $s === 'running') { http_response_code(202); header('Retry-After: '.$retry); echo json_encode(['success'=>false,'status'=>'connecting','message'=>'La base est active. Finalisation de la connexion…','retryAfter'=>$retry]); exit; }
if (!$state['ok']) { http_response_code(503); header('Retry-After: 15'); echo json_encode(['success'=>false,'status'=>'provider_unavailable','message'=>'Vérification du service de données en cours…','retryAfter'=>15]); exit; }
http_response_code(202); header('Retry-After: '.$retry); echo json_encode(['success'=>false,'status'=>'waking','message'=>'Préparation du service de données…','retryAfter'=>$retry]);
