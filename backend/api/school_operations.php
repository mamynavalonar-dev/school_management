<?php
require_once '../config/database.php';
require_once '../config/cors.php';

applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$resource = $_GET['resource'] ?? 'overview';
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$role = $_SESSION['user_role'] ?? '';
$userId = (int)($_SESSION['user_id'] ?? 0);

if (!in_array($role, ['admin', 'directeur', 'teacher', 'student'], true)) {
    reply(403, false, 'Accès refusé.');
}

try {
    if ($method === 'GET') {
        handleGet($db, $resource, $role, $userId);
    } elseif ($method === 'POST') {
        handlePost($db, $resource, $input, $role, $userId);
    } elseif ($method === 'PUT') {
        handlePut($db, $resource, $input, $role, $userId);
    } elseif ($method === 'DELETE') {
        handleDelete($db, $resource, $role);
    } else {
        reply(405, false, 'Méthode non autorisée.');
    }
} catch (PDOException $e) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) $db->rollBack();
    error_log('PDOException in school_operations.php: ' . $e->getMessage());
    $message = $e->getCode() === '23000'
        ? 'Cette opération est impossible car des données liées existent déjà.'
        : 'Une erreur serveur est survenue.';
    reply(500, false, $message);
} catch (Throwable $e) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) $db->rollBack();
    error_log('Throwable in school_operations.php: ' . $e->getMessage());
    reply(500, false, 'Une erreur serveur est survenue.');
}

function reply($status, $success, $message = null, $data = null, $extra = []) {
    http_response_code($status);
    $payload = ['success' => $success];
    if ($message !== null) $payload['message'] = $message;
    if ($data !== null) $payload['data'] = $data;
    echo json_encode(array_merge($payload, $extra), JSON_UNESCAPED_UNICODE);
    exit();
}

function requireAdministrativeRole($role) {
    if (!in_array($role, ['admin', 'directeur'], true)) {
        reply(403, false, 'Cette action est réservée à l’administration et à la direction.');
    }
}

function requireStaffRole($role) {
    if (!in_array($role, ['admin', 'directeur', 'teacher'], true)) {
        reply(403, false, 'Cette action est réservée au personnel.');
    }
}

function positiveInt($value, $label) {
    $number = filter_var($value, FILTER_VALIDATE_INT);
    if ($number === false || $number <= 0) reply(400, false, "$label invalide.");
    return (int)$number;
}

function requiredText($input, $key, $label) {
    $value = trim((string)($input[$key] ?? ''));
    if ($value === '') reply(400, false, "$label est obligatoire.");
    return $value;
}

function dateValue($value, $label, $required = true) {
    $value = trim((string)$value);
    if ($value === '' && !$required) return null;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) reply(400, false, "$label est invalide.");
    return $value;
}

function timeValue($value, $label) {
    $value = trim((string)$value);
    if ($value === '') return null;
    foreach (['!H:i', '!H:i:s'] as $format) {
        $time = DateTimeImmutable::createFromFormat($format, $value);
        if ($time && $time->format(strlen($value) === 5 ? 'H:i' : 'H:i:s') === $value) return $value;
    }
    reply(400, false, "$label est invalide.");
}

