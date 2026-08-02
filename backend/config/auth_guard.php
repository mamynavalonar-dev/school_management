<?php
/**
 * Authentication guard middleware.
 * Ensures the user is logged in by checking $_SESSION['user_id'].
 * If not authenticated, returns a 401 JSON response and exits.
 */
session_start(); // Ensure session is started

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'success' => false,
        'message' => 'Non authentifié'
    ]);
    exit();
}
?>


