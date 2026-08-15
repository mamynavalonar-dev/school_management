<?php
/**
 * absence_justifications.php
 *
 * Gère l'upload d'un justificatif (PDF/image) par l'étudiant concerné, et
 * le téléchargement contrôlé de ce fichier par le personnel autorisé.
 *
 * POST   ?absence_id=X   (multipart/form-data, champ "file") -> upload (student, propriétaire de l'absence uniquement)
 * GET    ?absence_id=X   -> liste des fichiers joints à cette absence (admin/directeur/teacher, ou l'étudiant propriétaire)
 * GET    ?download=ID    -> télécharge un fichier précis (mêmes règles que ci-dessus)
 *
 * Le fichier n'est JAMAIS servi par une URL statique : tout passe par ce
 * script, qui revérifie les droits avant de streamer le contenu.
 */
require_once '../config/database.php';
require_once '../config/upload_guard.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET' && isset($_GET['download'])) {
        downloadJustification($db, intval($_GET['download']));
        exit();
    }

    // Toutes les autres routes renvoient du JSON.
    header("Content-Type: application/json; charset=UTF-8");

    if ($method === 'POST' && isset($_GET['absence_id'])) {
        uploadJustification($db, intval($_GET['absence_id']));
    } elseif ($method === 'GET' && isset($_GET['absence_id'])) {
        listJustifications($db, intval($_GET['absence_id']));
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Requête invalide.']);
    }
} catch (Throwable $e) {
    error_log("Throwable in absence_justifications.php: " . $e->getMessage());
    http_response_code(500);
    header("Content-Type: application/json; charset=UTF-8");
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}

/**
 * Vérifie que l'utilisateur en session est bien l'étudiant propriétaire de
 * cette absence, ou un membre du personnel autorisé. Retourne le student_id
 * propriétaire de l'absence, ou null si l'absence n'existe pas.
 */
function getAbsenceOwnerStudentId($db, $absenceId) {
    $stmt = $db->prepare("SELECT student_id FROM absences WHERE id = :id");
    $stmt->bindParam(':id', $absenceId, PDO::PARAM_INT);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? (int)$row['student_id'] : null;
}

function isOwnerStudent($db, $studentId) {
    $stmt = $db->prepare("SELECT 1 FROM students WHERE id = :student_id AND user_id = :user_id");
    $stmt->bindParam(':student_id', $studentId, PDO::PARAM_INT);
    $stmt->bindParam(':user_id', $_SESSION['user_id']);
    $stmt->execute();
    return $stmt->fetchColumn() !== false;
}

