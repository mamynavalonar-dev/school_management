<?php
require_once '../config/database.php';

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

$method = $_SERVER['REQUEST_METHOD'];
$allowedRoles = $method === 'GET'
    ? ['admin', 'directeur', 'teacher', 'student']
    : ['admin', 'directeur', 'teacher'];
if (empty($_SESSION['user_role']) || !in_array($_SESSION['user_role'], $allowedRoles, true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$db = (new Database())->getConnection();
$input = json_decode(file_get_contents('php://input'), true) ?: [];

function getAbsenceTeacherId($db) {
    $stmt = $db->prepare('SELECT id FROM teachers WHERE user_id = :user_id');
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int)$id;
}

function teacherOwnsAbsenceCourse($db, $teacherId, $courseId) {
    $stmt = $db->prepare('
        SELECT 1 FROM planning_schedules
        WHERE teacher_id = :teacher_id AND course_id = :course_id
        LIMIT 1
    ');
    $stmt->execute([':teacher_id' => $teacherId, ':course_id' => $courseId]);
    return (bool)$stmt->fetchColumn();
}

function studentBelongsToAbsenceCourse($db, $studentId, $courseId) {
    $stmt = $db->prepare('
        SELECT 1
        FROM courses c
        INNER JOIN enrollments en
            ON en.level_id = c.level_id
           AND COALESCE(en.specialization_id, 0) = COALESCE(c.specialization_id, 0)
           AND en.status = \'Enrolled\'
        WHERE c.id = :course_id AND en.student_id = :student_id
        LIMIT 1
    ');
    $stmt->execute([':course_id' => $courseId, ':student_id' => $studentId]);
    return (bool)$stmt->fetchColumn();
}

function absenceSelectSql($where = '') {
    return "
        SELECT a.id, a.student_id, a.course_id, a.date, a.reason, a.status,
               a.justification, a.created_at,
               CONCAT(s.first_name, ' ', s.last_name) AS student_name,
               s.student_number,
               c.name AS course_name
        FROM absences a
        INNER JOIN students s ON s.id = a.student_id
        INNER JOIN courses c ON c.id = a.course_id
        $where
        ORDER BY a.date DESC, a.id DESC
    ";
}

function validateAbsencePayload($input, $requireRelations = false) {
    $date = trim((string)($input['date'] ?? ''));
    $status = $input['status'] ?? 'pending';
    $dateValue = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$dateValue || $dateValue->format('Y-m-d') !== $date
        || !in_array($status, ['pending', 'justified', 'unjustified'], true)) {
        return null;
    }
    if ($requireRelations && ((int)($input['student_id'] ?? 0) < 1 || (int)($input['course_id'] ?? 0) < 1)) {
        return null;
    }
    $reason = trim((string)($input['reason'] ?? ''));
    $justification = trim((string)($input['justification'] ?? ''));
    if (mb_strlen($reason) > 255 || mb_strlen($justification) > 5000) return null;
    return [
        'date' => $date,
        'reason' => $reason,
        'status' => $status,
        'justification' => $justification,
    ];
}

try {
    if ($method === 'GET') {
        if ($_SESSION['user_role'] === 'student') {
            $stmt = $db->prepare(absenceSelectSql('WHERE s.user_id = :user_id'));
            $stmt->execute([':user_id' => $_SESSION['user_id']]);
        } elseif ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getAbsenceTeacherId($db);
            if ($teacherId === null) {
                echo json_encode(['success' => true, 'data' => []]);
                exit();
            }
            $stmt = $db->prepare(absenceSelectSql('
                WHERE EXISTS (
                    SELECT 1 FROM planning_schedules ps
                    WHERE ps.course_id = a.course_id AND ps.teacher_id = :teacher_id
                )
            '));
            $stmt->execute([':teacher_id' => $teacherId]);
        } else {
            $stmt = $db->query(absenceSelectSql());
        }
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit();
    }

    if ($method === 'POST') {
        $studentId = (int)($input['student_id'] ?? 0);
        $courseId = (int)($input['course_id'] ?? 0);
        $values = validateAbsencePayload($input, true);
        if ($values === null || !studentBelongsToAbsenceCourse($db, $studentId, $courseId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Étudiant, cours ou date invalide.']);
            exit();
        }

        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getAbsenceTeacherId($db);
            if ($teacherId === null || !teacherOwnsAbsenceCourse($db, $teacherId, $courseId)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => "Vous ne pouvez déclarer une absence que dans l'un de vos cours."]);
                exit();
            }
        }

        $duplicate = $db->prepare('
            SELECT id FROM absences
            WHERE student_id = :student_id AND course_id = :course_id AND date = :date
        ');
        $duplicate->execute([':student_id' => $studentId, ':course_id' => $courseId, ':date' => $values['date']]);
        if ($duplicate->fetchColumn()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Cette absence existe déjà pour ce cours et cette date.']);
            exit();
        }

        $stmt = $db->prepare('
            INSERT INTO absences (student_id, course_id, date, reason, status, justification)
            VALUES (:student_id, :course_id, :date, :reason, :status, :justification)
        ');
        $stmt->execute([
            ':student_id' => $studentId,
            ':course_id' => $courseId,
            ':date' => $values['date'],
            ':reason' => $values['reason'],
            ':status' => $values['status'],
            ':justification' => $values['justification'],
        ]);
        echo json_encode(['success' => true, 'message' => 'Absence ajoutée.', 'id' => $db->lastInsertId()]);
        exit();
    }

    if (($method === 'PUT' || $method === 'DELETE') && isset($_GET['id'])) {
        $id = (int)$_GET['id'];
        $existingStmt = $db->prepare('SELECT id, course_id FROM absences WHERE id = :id');
        $existingStmt->execute([':id' => $id]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Absence introuvable.']);
            exit();
        }
        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getAbsenceTeacherId($db);
            if ($teacherId === null || !teacherOwnsAbsenceCourse($db, $teacherId, (int)$existing['course_id'])) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Vous ne pouvez modifier que les absences de vos propres cours.']);
                exit();
            }
        }

        if ($method === 'PUT') {
            $values = validateAbsencePayload($input);
            if ($values === null) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Données d'absence invalides."]);
                exit();
            }
            $stmt = $db->prepare('
                UPDATE absences
                SET date = :date, reason = :reason, status = :status, justification = :justification
                WHERE id = :id
            ');
            $stmt->execute([
                ':id' => $id,
                ':date' => $values['date'],
                ':reason' => $values['reason'],
                ':status' => $values['status'],
                ':justification' => $values['justification'],
            ]);
            echo json_encode(['success' => true, 'message' => 'Absence mise à jour.']);
        } else {
            $stmt = $db->prepare('DELETE FROM absences WHERE id = :id');
            $stmt->execute([':id' => $id]);
            echo json_encode(['success' => true, 'message' => 'Absence supprimée.']);
        }
        exit();
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
} catch (PDOException $e) {
    error_log('PDOException in absences.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
