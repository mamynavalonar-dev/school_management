<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");

// Prévols CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

session_start();

$path = $_SERVER['REQUEST_URI'];
$apiDir = __DIR__ . '/api/';

$routes = [
    '/api/auth.php'        => 'auth.php',
    '/api/student.php'     => 'student.php',
    '/api/teachers.php'    => 'teachers.php',
    '/api/courses.php'     => 'courses.php',
    '/api/dashboard.php'   => 'dashboard.php',
    '/api/health.php'      => 'health.php'
];

$found = false;
foreach ($routes as $endpoint => $file) {
    if (strpos($path, $endpoint) !== false) {
        require $apiDir . $file;
        $found = true;
        break;
    }
}
if (!$found) {
    http_response_code(404);
    echo json_encode(['success'=>false, 'message'=>"Route non trouvée : $path"]);
}
?>
