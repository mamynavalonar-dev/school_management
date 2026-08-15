<?php
/**
 * student_dashboard.php
 *
 * Tableau de bord personnel pour le rôle "student".
 * Un étudiant ne voit STRICTEMENT que ses propres données (résolues via
 * students.user_id = session, jamais via un id fourni par le client).
 */
require_once '../config/database.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';
require_once '../config/feature_permissions.php';

if (empty($_SESSION['user_role']) || $_SESSION['user_role'] !== 'student') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès réservé aux étudiants']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$featurePermissions = loadFeaturePermissions($db, (int)$_SESSION['user_id'], 'student');

// Résout students.id + son inscription active à partir de users.id (session).
$query = "
    SELECT s.id AS student_id, s.first_name, s.last_name, s.student_number,
           e.level_id, e.specialization_id,
           l.name AS level_name, sp.name AS specialization_name
    FROM students s
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'Enrolled'
    LEFT JOIN levels l ON l.id = e.level_id
    LEFT JOIN specializations sp ON sp.id = e.specialization_id
    WHERE s.user_id = :user_id
    LIMIT 1
";
$stmt = $db->prepare($query);
$stmt->bindParam(':user_id', $_SESSION['user_id']);
$stmt->execute();
$studentRow = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$studentRow) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Aucun profil étudiant associé à ce compte.']);
    exit();
}

$studentId = (int)$studentRow['student_id'];
$levelId = $studentRow['level_id'] !== null ? (int)$studentRow['level_id'] : null;
$specializationId = $studentRow['specialization_id'] !== null ? (int)$studentRow['specialization_id'] : null;

try {
    $data = [
        'profile' => [
            'first_name' => $studentRow['first_name'],
            'last_name' => $studentRow['last_name'],
            'student_number' => $studentRow['student_number'],
            'level_name' => $studentRow['level_name'],
            'specialization_name' => $studentRow['specialization_name'],
        ],
        'feature_access' => array_map(
            static fn($value) => !empty($value['view']),
            $featurePermissions
        ),
    ];

    // --- Emploi du temps de la semaine, filtré sur le niveau/spécialisation
    // de l'étudiant (les schedules sont rattachés à level_id/specialization_id,
    // pas directement à un student_id, donc pas de fuite vers un autre
    // niveau tant qu'on filtre bien ici). ---
    if (!empty($featurePermissions['planning']['view']) && $levelId !== null) {
        $query = "
            SELECT ps.day_of_week, ps.start_time, ps.end_time,
                   c.id AS course_id, c.name AS course_name,
                   r.name AS room_name,
                   CONCAT(t.first_name, ' ', t.last_name) AS teacher_name
            FROM planning_schedules ps
            LEFT JOIN courses c ON c.id = ps.course_id
            LEFT JOIN rooms r ON r.id = ps.room_id
            LEFT JOIN teachers t ON t.id = ps.teacher_id
            WHERE ps.level_id = :level_id
              AND COALESCE(ps.specialization_id, 0) = COALESCE(:specialization_id, 0)
            ORDER BY ps.day_of_week, ps.start_time
        ";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':level_id', $levelId, PDO::PARAM_INT);
        $stmt->bindValue(':specialization_id', $specializationId, $specializationId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->execute();
        $data['weekly_schedule'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $data['weekly_schedule'] = [];
    }

    // --- Notes personnelles publiées uniquement. ---
    $grades = [];
    if (!empty($featurePermissions['grades']['view'])) {
        $query = "
            SELECT g.id, ev.title AS evaluation_title, c.name AS course_name,
                   g.score, g.max_score, g.status, g.grade_date, g.is_absent
            FROM grades g
            INNER JOIN evaluations ev ON ev.id = g.evaluation_id
            INNER JOIN courses c ON c.id = ev.course_id
            WHERE g.student_id = :student_id
              AND g.status IN ('completed', 'absent')
            ORDER BY g.grade_date DESC
        ";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':student_id', $studentId, PDO::PARAM_INT);
        $stmt->execute();
        $grades = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    $data['grades'] = $grades;

    // Moyenne générale calculée côté serveur (sur les notes non-absentes).
    $gradedScores = array_filter($grades, fn($g) => !$g['is_absent'] && $g['score'] !== null);
    if (count($gradedScores) > 0) {
        $sum = array_reduce($gradedScores, fn($carry, $g) => $carry + (($g['score'] / $g['max_score']) * 20), 0);
        $data['overall_average'] = round($sum / count($gradedScores), 2);
    } else {
        $data['overall_average'] = null;
    }

    // --- Absences personnelles (uniquement les siennes). ---
    $data['absences'] = [];
    if (!empty($featurePermissions['absences']['view'])) {
        $query = "
            SELECT a.id, a.date, a.reason, a.status, a.justification,
                   c.name AS course_name
            FROM absences a
            INNER JOIN courses c ON c.id = a.course_id
            WHERE a.student_id = :student_id
            ORDER BY a.date DESC
        ";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':student_id', $studentId, PDO::PARAM_INT);
        $stmt->execute();
        $data['absences'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // --- Évaluations à venir pour son niveau/spécialisation ---
    if (!empty($featurePermissions['evaluations']['view']) && $levelId !== null) {
        $query = "
            SELECT ev.id, ev.title, c.name AS course_name, ev.evaluation_date, ev.evaluation_time
            FROM evaluations ev
            LEFT JOIN courses c ON c.id = ev.course_id
            WHERE ev.level_id = :level_id
              AND COALESCE(ev.specialization_id, 0) = COALESCE(:specialization_id, 0)
              AND ev.evaluation_date >= CURDATE()
            ORDER BY ev.evaluation_date, ev.evaluation_time
            LIMIT 10
        ";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':level_id', $levelId, PDO::PARAM_INT);
        $stmt->bindValue(':specialization_id', $specializationId, $specializationId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->execute();
        $data['upcoming_evaluations'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $data['upcoming_evaluations'] = [];
    }

    echo json_encode(['success' => true, 'data' => $data]);
} catch (PDOException $e) {
    error_log("PDOException in student_dashboard.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
