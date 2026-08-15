<?php
/**
 * enrollments.php
 *
 * Endpoint manquant de la Task #4 : jusqu'ici Enrollment.php (modèle) et
 * Student::enroll() existaient mais n'étaient appelés par AUCUNE route API,
 * donc il n'existait aucun moyen réel d'inscrire un étudiant à un niveau /
 * spécialisation. Ce fichier expose enfin cette fonctionnalité.
 *
 * GET    ?student_id=X        -> historique des inscriptions d'un étudiant
 *                                 (admin/directeur/teacher : n'importe quel
 *                                 étudiant ; student : uniquement lui-même)
 * GET    (sans paramètre)      -> liste complète des inscriptions
 *                                 (réservé au personnel)
 * POST                         -> inscrit un étudiant à un niveau/spécialisation
 *                                 pour une année donnée (réservé au personnel)
 *                                 body: { student_id, level_id, specialization_id,
 *                                         academic_year, status? }
 * PUT    ?id=X                 -> met à jour le statut d'une inscription
 *                                 (ex: passer à 'Dropped' ou 'Completed')
 * DELETE ?id=X                 -> supprime une inscription (admin/directeur)
 *
 * Règles métier appliquées ici (absentes du modèle Enrollment.php d'origine) :
 *  - Vérification de capacité (niveau ET spécialisation) via
 *    Student::checkEnrollmentCapacity(), pour ne pas dépasser levels.capacity
 *    / specializations.capacity.
 *  - Un étudiant ne peut pas avoir deux inscriptions 'Enrolled' simultanées :
 *    on referme automatiquement (status = 'Completed') toute inscription
 *    active précédente avant d'en créer une nouvelle, plutôt que d'empiler
 *    des doublons contradictoires.
 */
require_once '../config/database.php';
require_once '../models/Enrollment.php';
require_once '../models/Student.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

