<?php
require_once '../config/database.php';
require_once '../config/cors.php';

applyCorsOrigin();
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    exit();
}

if (!in_array($_SESSION['user_role'] ?? '', ['admin', 'directeur', 'teacher', 'student'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé.']);
    exit();
}

if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Aucune image valide reçue.']);
    exit();
}

$file = $_FILES['photo'];
if ((int)$file['size'] <= 0 || (int)$file['size'] > 5 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode(['success' => false, 'message' => 'La photo doit peser moins de 5 Mo.']);
    exit();
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);
$extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
if (!isset($extensions[$mime]) || @getimagesize($file['tmp_name']) === false) {
    http_response_code(415);
    echo json_encode(['success' => false, 'message' => 'Formats acceptés : JPG, PNG ou WEBP.']);
    exit();
}

$directory = dirname(__DIR__) . '/uploads/profile-images';
if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Impossible de préparer le dossier des photos.']);
    exit();
}

$filename = bin2hex(random_bytes(18)) . '.' . $extensions[$mime];
$destination = $directory . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Échec de l’enregistrement de la photo.']);
    exit();
}
chmod($destination, 0644);

echo json_encode([
    'success' => true,
    'message' => 'Photo importée.',
    'data' => ['url' => '/uploads/profile-images/' . $filename],
], JSON_UNESCAPED_UNICODE);
?>
