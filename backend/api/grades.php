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

function getGradeTeacherId($db) {
    $stmt = $db->prepare('SELECT id FROM teachers WHERE user_id = :user_id');
    $stmt->execute([':user_id' => $_SESSION['user_id']]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int)$id;
}

function teacherOwnsGradeCourse($db, $teacherId, $courseId) {
    $stmt = $db->prepare('
        SELECT 1
        FROM planning_schedules
        WHERE teacher_id = :teacher_id AND course_id = :course_id
        LIMIT 1
    ');
    $stmt->execute([':teacher_id' => $teacherId, ':course_id' => $courseId]);
    return (bool)$stmt->fetchColumn();
}

function studentBelongsToGradeCourse($db, $studentId, $courseId) {
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

function gradeSelectSql($where = '') {
    return "
        SELECT g.id, g.student_id, g.evaluation_id, g.score, g.max_score,
               g.status, g.grade_date, g.is_absent, g.created_at,
               CONCAT(s.first_name, ' ', s.last_name) AS student_name,
               s.student_number,
               ev.title AS evaluation_title,
               c.id AS course_id,
               c.name AS course_name
        FROM grades g
        INNER JOIN students s ON s.id = g.student_id
        INNER JOIN evaluations ev ON ev.id = g.evaluation_id
        INNER JOIN courses c ON c.id = ev.course_id
        $where
        ORDER BY g.grade_date DESC, g.id DESC
    ";
}

function validateGradeValues($input) {
    $rawMaxScore = $input['max_score'] ?? 20;
    $maxScore = filter_var($rawMaxScore, FILTER_VALIDATE_INT);
    if ($maxScore === false) return null;
    $isAbsent = !empty($input['is_absent']);
    $rawScore = $input['score'] ?? null;
    if (!$isAbsent && $rawScore !== null && $rawScore !== '' && !is_numeric($rawScore)) return null;
    $score = $isAbsent || $rawScore === null || $rawScore === '' ? null : (float)$rawScore;

    if ($maxScore <= 0 || $maxScore > 1000 || ($score !== null && ($score < 0 || $score > $maxScore))) {
        return null;
    }

    $allowedStatuses = ['pending', 'completed', 'absent'];
    $status = $input['status'] ?? ($isAbsent ? 'absent' : ($score === null ? 'pending' : 'completed'));
    if (!in_array($status, $allowedStatuses, true)) {
        return null;
    }

    return ['score' => $score, 'max_score' => $maxScore, 'is_absent' => $isAbsent ? 1 : 0, 'status' => $status];
}

try {
    if ($method === 'GET' && ($_GET['resource'] ?? '') === 'references') {
        if ($_SESSION['user_role'] === 'student') {
            echo json_encode(['success' => true, 'data' => ['students' => [], 'evaluations' => []]]);
            exit();
        }

        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getGradeTeacherId($db);
            if ($teacherId === null) {
                echo json_encode(['success' => true, 'data' => ['students' => [], 'evaluations' => []]]);
                exit();
            }

            $evaluationStmt = $db->prepare(<<<SQL
                SELECT DISTINCT ev.id, ev.title, ev.course_id, c.name AS course_name
                FROM evaluations ev
                INNER JOIN courses c ON c.id = ev.course_id
                INNER JOIN planning_schedules ps ON ps.course_id = ev.course_id
                WHERE ps.teacher_id = :teacher_id
                ORDER BY ev.evaluation_date DESC, ev.title
            SQL);
            $evaluationStmt->execute([':teacher_id' => $teacherId]);

            $studentStmt = $db->prepare(<<<SQL
                SELECT DISTINCT s.id, s.student_number, s.first_name, s.last_name
                FROM students s
                INNER JOIN enrollments en
                    ON en.student_id = s.id AND en.status = 'Enrolled'
                INNER JOIN courses c
                    ON c.level_id = en.level_id
                   AND COALESCE(c.specialization_id, 0) = COALESCE(en.specialization_id, 0)
                INNER JOIN planning_schedules ps
                    ON ps.course_id = c.id AND ps.teacher_id = :teacher_id
                WHERE s.status = 'active'
                ORDER BY s.last_name, s.first_name
            SQL);
            $studentStmt->execute([':teacher_id' => $teacherId]);
        } else {
            $evaluationStmt = $db->query(<<<SQL
                SELECT ev.id, ev.title, ev.course_id, c.name AS course_name
                FROM evaluations ev
                INNER JOIN courses c ON c.id = ev.course_id
                ORDER BY ev.evaluation_date DESC, ev.title
            SQL);
            $studentStmt = $db->query(<<<SQL
                SELECT DISTINCT s.id, s.student_number, s.first_name, s.last_name
                FROM students s
                INNER JOIN enrollments en ON en.student_id = s.id AND en.status = 'Enrolled'
                WHERE s.status = 'active'
                ORDER BY s.last_name, s.first_name
            SQL);
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'students' => $studentStmt->fetchAll(PDO::FETCH_ASSOC),
                'evaluations' => $evaluationStmt->fetchAll(PDO::FETCH_ASSOC),
            ],
        ]);
        exit();
    }

    if ($method === 'GET') {
        if ($_SESSION['user_role'] === 'student') {
            $stmt = $db->prepare(gradeSelectSql("WHERE s.user_id = :user_id AND g.status IN ('completed', 'absent')"));
            $stmt->execute([':user_id' => $_SESSION['user_id']]);
        } elseif ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getGradeTeacherId($db);
            if ($teacherId === null) {
                echo json_encode(['success' => true, 'data' => []]);
                exit();
            }
            $stmt = $db->prepare(gradeSelectSql('
                WHERE EXISTS (
                    SELECT 1 FROM planning_schedules ps
                    WHERE ps.course_id = c.id AND ps.teacher_id = :teacher_id
                )
            '));
            $stmt->execute([':teacher_id' => $teacherId]);
        } else {
            $stmt = $db->query(gradeSelectSql());
        }
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit();
    }

    if ($method === 'POST') {
        $studentId = (int)($input['student_id'] ?? 0);
        $evaluationId = (int)($input['evaluation_id'] ?? 0);
        $values = validateGradeValues($input);
        if ($studentId < 1 || $evaluationId < 1 || $values === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Étudiant, évaluation ou note invalide.']);
            exit();
        }

        $evalStmt = $db->prepare('SELECT course_id FROM evaluations WHERE id = :id');
        $evalStmt->execute([':id' => $evaluationId]);
        $courseId = $evalStmt->fetchColumn();
        if ($courseId === false || !studentBelongsToGradeCourse($db, $studentId, (int)$courseId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "L'étudiant n'est pas inscrit au cours de cette évaluation."]);
            exit();
        }

        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getGradeTeacherId($db);
            if ($teacherId === null || !teacherOwnsGradeCourse($db, $teacherId, (int)$courseId)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Vous ne pouvez noter que vos propres cours.']);
                exit();
            }
        }

        $duplicate = $db->prepare('SELECT id FROM grades WHERE student_id = :student_id AND evaluation_id = :evaluation_id');
        $duplicate->execute([':student_id' => $studentId, ':evaluation_id' => $evaluationId]);
        if ($duplicate->fetchColumn()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Une note existe déjà pour cet étudiant et cette évaluation.']);
            exit();
        }

        $gradeDate = (string)($input['grade_date'] ?? date('Y-m-d'));
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $gradeDate);
        if (!$date || $date->format('Y-m-d') !== $gradeDate) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Date de note invalide.']);
            exit();
        }

        $stmt = $db->prepare('
            INSERT INTO grades
                (student_id, evaluation_id, score, max_score, status, grade_date, is_absent)
            VALUES
                (:student_id, :evaluation_id, :score, :max_score, :status, :grade_date, :is_absent)
        ');
        $stmt->execute([
            ':student_id' => $studentId,
            ':evaluation_id' => $evaluationId,
            ':score' => $values['score'],
            ':max_score' => $values['max_score'],
            ':status' => $values['status'],
            ':grade_date' => $gradeDate,
            ':is_absent' => $values['is_absent'],
        ]);
        echo json_encode(['success' => true, 'message' => 'Note ajoutée.', 'id' => $db->lastInsertId()]);
        exit();
    }

    if (($method === 'PUT' || $method === 'DELETE') && isset($_GET['id'])) {
        $id = (int)$_GET['id'];
        $existingStmt = $db->prepare('
            SELECT g.id, g.grade_date, ev.course_id
            FROM grades g
            INNER JOIN evaluations ev ON ev.id = g.evaluation_id
            WHERE g.id = :id
        ');
        $existingStmt->execute([':id' => $id]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Note introuvable.']);
            exit();
        }
        if ($_SESSION['user_role'] === 'teacher') {
            $teacherId = getGradeTeacherId($db);
            if ($teacherId === null || !teacherOwnsGradeCourse($db, $teacherId, (int)$existing['course_id'])) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Vous ne pouvez modifier que les notes de vos propres cours.']);
                exit();
            }
        }

        if ($method === 'PUT') {
            $values = validateGradeValues($input);
            if ($values === null) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Valeurs de note invalides.']);
                exit();
            }
            $gradeDate = (string)($input['grade_date'] ?? $existing['grade_date'] ?? date('Y-m-d'));
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $gradeDate);
            if (!$date || $date->format('Y-m-d') !== $gradeDate) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Date de note invalide.']);
                exit();
            }
            $stmt = $db->prepare('
                UPDATE grades
                SET score = :score, max_score = :max_score, status = :status,
                    grade_date = :grade_date, is_absent = :is_absent
                WHERE id = :id
            ');
            $stmt->execute([
                ':id' => $id,
                ':score' => $values['score'],
                ':max_score' => $values['max_score'],
                ':status' => $values['status'],
                ':grade_date' => $gradeDate,
                ':is_absent' => $values['is_absent'],
            ]);
            echo json_encode(['success' => true, 'message' => 'Note mise à jour.']);
        } else {
            $stmt = $db->prepare('DELETE FROM grades WHERE id = :id');
            $stmt->execute([':id' => $id]);
            echo json_encode(['success' => true, 'message' => 'Note supprimée.']);
        }
        exit();
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
} catch (PDOException $e) {
    error_log('PDOException in grades.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