function fetchAllRows($db, $sql, $params = []) {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function fetchOneRow($db, $sql, $params = []) {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function handleGet($db, $resource, $role, $userId) {
    if ($resource === 'overview') {
        $data = [
            'active_year' => fetchOneRow($db, 'SELECT * FROM academic_years WHERE is_active = 1 ORDER BY start_date DESC LIMIT 1'),
            'years' => (int)$db->query('SELECT COUNT(*) FROM academic_years')->fetchColumn(),
            'groups' => (int)$db->query('SELECT COUNT(*) FROM student_groups WHERE is_active = 1')->fetchColumn(),
            'enrolled_students' => (int)$db->query("SELECT COUNT(*) FROM enrollments WHERE status = 'Enrolled'")->fetchColumn(),
            'sessions_today' => (int)$db->query('SELECT COUNT(*) FROM class_sessions WHERE session_date = CURDATE()')->fetchColumn(),
            'pending_balance' => (float)$db->query("SELECT COALESCE(SUM(GREATEST(f.registration_fee_amount + f.tuition_amount - f.discount_amount - COALESCE(p.paid, 0), 0)), 0) FROM student_fee_accounts f LEFT JOIN (SELECT fee_account_id, SUM(amount) paid FROM student_payments GROUP BY fee_account_id) p ON p.fee_account_id = f.id WHERE f.status <> 'Exempt'")->fetchColumn(),
        ];
        if (!in_array($role, ['admin', 'directeur'], true)) {
            unset($data['pending_balance']);
        }
        reply(200, true, null, $data);
    }

    if ($resource === 'reference_data') {
        if (in_array($role, ['admin', 'directeur'], true)) {
            $courses = fetchAllRows($db, 'SELECT id, code, name, level_id, specialization_id FROM courses ORDER BY name');
            $teachers = fetchAllRows($db, "SELECT id, teacher_number, first_name, last_name FROM teachers WHERE status = 'active' ORDER BY last_name, first_name");
            $students = fetchAllRows($db, "SELECT id, student_number, first_name, last_name, email FROM students WHERE status = 'active' ORDER BY last_name, first_name");
        } elseif ($role === 'teacher') {
            $scope = [':scope_user_id' => $userId];
            $courses = fetchAllRows($db, '
                SELECT DISTINCT c.id, c.code, c.name, c.level_id, c.specialization_id
                FROM courses c
                JOIN planning_schedules ps ON ps.course_id = c.id
                JOIN teachers t ON t.id = ps.teacher_id
                WHERE t.user_id = :scope_user_id
                ORDER BY c.name
            ', $scope);
            $teachers = fetchAllRows($db, "
                SELECT id, teacher_number, first_name, last_name
                FROM teachers
                WHERE user_id = :scope_user_id AND status = 'active'
            ", $scope);
            $students = fetchAllRows($db, "
                SELECT DISTINCT s.id, s.student_number, s.first_name, s.last_name, s.email
                FROM students s
                JOIN enrollments e ON e.student_id = s.id AND e.status = 'Enrolled'
                JOIN planning_schedules ps
                  ON ps.level_id = e.level_id
                 AND COALESCE(ps.specialization_id, 0) = COALESCE(e.specialization_id, 0)
                JOIN teachers t ON t.id = ps.teacher_id
                WHERE t.user_id = :scope_user_id AND s.status = 'active'
                ORDER BY s.last_name, s.first_name
            ", $scope);
        } else {
            $scope = [':scope_user_id' => $userId];
            $courses = fetchAllRows($db, "
                SELECT DISTINCT c.id, c.code, c.name, c.level_id, c.specialization_id
                FROM courses c
                JOIN enrollments e
                  ON e.level_id = c.level_id
                 AND COALESCE(e.specialization_id, 0) = COALESCE(c.specialization_id, 0)
                 AND e.status = 'Enrolled'
                JOIN students s ON s.id = e.student_id
                WHERE s.user_id = :scope_user_id
                ORDER BY c.name
            ", $scope);
            $teachers = fetchAllRows($db, "
                SELECT DISTINCT t.id, t.teacher_number, t.first_name, t.last_name
                FROM teachers t
                JOIN planning_schedules ps ON ps.teacher_id = t.id
                JOIN enrollments e
                  ON e.level_id = ps.level_id
                 AND COALESCE(e.specialization_id, 0) = COALESCE(ps.specialization_id, 0)
                 AND e.status = 'Enrolled'
                JOIN students s ON s.id = e.student_id
                WHERE s.user_id = :scope_user_id AND t.status = 'active'
                ORDER BY t.last_name, t.first_name
            ", $scope);
            $students = fetchAllRows($db, "
                SELECT id, student_number, first_name, last_name, email
                FROM students
                WHERE user_id = :scope_user_id AND status = 'active'
            ", $scope);
        }
        $data = [
            'years' => fetchAllRows($db, 'SELECT * FROM academic_years ORDER BY start_date DESC'),
            'terms' => fetchAllRows($db, 'SELECT t.*, ay.name academic_year_name FROM academic_terms t JOIN academic_years ay ON ay.id = t.academic_year_id ORDER BY t.start_date DESC'),
            'levels' => fetchAllRows($db, 'SELECT * FROM levels ORDER BY name'),
            'specializations' => fetchAllRows($db, 'SELECT * FROM specializations ORDER BY name'),
            'courses' => $courses,
            'teachers' => $teachers,
            'students' => $students,
        ];
        reply(200, true, null, $data);
    }

    if ($resource === 'academic_years') {
        $rows = fetchAllRows($db, "
            SELECT ay.*, COUNT(DISTINCT t.id) term_count, COUNT(DISTINCT g.id) group_count
            FROM academic_years ay
            LEFT JOIN academic_terms t ON t.academic_year_id = ay.id
            LEFT JOIN student_groups g ON g.academic_year_id = ay.id
            GROUP BY ay.id ORDER BY ay.start_date DESC
        ");
        reply(200, true, null, $rows);
    }

    if ($resource === 'terms') {
        $params = [];
        $where = '';
        if (!empty($_GET['academic_year_id'])) {
            $where = 'WHERE t.academic_year_id = :year_id';
            $params[':year_id'] = positiveInt($_GET['academic_year_id'], 'Année scolaire');
        }
        $rows = fetchAllRows($db, "SELECT t.*, ay.name academic_year_name FROM academic_terms t JOIN academic_years ay ON ay.id = t.academic_year_id $where ORDER BY t.start_date DESC", $params);
        reply(200, true, null, $rows);
    }

    if ($resource === 'groups') {
        $params = [];
        $conditions = [];
        if (!empty($_GET['academic_year_id'])) {
            $conditions[] = 'g.academic_year_id = :year_id';
            $params[':year_id'] = positiveInt($_GET['academic_year_id'], 'Année scolaire');
        }
        if ($role === 'teacher') {
            $conditions[] = "EXISTS (SELECT 1 FROM planning_schedules ps JOIN teachers teacher_scope ON teacher_scope.id = ps.teacher_id WHERE teacher_scope.user_id = :scope_user_id AND ps.level_id = g.level_id AND (g.specialization_id IS NULL OR ps.specialization_id = g.specialization_id))";
            $params[':scope_user_id'] = $userId;
        } elseif ($role === 'student') {
            $conditions[] = "EXISTS (SELECT 1 FROM enrollments own_enrollment JOIN students own_student ON own_student.id = own_enrollment.student_id WHERE own_student.user_id = :scope_user_id AND own_enrollment.group_id = g.id AND own_enrollment.status = 'Enrolled')";
            $params[':scope_user_id'] = $userId;
        }
        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';
        $rows = fetchAllRows($db, "
            SELECT g.*, ay.name academic_year_name, l.name level_name, sp.name specialization_name,
                   COUNT(DISTINCT CASE WHEN e.status = 'Enrolled' THEN e.student_id END) enrolled_count
            FROM student_groups g
            JOIN academic_years ay ON ay.id = g.academic_year_id
            JOIN levels l ON l.id = g.level_id
            LEFT JOIN specializations sp ON sp.id = g.specialization_id
            LEFT JOIN enrollments e ON e.group_id = g.id
            $where
            GROUP BY g.id ORDER BY ay.start_date DESC, l.name, g.name
        ", $params);
        reply(200, true, null, $rows);
    }

    if ($resource === 'roster') {
        $groupId = positiveInt($_GET['group_id'] ?? null, 'Groupe');
        assertGroupAccess($db, $groupId, $role, $userId);
        $rows = fetchAllRows($db, "
            SELECT s.id, s.student_number, s.first_name, s.last_name, s.email, s.phone,
                   e.id enrollment_id, e.enrollment_date,
                   ar.status attendance_status, ar.notes attendance_notes
            FROM enrollments e
            JOIN students s ON s.id = e.student_id
            LEFT JOIN attendance_records ar
              ON ar.student_id = s.id AND ar.session_id = :session_id
            WHERE e.group_id = :group_id AND e.status = 'Enrolled'
            ORDER BY s.last_name, s.first_name
        ", [':group_id' => $groupId, ':session_id' => (int)($_GET['session_id'] ?? 0)]);
        reply(200, true, null, $rows);
    }

    if ($resource === 'sessions') {
        $conditions = [];
        $params = [];
        if (!empty($_GET['group_id'])) {
            $conditions[] = 'cs.group_id = :group_id';
            $params[':group_id'] = positiveInt($_GET['group_id'], 'Groupe');
        }
        if (!empty($_GET['academic_year_id'])) {
            $conditions[] = 'cs.academic_year_id = :year_id';
            $params[':year_id'] = positiveInt($_GET['academic_year_id'], 'Année scolaire');
        }
        if ($role === 'teacher') {
            $conditions[] = 't.user_id = :teacher_user_id';
            $params[':teacher_user_id'] = $userId;
        } elseif ($role === 'student') {
            $conditions[] = "EXISTS (SELECT 1 FROM students session_student JOIN enrollments session_enrollment ON session_enrollment.student_id = session_student.id AND session_enrollment.status = 'Enrolled' WHERE session_student.user_id = :session_student_user_id AND session_enrollment.group_id = cs.group_id)";
            $params[':session_student_user_id'] = $userId;
        }
        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';
        $rows = fetchAllRows($db, "
            SELECT cs.*, ay.name academic_year_name, at.name term_name, g.name group_name,
                   l.name level_name, c.name course_name,
                   CONCAT(t.first_name, ' ', t.last_name) teacher_name,
                   COUNT(ar.id) marked_count,
                   SUM(ar.status = 'present') present_count,
                   SUM(ar.status = 'absent') absent_count
            FROM class_sessions cs
            JOIN academic_years ay ON ay.id = cs.academic_year_id
            JOIN student_groups g ON g.id = cs.group_id
            JOIN levels l ON l.id = g.level_id
            LEFT JOIN academic_terms at ON at.id = cs.term_id
            LEFT JOIN courses c ON c.id = cs.course_id
            LEFT JOIN teachers t ON t.id = cs.teacher_id
            LEFT JOIN attendance_records ar ON ar.session_id = cs.id
            $where
            GROUP BY cs.id ORDER BY cs.session_date DESC, cs.start_time DESC
        ", $params);
        reply(200, true, null, $rows);
    }

    if ($resource === 'attendance') {
        $sessionId = positiveInt($_GET['session_id'] ?? null, 'Séance');
        $session = fetchOneRow($db, 'SELECT group_id FROM class_sessions WHERE id = :id', [':id' => $sessionId]);
        if (!$session) reply(404, false, 'Séance introuvable.');
        assertGroupAccess($db, (int)$session['group_id'], $role, $userId);
        $rows = fetchAllRows($db, "
            SELECT ar.*, s.student_number, s.first_name, s.last_name
            FROM attendance_records ar JOIN students s ON s.id = ar.student_id
            WHERE ar.session_id = :session_id ORDER BY s.last_name, s.first_name
        ", [':session_id' => $sessionId]);
        reply(200, true, null, $rows);
    }

    if ($resource === 'student_dossier') {
        $studentId = positiveInt($_GET['student_id'] ?? null, 'Étudiant');
        assertStudentDossierAccess($db, $studentId, $role, $userId);
        $student = fetchOneRow($db, "
            SELECT s.*, e.id enrollment_id, e.academic_year, e.enrollment_date,
                   e.level_id, e.specialization_id, e.group_id, e.status enrollment_status,
                   l.name level_name, sp.name specialization_name, g.name group_name,
                   ay.name structured_academic_year
            FROM students s
            LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'Enrolled'
            LEFT JOIN levels l ON l.id = e.level_id
            LEFT JOIN specializations sp ON sp.id = e.specialization_id
            LEFT JOIN student_groups g ON g.id = e.group_id
            LEFT JOIN academic_years ay ON ay.id = e.academic_year_id
            WHERE s.id = :student_id LIMIT 1
        ", [':student_id' => $studentId]);
        if (!$student) reply(404, false, 'Étudiant introuvable.');

        $guardian = fetchOneRow($db, 'SELECT * FROM student_guardians WHERE student_id = :student_id', [':student_id' => $studentId]);
        $fee = null;
        $payments = [];
        if (!empty($student['enrollment_id'])) {
            $fee = fetchOneRow($db, "
                SELECT f.*, COALESCE(SUM(p.amount), 0) amount_paid,
                       GREATEST(f.registration_fee_amount + f.tuition_amount - f.discount_amount - COALESCE(SUM(p.amount), 0), 0) balance
                FROM student_fee_accounts f
                LEFT JOIN student_payments p ON p.fee_account_id = f.id
                WHERE f.enrollment_id = :enrollment_id GROUP BY f.id
            ", [':enrollment_id' => $student['enrollment_id']]);
            if ($fee) {
                $payments = fetchAllRows($db, 'SELECT * FROM student_payments WHERE fee_account_id = :fee_id ORDER BY payment_date DESC, id DESC', [':fee_id' => $fee['id']]);
            }
        }
        $grades = fetchAllRows($db, 'SELECT * FROM grades WHERE student_id = :student_id ORDER BY grade_date DESC, id DESC LIMIT 30', [':student_id' => $studentId]);
        $absences = fetchAllRows($db, 'SELECT * FROM absences WHERE student_id = :student_id ORDER BY date DESC, id DESC LIMIT 30', [':student_id' => $studentId]);
        if ($role === 'teacher') {
            $guardian = null;
            $fee = null;
            $payments = [];
        }
        reply(200, true, null, compact('student', 'guardian', 'fee', 'payments', 'grades', 'absences'));
    }

    if ($resource === 'finance_accounts') {
        requireAdministrativeRole($role);
        $rows = fetchAllRows($db, "
            SELECT f.*, e.student_id, e.academic_year, s.student_number, s.first_name, s.last_name,
                   l.name level_name, g.name group_name, COALESCE(SUM(p.amount), 0) amount_paid,
                   GREATEST(f.registration_fee_amount + f.tuition_amount - f.discount_amount - COALESCE(SUM(p.amount), 0), 0) balance
            FROM student_fee_accounts f
            JOIN enrollments e ON e.id = f.enrollment_id
            JOIN students s ON s.id = e.student_id
            JOIN levels l ON l.id = e.level_id
            LEFT JOIN student_groups g ON g.id = e.group_id
            LEFT JOIN student_payments p ON p.fee_account_id = f.id
            GROUP BY f.id ORDER BY s.last_name, s.first_name
        ");
        reply(200, true, null, $rows);
    }

    if ($resource === 'profile') {
        $row = fetchOneRow($db, "
            SELECT u.id user_id, u.name account_name, u.email, u.role,
                   p.first_name, p.last_name, p.phone, p.address, p.city,
                   p.nationality, p.title, p.bio, p.avatar_url
            FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE u.id = :user_id
        ", [':user_id' => $userId]);
        reply(200, true, null, $row);
    }

    reply(404, false, 'Ressource inconnue.');
}

function handlePost($db, $resource, $input, $role, $userId) {
    if ($resource === 'academic_years') {
        requireAdministrativeRole($role);
        $name = requiredText($input, 'name', 'L’année scolaire');
        if (!preg_match('/^\d{4}-\d{4}$/', $name)) reply(400, false, 'Format attendu : AAAA-AAAA.');
        $start = dateValue($input['start_date'] ?? '', 'La date de début');
        $end = dateValue($input['end_date'] ?? '', 'La date de fin', false);
        if ($end !== null && $end < $start) reply(400, false, 'La date de fin ne peut pas précéder la date de début.');
        $active = !empty($input['is_active']) ? 1 : 0;
        $db->beginTransaction();
        if ($active) $db->exec('UPDATE academic_years SET is_active = 0');
        $stmt = $db->prepare('INSERT INTO academic_years (name, start_date, end_date, is_active) VALUES (:name, :start, :end, :active)');
        $stmt->execute([':name' => $name, ':start' => $start, ':end' => $end ?: null, ':active' => $active]);
        $id = (int)$db->lastInsertId();
        $db->commit();
        reply(201, true, 'Année scolaire créée.', ['id' => $id]);
    }

    if ($resource === 'terms') {
        requireAdministrativeRole($role);
        $start = dateValue($input['start_date'] ?? '', 'La date de début');
        $end = dateValue($input['end_date'] ?? '', 'La date de fin');
        if ($end < $start) reply(400, false, 'La date de fin ne peut pas précéder la date de début.');
        $stmt = $db->prepare('INSERT INTO academic_terms (academic_year_id, name, start_date, end_date, is_active) VALUES (:year, :name, :start, :end, :active)');
        $stmt->execute([
            ':year' => positiveInt($input['academic_year_id'] ?? null, 'Année scolaire'),
            ':name' => requiredText($input, 'name', 'Le nom de la période'),
            ':start' => $start,
            ':end' => $end,
            ':active' => !empty($input['is_active']) ? 1 : 0,
        ]);
        reply(201, true, 'Période créée.', ['id' => (int)$db->lastInsertId()]);
    }

    if ($resource === 'groups') {
        requireAdministrativeRole($role);
        $capacity = positiveInt($input['capacity'] ?? 30, 'Capacité');
        $stmt = $db->prepare('INSERT INTO student_groups (academic_year_id, level_id, specialization_id, name, capacity, tuition_amount, is_active) VALUES (:year, :level, :spec, :name, :capacity, :tuition, :active)');
        $stmt->execute([
            ':year' => positiveInt($input['academic_year_id'] ?? null, 'Année scolaire'),
            ':level' => positiveInt($input['level_id'] ?? null, 'Niveau'),
            ':spec' => !empty($input['specialization_id']) ? (int)$input['specialization_id'] : null,
            ':name' => requiredText($input, 'name', 'Le nom du groupe'),
            ':capacity' => $capacity,
            ':tuition' => max(0, (float)($input['tuition_amount'] ?? 0)),
            ':active' => array_key_exists('is_active', $input) ? (!empty($input['is_active']) ? 1 : 0) : 1,
        ]);
        reply(201, true, 'Classe/groupe créé.', ['id' => (int)$db->lastInsertId()]);
    }

    if ($resource === 'sessions') {
        requireStaffRole($role);
        $teacherId = !empty($input['teacher_id']) ? (int)$input['teacher_id'] : null;
        if ($role === 'teacher') {
            $teacher = fetchOneRow($db, 'SELECT id FROM teachers WHERE user_id = :user_id', [':user_id' => $userId]);
            if (!$teacher) reply(409, false, 'Aucun profil enseignant n’est associé à ce compte.');
            $teacherId = (int)$teacher['id'];
            assertGroupAccess($db, positiveInt($input['group_id'] ?? null, 'Groupe'), $role, $userId);
        }
        $sessionDate = dateValue($input['session_date'] ?? '', 'La date de la séance');
        $startTime = timeValue($input['start_time'] ?? '', 'L’heure de début');
        $endTime = timeValue($input['end_time'] ?? '', 'L’heure de fin');
        if ($startTime && $endTime && $endTime <= $startTime) reply(400, false, 'L’heure de fin doit suivre l’heure de début.');
        $stmt = $db->prepare("INSERT INTO class_sessions (academic_year_id, term_id, group_id, course_id, teacher_id, session_date, start_time, end_time, session_type, lesson_title, lesson_summary, status, created_by) VALUES (:year, :term, :group_id, :course, :teacher, :session_date, :start_time, :end_time, :session_type, :title, :summary, :status, :created_by)");
        $stmt->execute([
            ':year' => positiveInt($input['academic_year_id'] ?? null, 'Année scolaire'),
            ':term' => !empty($input['term_id']) ? (int)$input['term_id'] : null,
            ':group_id' => positiveInt($input['group_id'] ?? null, 'Groupe'),
            ':course' => !empty($input['course_id']) ? (int)$input['course_id'] : null,
            ':teacher' => $teacherId,
            ':session_date' => $sessionDate,
            ':start_time' => $startTime,
            ':end_time' => $endTime,
            ':session_type' => trim((string)($input['session_type'] ?? 'Cours')) ?: 'Cours',
            ':title' => requiredText($input, 'lesson_title', 'Le titre du cours'),
            ':summary' => trim((string)($input['lesson_summary'] ?? '')) ?: null,
            ':status' => in_array($input['status'] ?? 'planned', ['planned', 'completed', 'cancelled'], true) ? ($input['status'] ?? 'planned') : 'planned',
            ':created_by' => $userId,
        ]);
        reply(201, true, 'Séance créée.', ['id' => (int)$db->lastInsertId()]);
    }

    if ($resource === 'attendance') {
        requireStaffRole($role);
        saveAttendance($db, $input, $role, $userId);
    }

    if ($resource === 'guardian') {
        requireAdministrativeRole($role);
        $studentId = positiveInt($input['student_id'] ?? null, 'Étudiant');
        $stmt = $db->prepare("INSERT INTO student_guardians (student_id, relationship, first_name, last_name, phone, email, profession, address) VALUES (:student, :relationship, :first_name, :last_name, :phone, :email, :profession, :address) ON DUPLICATE KEY UPDATE relationship = VALUES(relationship), first_name = VALUES(first_name), last_name = VALUES(last_name), phone = VALUES(phone), email = VALUES(email), profession = VALUES(profession), address = VALUES(address)");
        $stmt->execute([
            ':student' => $studentId,
            ':relationship' => trim((string)($input['relationship'] ?? 'Responsable financier')),
            ':first_name' => requiredText($input, 'first_name', 'Le prénom du responsable'),
            ':last_name' => requiredText($input, 'last_name', 'Le nom du responsable'),
            ':phone' => trim((string)($input['phone'] ?? '')) ?: null,
            ':email' => trim((string)($input['email'] ?? '')) ?: null,
            ':profession' => trim((string)($input['profession'] ?? '')) ?: null,
            ':address' => trim((string)($input['address'] ?? '')) ?: null,
        ]);
        reply(200, true, 'Responsable financier enregistré.');
    }

    if ($resource === 'fee_accounts') {
        requireAdministrativeRole($role);
        $enrollmentId = positiveInt($input['enrollment_id'] ?? null, 'Inscription');
        $stmt = $db->prepare("INSERT INTO student_fee_accounts (enrollment_id, registration_fee_amount, tuition_amount, discount_amount, payment_mode, status, notes) VALUES (:enrollment, :registration_fee, :tuition, :discount, :mode, 'Pending', :notes) ON DUPLICATE KEY UPDATE registration_fee_amount = VALUES(registration_fee_amount), tuition_amount = VALUES(tuition_amount), discount_amount = VALUES(discount_amount), payment_mode = VALUES(payment_mode), notes = VALUES(notes)");
        $stmt->execute([
            ':enrollment' => $enrollmentId,
            ':registration_fee' => max(0, (float)($input['registration_fee_amount'] ?? 0)),
            ':tuition' => max(0, (float)($input['tuition_amount'] ?? 0)),
            ':discount' => max(0, (float)($input['discount_amount'] ?? 0)),
            ':mode' => trim((string)($input['payment_mode'] ?? '')) ?: null,
            ':notes' => trim((string)($input['notes'] ?? '')) ?: null,
        ]);
        $feeId = (int)$db->lastInsertId();
        if ($feeId <= 0) {
            $feeRow = fetchOneRow($db, 'SELECT id FROM student_fee_accounts WHERE enrollment_id = :id', [':id' => $enrollmentId]);
            $feeId = (int)($feeRow['id'] ?? 0);
        }
        if ($feeId > 0) refreshFeeStatus($db, $feeId);
        reply(200, true, 'Scolarité configurée.');
    }

    if ($resource === 'payments') {
        requireAdministrativeRole($role);
        $feeId = positiveInt($input['fee_account_id'] ?? null, 'Compte de scolarité');
        $amount = (float)($input['amount'] ?? 0);
        if ($amount <= 0) reply(400, false, 'Le montant doit être supérieur à zéro.');
        $stmt = $db->prepare('INSERT INTO student_payments (fee_account_id, amount, payment_date, payment_method, reference, notes, recorded_by) VALUES (:fee, :amount, :date, :method, :reference, :notes, :user_id)');
        $stmt->execute([
            ':fee' => $feeId, ':amount' => $amount,
            ':date' => dateValue($input['payment_date'] ?? date('Y-m-d'), 'La date du paiement'),
            ':method' => requiredText($input, 'payment_method', 'Le mode de paiement'),
            ':reference' => trim((string)($input['reference'] ?? '')) ?: null,
            ':notes' => trim((string)($input['notes'] ?? '')) ?: null,
            ':user_id' => $userId,
        ]);
        refreshFeeStatus($db, $feeId);
        reply(201, true, 'Paiement enregistré.', ['id' => (int)$db->lastInsertId()]);
    }

    if ($resource === 'profile') {
        $stmt = $db->prepare("INSERT INTO user_profiles (user_id, first_name, last_name, phone, address, city, nationality, title, bio, avatar_url) VALUES (:user_id, :first_name, :last_name, :phone, :address, :city, :nationality, :title, :bio, :avatar) ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), phone = VALUES(phone), address = VALUES(address), city = VALUES(city), nationality = VALUES(nationality), title = VALUES(title), bio = VALUES(bio), avatar_url = VALUES(avatar_url)");
        $stmt->execute([
            ':user_id' => $userId,
            ':first_name' => trim((string)($input['first_name'] ?? '')) ?: null,
            ':last_name' => trim((string)($input['last_name'] ?? '')) ?: null,
            ':phone' => trim((string)($input['phone'] ?? '')) ?: null,
            ':address' => trim((string)($input['address'] ?? '')) ?: null,
            ':city' => trim((string)($input['city'] ?? '')) ?: null,
            ':nationality' => trim((string)($input['nationality'] ?? '')) ?: null,
            ':title' => trim((string)($input['title'] ?? '')) ?: null,
            ':bio' => trim((string)($input['bio'] ?? '')) ?: null,
            ':avatar' => trim((string)($input['avatar_url'] ?? '')) ?: null,
        ]);
        reply(200, true, 'Profil mis à jour.');
    }

    reply(404, false, 'Ressource inconnue.');
}

function handlePut($db, $resource, $input, $role, $userId) {
    if ($resource === 'attendance') {
        requireStaffRole($role);
        saveAttendance($db, $input, $role, $userId);
    }

    $id = positiveInt($_GET['id'] ?? null, 'Identifiant');
    if ($resource === 'academic_years') {
        requireAdministrativeRole($role);
        $name = requiredText($input, 'name', 'L’année');
        if (!preg_match('/^\d{4}-\d{4}$/', $name)) reply(400, false, 'Format attendu : AAAA-AAAA.');
        $start = dateValue($input['start_date'] ?? '', 'La date de début');
        $end = dateValue($input['end_date'] ?? '', 'La date de fin', false);
        if ($end !== null && $end < $start) reply(400, false, 'La date de fin ne peut pas précéder la date de début.');
        $active = !empty($input['is_active']) ? 1 : 0;
        $db->beginTransaction();
        if ($active) $db->exec('UPDATE academic_years SET is_active = 0');
        $stmt = $db->prepare('UPDATE academic_years SET name = :name, start_date = :start, end_date = :end, is_active = :active WHERE id = :id');
        $stmt->execute([':name' => $name, ':start' => $start, ':end' => $end, ':active' => $active, ':id' => $id]);
        $db->commit();
        reply(200, true, 'Année scolaire mise à jour.');
    }

    if ($resource === 'terms') {
        requireAdministrativeRole($role);
        $start = dateValue($input['start_date'] ?? '', 'La date de début');
        $end = dateValue($input['end_date'] ?? '', 'La date de fin');
        if ($end < $start) reply(400, false, 'La date de fin ne peut pas précéder la date de début.');
        $stmt = $db->prepare('UPDATE academic_terms SET academic_year_id = :year, name = :name, start_date = :start, end_date = :end, is_active = :active WHERE id = :id');
        $stmt->execute([':year' => positiveInt($input['academic_year_id'] ?? null, 'Année'), ':name' => requiredText($input, 'name', 'La période'), ':start' => $start, ':end' => $end, ':active' => !empty($input['is_active']) ? 1 : 0, ':id' => $id]);
        reply(200, true, 'Période mise à jour.');
    }

    if ($resource === 'groups') {
        requireAdministrativeRole($role);
        $stmt = $db->prepare('UPDATE student_groups SET academic_year_id = :year, level_id = :level, specialization_id = :spec, name = :name, capacity = :capacity, tuition_amount = :tuition, is_active = :active WHERE id = :id');
        $stmt->execute([':year' => positiveInt($input['academic_year_id'] ?? null, 'Année'), ':level' => positiveInt($input['level_id'] ?? null, 'Niveau'), ':spec' => !empty($input['specialization_id']) ? (int)$input['specialization_id'] : null, ':name' => requiredText($input, 'name', 'Le groupe'), ':capacity' => positiveInt($input['capacity'] ?? null, 'Capacité'), ':tuition' => max(0, (float)($input['tuition_amount'] ?? 0)), ':active' => !empty($input['is_active']) ? 1 : 0, ':id' => $id]);
        reply(200, true, 'Classe/groupe mis à jour.');
    }

    if ($resource === 'sessions') {
        requireStaffRole($role);
        $teacherId = !empty($input['teacher_id']) ? (int)$input['teacher_id'] : null;
        if ($role === 'teacher') {
            $teacher = fetchOneRow($db, 'SELECT id FROM teachers WHERE user_id = :user_id', [':user_id' => $userId]);
            if (!$teacher) reply(409, false, 'Aucun profil enseignant n’est associé à ce compte.');
            $existingSession = fetchOneRow($db, 'SELECT teacher_id FROM class_sessions WHERE id = :id', [':id' => $id]);
            if (!$existingSession) reply(404, false, 'Séance introuvable.');
            if ((int)$existingSession['teacher_id'] !== (int)$teacher['id']) {
                reply(403, false, 'Vous ne pouvez modifier que vos propres séances.');
            }
            $teacherId = (int)$teacher['id'];
            assertGroupAccess($db, positiveInt($input['group_id'] ?? null, 'Groupe'), $role, $userId);
        }
        $sessionDate = dateValue($input['session_date'] ?? '', 'La date de la séance');
        $startTime = timeValue($input['start_time'] ?? '', 'L’heure de début');
        $endTime = timeValue($input['end_time'] ?? '', 'L’heure de fin');
        if ($startTime && $endTime && $endTime <= $startTime) reply(400, false, 'L’heure de fin doit suivre l’heure de début.');
        $signed = !empty($input['signed']) ? gmdate('Y-m-d H:i:s') : null;
        $stmt = $db->prepare('UPDATE class_sessions SET academic_year_id = :year, term_id = :term, group_id = :group_id, course_id = :course, teacher_id = :teacher, session_date = :date, start_time = :start, end_time = :end, session_type = :type, lesson_title = :title, lesson_summary = :summary, status = :status, teacher_signed_at = COALESCE(:signed, teacher_signed_at) WHERE id = :id');
        $stmt->execute([':year' => positiveInt($input['academic_year_id'] ?? null, 'Année'), ':term' => !empty($input['term_id']) ? (int)$input['term_id'] : null, ':group_id' => positiveInt($input['group_id'] ?? null, 'Groupe'), ':course' => !empty($input['course_id']) ? (int)$input['course_id'] : null, ':teacher' => $teacherId, ':date' => $sessionDate, ':start' => $startTime, ':end' => $endTime, ':type' => trim((string)($input['session_type'] ?? 'Cours')), ':title' => requiredText($input, 'lesson_title', 'Le titre'), ':summary' => trim((string)($input['lesson_summary'] ?? '')) ?: null, ':status' => in_array($input['status'] ?? 'planned', ['planned', 'completed', 'cancelled'], true) ? ($input['status'] ?? 'planned') : 'planned', ':signed' => $signed, ':id' => $id]);
        reply(200, true, 'Séance mise à jour.');
    }

    if ($resource === 'payments') {
        requireAdministrativeRole($role);
        $existing = fetchOneRow($db, 'SELECT fee_account_id FROM student_payments WHERE id = :id', [':id' => $id]);
        if (!$existing) reply(404, false, 'Paiement introuvable.');
        $amount = (float)($input['amount'] ?? 0);
        if ($amount <= 0) reply(400, false, 'Le montant doit être supérieur à zéro.');
        $stmt = $db->prepare('UPDATE student_payments SET amount = :amount, payment_date = :date, payment_method = :method, reference = :reference, notes = :notes WHERE id = :id');
        $stmt->execute([
            ':amount' => $amount,
            ':date' => dateValue($input['payment_date'] ?? '', 'La date du paiement'),
            ':method' => requiredText($input, 'payment_method', 'Le mode de paiement'),
            ':reference' => trim((string)($input['reference'] ?? '')) ?: null,
            ':notes' => trim((string)($input['notes'] ?? '')) ?: null,
            ':id' => $id,
        ]);
        refreshFeeStatus($db, (int)$existing['fee_account_id']);
        reply(200, true, 'Paiement mis à jour.');
    }

    reply(404, false, 'Ressource inconnue.');
}

function handleDelete($db, $resource, $role) {
    requireAdministrativeRole($role);
    $id = positiveInt($_GET['id'] ?? null, 'Identifiant');
    $tables = [
        'academic_years' => 'academic_years',
        'terms' => 'academic_terms',
        'groups' => 'student_groups',
        'sessions' => 'class_sessions',
        'payments' => 'student_payments',
    ];
    if (!isset($tables[$resource])) reply(404, false, 'Ressource inconnue.');
    if ($resource === 'payments') {
        $payment = fetchOneRow($db, 'SELECT fee_account_id FROM student_payments WHERE id = :id', [':id' => $id]);
        $stmt = $db->prepare('DELETE FROM student_payments WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if ($payment) refreshFeeStatus($db, (int)$payment['fee_account_id']);
    } else {
        $stmt = $db->prepare('DELETE FROM ' . $tables[$resource] . ' WHERE id = :id');
        $stmt->execute([':id' => $id]);
    }
    reply(200, true, 'Élément supprimé.');
}

function saveAttendance($db, $input, $role, $userId) {
    $sessionId = positiveInt($input['session_id'] ?? null, 'Séance');
    $records = $input['records'] ?? [];
    if (!is_array($records)) reply(400, false, 'Liste de présence invalide.');
    $session = fetchOneRow($db, 'SELECT cs.*, c.name course_name FROM class_sessions cs LEFT JOIN courses c ON c.id = cs.course_id WHERE cs.id = :id', [':id' => $sessionId]);
    if (!$session) reply(404, false, 'Séance introuvable.');
    assertGroupAccess($db, (int)$session['group_id'], $role, $userId);

    // Valider tout le lot avant d'ouvrir la transaction évite de conserver
    // une écriture partielle si une ligne est mal formée.
    $normalizedRecords = [];
    foreach ($records as $record) {
        if (!is_array($record)) reply(400, false, 'Ligne de présence invalide.');
        $studentId = positiveInt($record['student_id'] ?? null, 'Étudiant');
        $status = (string)($record['status'] ?? 'present');
        if (!in_array($status, ['present', 'absent', 'late', 'excused'], true)) {
            reply(400, false, 'Statut de présence invalide.');
        }
        $notes = trim((string)($record['notes'] ?? ''));
        if (mb_strlen($notes) > 255) reply(400, false, 'La note de présence est trop longue.');
        $normalizedRecords[] = [
            'student_id' => $studentId,
            'status' => $status,
            'notes' => $notes !== '' ? $notes : null,
        ];
    }
    if (empty($session['course_id']) && array_filter($normalizedRecords, static fn($record) => $record['status'] === 'absent')) {
        reply(409, false, 'Associez un cours à la séance avant d’enregistrer une absence.');
    }

    $db->beginTransaction();
    $upsert = $db->prepare("INSERT INTO attendance_records (session_id, student_id, status, notes, marked_by) VALUES (:session, :student, :status, :notes, :user_id) ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), marked_by = VALUES(marked_by)");
    $membership = $db->prepare("SELECT 1 FROM enrollments WHERE student_id = :student AND group_id = :group_id AND status = 'Enrolled' LIMIT 1");
    $removeAbsence = $db->prepare("DELETE FROM absences WHERE student_id = :student AND course_id = :course AND date = :date AND justification = :marker");
    $findAbsence = $db->prepare("SELECT id FROM absences WHERE student_id = :student AND course_id = :course AND date = :date LIMIT 1");
    $addAbsence = $db->prepare("INSERT INTO absences (student_id, course_id, date, reason, status, justification) VALUES (:student, :course, :date, 'Absence constatée à l’appel', 'pending', :marker)");
    $marker = 'AUTO_SESSION:' . $sessionId;

    foreach ($normalizedRecords as $record) {
        $studentId = $record['student_id'];
        $status = $record['status'];
        $membership->execute([':student' => $studentId, ':group_id' => $session['group_id']]);
        if (!$membership->fetchColumn()) continue;
        $upsert->execute([':session' => $sessionId, ':student' => $studentId, ':status' => $status, ':notes' => $record['notes'], ':user_id' => $userId]);

        if ($status === 'absent') {
            $findAbsence->execute([':student' => $studentId, ':course' => $session['course_id'], ':date' => $session['session_date']]);
            if (!$findAbsence->fetchColumn()) {
                $addAbsence->execute([':student' => $studentId, ':course' => $session['course_id'], ':date' => $session['session_date'], ':marker' => $marker]);
            }
        } else {
            if (!empty($session['course_id'])) {
                $removeAbsence->execute([':student' => $studentId, ':course' => $session['course_id'], ':date' => $session['session_date'], ':marker' => $marker]);
            }
        }
    }

    $stmt = $db->prepare("UPDATE class_sessions SET status = :status, teacher_signed_at = CASE WHEN :signed = 1 THEN NOW() ELSE teacher_signed_at END WHERE id = :id");
    $stmt->execute([':status' => !empty($input['complete']) ? 'completed' : $session['status'], ':signed' => !empty($input['signed']) ? 1 : 0, ':id' => $sessionId]);
    $db->commit();
    reply(200, true, 'Appel enregistré et absences synchronisées.');
}

function refreshFeeStatus($db, $feeId) {
    $row = fetchOneRow($db, 'SELECT f.registration_fee_amount, f.tuition_amount, f.discount_amount, f.status, COALESCE(SUM(p.amount), 0) paid FROM student_fee_accounts f LEFT JOIN student_payments p ON p.fee_account_id = f.id WHERE f.id = :id GROUP BY f.id', [':id' => $feeId]);
    if (!$row || $row['status'] === 'Exempt') return;
    $due = max(0, (float)$row['registration_fee_amount'] + (float)$row['tuition_amount'] - (float)$row['discount_amount']);
    $paid = (float)$row['paid'];
    $status = $paid <= 0 ? 'Pending' : ($paid >= $due ? 'Paid' : 'Partial');
    $stmt = $db->prepare('UPDATE student_fee_accounts SET status = :status WHERE id = :id');
    $stmt->execute([':status' => $status, ':id' => $feeId]);
}

function assertStudentDossierAccess($db, $studentId, $role, $userId) {
    if (in_array($role, ['admin', 'directeur'], true)) return;
    if ($role === 'student') {
        $row = fetchOneRow($db, 'SELECT id FROM students WHERE id = :student_id AND user_id = :user_id', [':student_id' => $studentId, ':user_id' => $userId]);
        if (!$row) reply(403, false, 'Vous ne pouvez consulter que votre propre dossier.');
        return;
    }
    $row = fetchOneRow($db, "SELECT s.id FROM students s JOIN enrollments e ON e.student_id = s.id AND e.status = 'Enrolled' JOIN planning_schedules ps ON ps.level_id = e.level_id AND COALESCE(ps.specialization_id, 0) = COALESCE(e.specialization_id, 0) JOIN teachers t ON t.id = ps.teacher_id WHERE s.id = :student_id AND t.user_id = :user_id LIMIT 1", [':student_id' => $studentId, ':user_id' => $userId]);
    if (!$row) reply(403, false, 'Cet étudiant ne fait pas partie de vos classes.');
}

function assertGroupAccess($db, $groupId, $role, $userId) {
    if (in_array($role, ['admin', 'directeur'], true)) return;
    if ($role === 'student') {
        $row = fetchOneRow($db, "SELECT g.id FROM student_groups g JOIN enrollments e ON e.group_id = g.id AND e.status = 'Enrolled' JOIN students s ON s.id = e.student_id WHERE g.id = :group_id AND s.user_id = :user_id LIMIT 1", [':group_id' => $groupId, ':user_id' => $userId]);
        if (!$row) reply(403, false, 'Ce groupe ne correspond pas à votre inscription.');
        return;
    }
    $row = fetchOneRow($db, "SELECT g.id FROM student_groups g JOIN planning_schedules ps ON ps.level_id = g.level_id AND (g.specialization_id IS NULL OR ps.specialization_id = g.specialization_id) JOIN teachers t ON t.id = ps.teacher_id WHERE g.id = :group_id AND t.user_id = :user_id LIMIT 1", [':group_id' => $groupId, ':user_id' => $userId]);
    if (!$row) reply(403, false, 'Ce groupe ne fait pas partie de vos classes planifiées.');
}
?>
