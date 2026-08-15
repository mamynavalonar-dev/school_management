<?php
/**
 * Admin guard middleware.
 * Vérifie le rôle après auth_guard.php. Les endpoints administratifs
 * incluent obligatoirement auth_guard.php avant ce fichier ; refaire ici
 * toute la résolution du token doublait inutilement la requête en base.
 */
$allowedRoles = ['admin', 'directeur'];
if (empty($_SESSION['user_role']) || !in_array($_SESSION['user_role'], $allowedRoles)) {
    http_response_code(403); // Forbidden
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'success' => false,
        'message' => "Accès refusé - privilèges administrateur ou directeur requis"
    ]);
    exit();
}
?>