// Role-based access control
// GET : admin/directeur/teacher voient toutes les inscriptions ; student ne
//       voit que les siennes (filtré plus bas, jamais via un id fourni par
//       le client).
// POST/PUT/DELETE : gestion administrative, réservée au personnel.
$allowedRoles = [];
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $allowedRoles = ['admin', 'directeur', 'teacher', 'student'];
} else {
    $allowedRoles = ['admin', 'directeur'];
}
if (empty($_SESSION['user_role']) || !in_array($_SESSION['user_role'], $allowedRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$enrollment = new Enrollment($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        handleGet($db, $enrollment);
    } elseif ($method === 'POST') {
        handlePost($db, $input);
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        handlePut($db, $enrollment, intval($_GET['id']), $input);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        handleDelete($db, intval($_GET['id']));
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in enrollments.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}

/**
 * Résout students.id à partir de users.id (session), pour qu'un étudiant ne
 * puisse jamais voir/filtrer les inscriptions d'un autre en passant un
 * student_id arbitraire dans la query string.
 */
function getSessionStudentId($db) {
    $stmt = $db->prepare("SELECT id FROM students WHERE user_id = :user_id");
    $stmt->bindParam(':user_id', $_SESSION['user_id']);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? (int)$row['id'] : null;
}

function handleGet($db, $enrollment) {
    $role = $_SESSION['user_role'];

    if ($role === 'student') {
        // Un étudiant ne voit que son propre historique d'inscriptions,
        // quel que soit le student_id éventuellement passé en query string.
        $studentId = getSessionStudentId($db);
        if ($studentId === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Aucun profil étudiant associé à ce compte.']);
            return;
        }
        $stmt = $db->prepare("
            SELECT e.*, s.student_number, s.first_name, s.last_name,
                   l.name AS level_name, sp.name AS specialization_name
            FROM enrollments e
            LEFT JOIN students s ON e.student_id = s.id
            LEFT JOIN levels l ON e.level_id = l.id
            LEFT JOIN specializations sp ON e.specialization_id = sp.id
            WHERE e.student_id = :student_id
            ORDER BY e.enrollment_date DESC
        ");
        $stmt->bindParam(':student_id', $studentId, PDO::PARAM_INT);
        $stmt->execute();
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        return;
    }

    if ($role === 'teacher') {
        $conditions = ['t.user_id = :user_id'];
        $params = [':user_id' => $_SESSION['user_id']];
        if (isset($_GET['student_id'])) {
            $conditions[] = 'e.student_id = :student_id';
            $params[':student_id'] = intval($_GET['student_id']);
        }
        $whereClause = implode(' AND ', $conditions);
        $stmt = $db->prepare("
            SELECT DISTINCT e.*, s.student_number, s.first_name, s.last_name,
                   l.name AS level_name, sp.name AS specialization_name
            FROM enrollments e
            INNER JOIN students s ON e.student_id = s.id
            INNER JOIN planning_schedules ps
                ON ps.level_id = e.level_id
               AND COALESCE(ps.specialization_id, 0) = COALESCE(e.specialization_id, 0)
            INNER JOIN teachers t ON t.id = ps.teacher_id
            LEFT JOIN levels l ON e.level_id = l.id
            LEFT JOIN specializations sp ON e.specialization_id = sp.id
            WHERE $whereClause
            ORDER BY e.enrollment_date DESC
        ");
        $stmt->execute($params);
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        return;
    }

    // Administration (admin/directeur)
    if (isset($_GET['student_id'])) {
        $studentId = intval($_GET['student_id']);
        $stmt = $db->prepare("
            SELECT e.*, s.student_number, s.first_name, s.last_name,
                   l.name AS level_name, sp.name AS specialization_name
            FROM enrollments e
            LEFT JOIN students s ON e.student_id = s.id
            LEFT JOIN levels l ON e.level_id = l.id
            LEFT JOIN specializations sp ON e.specialization_id = sp.id
            WHERE e.student_id = :student_id
            ORDER BY e.enrollment_date DESC
        ");
        $stmt->bindParam(':student_id', $studentId, PDO::PARAM_INT);
        $stmt->execute();
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        return;
    }

    // Liste complète
    $stmt = $enrollment->readAll();
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function handlePost($db, $input) {
    $required = ['student_id', 'level_id', 'specialization_id', 'academic_year'];
    foreach ($required as $k) {
        if (empty($input[$k])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Champ $k manquant."]);
            return;
        }
    }

    $studentId = intval($input['student_id']);
    $levelId = intval($input['level_id']);
    $specializationId = intval($input['specialization_id']);
    $academicYear = trim($input['academic_year']);
    $status = $input['status'] ?? 'Enrolled';
    $groupId = !empty($input['group_id']) ? intval($input['group_id']) : null;
    $academicYearId = !empty($input['academic_year_id']) ? intval($input['academic_year_id']) : null;

    if (!preg_match('/^\d{4}-\d{4}$/', $academicYear)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Format d'année académique invalide (attendu AAAA-AAAA)."]);
        return;
    }

    $allowedStatuses = ['Enrolled', 'Dropped', 'Completed', 'Pending'];
    if (!in_array($status, $allowedStatuses, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Statut invalide.']);
        return;
    }

    if ($academicYearId === null) {
        $yearStmt = $db->prepare('SELECT id FROM academic_years WHERE name = :name LIMIT 1');
        $yearStmt->execute([':name' => $academicYear]);
        $academicYearId = $yearStmt->fetchColumn() ?: null;
    }

    if ($groupId !== null) {
        $groupStmt = $db->prepare("SELECT id, academic_year_id, level_id, specialization_id, capacity, tuition_amount,
                (SELECT COUNT(*) FROM enrollments e WHERE e.group_id = student_groups.id AND e.status = 'Enrolled') enrolled_count
            FROM student_groups WHERE id = :id AND is_active = 1");
        $groupStmt->execute([':id' => $groupId]);
        $group = $groupStmt->fetch(PDO::FETCH_ASSOC);
        if (!$group || (int)$group['level_id'] !== $levelId
            || ($group['specialization_id'] !== null && (int)$group['specialization_id'] !== $specializationId)
            || ($academicYearId !== null && (int)$group['academic_year_id'] !== (int)$academicYearId)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Le groupe sélectionné ne correspond pas à cette année, ce niveau ou cette spécialisation.']);
            return;
        }
        if ($status === 'Enrolled' && (int)$group['enrolled_count'] >= (int)$group['capacity']) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'La capacité du groupe sélectionné est atteinte.']);
            return;
        }
    }

    // Vérifie que l'étudiant existe.
    $stmt = $db->prepare("SELECT id FROM students WHERE id = :id");
    $stmt->bindParam(':id', $studentId, PDO::PARAM_INT);
    $stmt->execute();
    if ($stmt->fetchColumn() === false) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Étudiant introuvable.']);
        return;
    }

    // Vérifie la capacité du niveau ET de la spécialisation avant d'inscrire
    // (Student::checkEnrollmentCapacity existait déjà mais n'était jamais
    // appelée depuis une route API).
    if ($status === 'Enrolled') {
        $studentModel = new Student($db);
        $capacity = $studentModel->checkEnrollmentCapacity($levelId, $specializationId);
        if (!$capacity['can_enroll']) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'message' => "Capacité atteinte pour ce niveau/spécialisation ({$capacity['current_enrollments']}/{$capacity['max_capacity']}).",
            ]);
            return;
        }
    }

    $db->beginTransaction();
    try {
        // Un étudiant ne doit pas avoir deux inscriptions 'Enrolled' en
        // parallèle : on referme silencieusement toute inscription active
        // précédente (changement de niveau/spécialisation en cours d'année,
        // passage à l'année suivante, etc.) avant de créer la nouvelle.
        if ($status === 'Enrolled') {
            $closePrevious = $db->prepare("
                UPDATE enrollments SET status = 'Completed'
                WHERE student_id = :student_id AND status = 'Enrolled'
            ");
            $closePrevious->bindParam(':student_id', $studentId, PDO::PARAM_INT);
            $closePrevious->execute();
        }

        $stmt = $db->prepare("
            INSERT INTO enrollments (student_id, level_id, specialization_id, group_id, academic_year, academic_year_id, enrollment_date, status)
            VALUES (:student_id, :level_id, :specialization_id, :group_id, :academic_year, :academic_year_id, CURDATE(), :status)
        ");
        $stmt->bindParam(':student_id', $studentId, PDO::PARAM_INT);
        $stmt->bindParam(':level_id', $levelId, PDO::PARAM_INT);
        $stmt->bindParam(':specialization_id', $specializationId, PDO::PARAM_INT);
        $stmt->bindValue(':group_id', $groupId, $groupId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindParam(':academic_year', $academicYear);
        $stmt->bindValue(':academic_year_id', $academicYearId, $academicYearId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindParam(':status', $status);
        $stmt->execute();
        $newId = $db->lastInsertId();

        if ($groupId !== null && isset($group)) {
            $feeStmt = $db->prepare("INSERT INTO student_fee_accounts (enrollment_id, tuition_amount, status)
                VALUES (:enrollment_id, :tuition_amount, 'Pending')
                ON DUPLICATE KEY UPDATE tuition_amount = VALUES(tuition_amount)");
            $feeStmt->execute([':enrollment_id' => $newId, ':tuition_amount' => $group['tuition_amount']]);
        }

        $db->commit();
        http_response_code(201);
        echo json_encode(['success' => true, 'message' => 'Étudiant inscrit avec succès.', 'id' => (int)$newId]);
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function handlePut($db, $enrollment, $id, $input) {
    $enrollment->id = $id;
    if (!$enrollment->readOne()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Inscription introuvable.']);
        return;
    }

    if (isset($input['status'])) {
        $allowedStatuses = ['Enrolled', 'Dropped', 'Completed', 'Pending'];
        if (!in_array($input['status'], $allowedStatuses, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Statut invalide.']);
            return;
        }
        $enrollment->status = $input['status'];
    }
    if (isset($input['level_id'])) $enrollment->level_id = intval($input['level_id']);
    if (isset($input['specialization_id'])) $enrollment->specialization_id = intval($input['specialization_id']);
    if (isset($input['academic_year'])) $enrollment->academic_year = $input['academic_year'];

    if ($enrollment->update()) {
        if (array_key_exists('group_id', $input) || array_key_exists('academic_year_id', $input)) {
            $extra = $db->prepare('UPDATE enrollments SET group_id = :group_id, academic_year_id = :academic_year_id WHERE id = :id');
            $extra->execute([
                ':group_id' => !empty($input['group_id']) ? intval($input['group_id']) : null,
                ':academic_year_id' => !empty($input['academic_year_id']) ? intval($input['academic_year_id']) : null,
                ':id' => $id,
            ]);
        }
        echo json_encode(['success' => true, 'message' => 'Inscription mise à jour.']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => "Erreur lors de la mise à jour de l'inscription."]);
    }
}

function handleDelete($db, $id) {
    // Suppression réservée à admin/directeur (un enseignant ne doit pas
    // pouvoir supprimer l'historique d'inscription d'un étudiant).
    if (!in_array($_SESSION['user_role'], ['admin', 'directeur'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Accès refusé - privilèges administrateur ou directeur requis.']);
        return;
    }

    $stmt = $db->prepare("SELECT id FROM enrollments WHERE id = :id");
    $stmt->bindParam(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    if ($stmt->fetchColumn() === false) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Inscription introuvable.']);
        return;
    }

    $stmt = $db->prepare("DELETE FROM enrollments WHERE id = :id");
    $stmt->bindParam(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode(['success' => true, 'message' => 'Inscription supprimée.']);
}
?>