function teacherCanAccessAbsence($db, $absenceId) {
    $stmt = $db->prepare("
        SELECT 1
        FROM absences a
        INNER JOIN courses c ON c.id = a.course_id
        INNER JOIN planning_schedules ps ON ps.course_id = c.id
        INNER JOIN teachers t ON t.id = ps.teacher_id
        WHERE a.id = :absence_id AND t.user_id = :user_id
        LIMIT 1
    ");
    $stmt->execute([
        ':absence_id' => $absenceId,
        ':user_id' => $_SESSION['user_id'],
    ]);
    return (bool)$stmt->fetchColumn();
}

function uploadJustification($db, $absenceId) {
    if ($_SESSION['user_role'] !== 'student') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => "Seul l'étudiant concerné peut ajouter un justificatif."]);
        return;
    }

    $ownerStudentId = getAbsenceOwnerStudentId($db, $absenceId);
    if ($ownerStudentId === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Absence introuvable.']);
        return;
    }

    if (!isOwnerStudent($db, $ownerStudentId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Cette absence ne vous appartient pas.']);
        return;
    }

    if (!isset($_FILES['file'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Aucun fichier reçu (champ "file" attendu).']);
        return;
    }

    try {
        $uploaded = handleSecureUpload($_FILES['file'], 'absences');
    } catch (UploadException $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        return;
    }

    $db->beginTransaction();
    try {
        $stmt = $db->prepare("
            INSERT INTO absence_justification_files
                (absence_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
            VALUES (:absence_id, :original_name, :stored_name, :mime_type, :size_bytes, :uploaded_by)
        ");
        $stmt->bindParam(':absence_id', $absenceId, PDO::PARAM_INT);
        $stmt->bindParam(':original_name', $uploaded['original_name']);
        $stmt->bindParam(':stored_name', $uploaded['stored_name']);
        $stmt->bindParam(':mime_type', $uploaded['mime_type']);
        $stmt->bindParam(':size_bytes', $uploaded['size_bytes'], PDO::PARAM_INT);
        $stmt->bindParam(':uploaded_by', $_SESSION['user_id']);
        $stmt->execute();
        $justificationId = (int)$db->lastInsertId();

        // Le dépôt d'un justificatif repasse l'absence en attente de validation
        // par le personnel plutôt que de l'auto-valider.
        $update = $db->prepare("UPDATE absences SET status = 'pending' WHERE id = :id");
        $update->bindParam(':id', $absenceId, PDO::PARAM_INT);
        $update->execute();
        $db->commit();

        http_response_code(201);
        echo json_encode(['success' => true, 'message' => 'Justificatif envoyé, en attente de validation.', 'id' => $justificationId]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        if (is_file($uploaded['path'])) {
            unlink($uploaded['path']);
        }
        throw $e;
    }
}

function listJustifications($db, $absenceId) {
    $ownerStudentId = getAbsenceOwnerStudentId($db, $absenceId);
    if ($ownerStudentId === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Absence introuvable.']);
        return;
    }

    $isStaff = in_array($_SESSION['user_role'], ['admin', 'directeur'], true);
    $isOwningTeacher = $_SESSION['user_role'] === 'teacher' && teacherCanAccessAbsence($db, $absenceId);
    $isOwner = $_SESSION['user_role'] === 'student' && isOwnerStudent($db, $ownerStudentId);

    if (!$isStaff && !$isOwningTeacher && !$isOwner) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Accès refusé.']);
        return;
    }

    $stmt = $db->prepare("
        SELECT id, original_name, mime_type, size_bytes, created_at
        FROM absence_justification_files
        WHERE absence_id = :absence_id
        ORDER BY created_at DESC
    ");
    $stmt->bindParam(':absence_id', $absenceId, PDO::PARAM_INT);
    $stmt->execute();
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function downloadJustification($db, $fileId) {
    $stmt = $db->prepare("
        SELECT ajf.*, a.id AS absence_id, a.student_id AS owner_student_id
        FROM absence_justification_files ajf
        INNER JOIN absences a ON a.id = ajf.absence_id
        WHERE ajf.id = :id
    ");
    $stmt->bindParam(':id', $fileId, PDO::PARAM_INT);
    $stmt->execute();
    $file = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$file) {
        http_response_code(404);
        header("Content-Type: application/json; charset=UTF-8");
        echo json_encode(['success' => false, 'message' => 'Fichier introuvable.']);
        return;
    }

    $isStaff = in_array($_SESSION['user_role'], ['admin', 'directeur'], true);
    $isOwningTeacher = $_SESSION['user_role'] === 'teacher'
        && teacherCanAccessAbsence($db, (int)$file['absence_id']);
    $isOwner = $_SESSION['user_role'] === 'student' && isOwnerStudent($db, (int)$file['owner_student_id']);

    if (!$isStaff && !$isOwningTeacher && !$isOwner) {
        http_response_code(403);
        header("Content-Type: application/json; charset=UTF-8");
        echo json_encode(['success' => false, 'message' => 'Accès refusé.']);
        return;
    }

    $path = resolveSecureUploadPath('absences', $file['stored_name']);
    if ($path === null || !is_file($path)) {
        http_response_code(404);
        header("Content-Type: application/json; charset=UTF-8");
        echo json_encode(['success' => false, 'message' => 'Fichier introuvable sur le disque.']);
        return;
    }

    header("Content-Type: " . $file['mime_type']);
    header("Content-Disposition: inline; filename=\"" . rawurlencode($file['original_name']) . "\"");
    header("Content-Length: " . filesize($path));
    header("X-Content-Type-Options: nosniff");
    readfile($path);
}
?>
