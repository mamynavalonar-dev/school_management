<?php
header('Content-Type: application/json; charset=utf-8');
require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Simple health check: vérification accès base de données
try {
    require_once '../config/database.php';
    $database = new Database();
    $db = $database->getConnection();

    if ($db) {
        echo json_encode(['status'=>'ok','success'=>true,'message'=>'Le serveur est opérationnel']);
    } else {
        http_response_code(500);
        echo json_encode(['status'=>'fail','success'=>false,'message'=>'Impossible de se connecter à la base de données']);
    }
} catch (Throwable $e) {
    error_log('Health check failure: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status'=>'fail','success'=>false,'message'=>'Service indisponible']);
}
?>
