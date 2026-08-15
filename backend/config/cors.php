<?php
require_once __DIR__ . '/env.php';

function applyCorsOrigin() {
    $configured = getenv('CORS_ALLOWED_ORIGINS');
    $allowedOrigins = $configured
        ? array_values(array_filter(array_map('trim', explode(',', $configured))))
        : ['http://localhost:5173', 'http://127.0.0.1:5173', 'null'];

    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if ($origin !== null && in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
}
?>
