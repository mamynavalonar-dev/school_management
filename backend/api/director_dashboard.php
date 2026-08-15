<?php
/**
 * director_dashboard.php
 *
 * Tableau de bord exécutif pour le rôle "directeur".
 *
 * Conformément aux recommandations métier : le directeur travaille sur des
 * agrégats (taux de réussite, assiduité globale, répartition par filière),
 * jamais sur des données individuelles d'étudiants ou d'enseignants.
 * Aucune requête ici ne renvoie de student_id, de nom d'étudiant, ou de
 * note individuelle — uniquement des moyennes, comptages et pourcentages.
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

// Accès réservé au directeur (l'admin technique a son propre dashboard
// admin_stats.php ; on ne mélange pas les deux même si les deux rôles
// passent aujourd'hui par admin_guard côté DB).
if (empty($_SESSION['user_role']) || $_SESSION['user_role'] !== 'directeur') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès réservé au directeur']);
    exit();
}

$database = new Database();
$db = $database->getConnection();

try {
    $data = [];

    // --- Effectifs globaux (agrégats uniquement) ---
    $stmt = $db->query("SELECT COUNT(*) FROM students WHERE status = 'active'");
    $data['total_active_students'] = (int)$stmt->fetchColumn();

    $stmt = $db->query("SELECT COUNT(*) FROM teachers WHERE status = 'active'");
    $data['total_active_teachers'] = (int)$stmt->fetchColumn();

    $stmt = $db->query("SELECT COUNT(*) FROM courses");
    $data['total_courses'] = (int)$stmt->fetchColumn();

    // --- Répartition des étudiants par niveau (pour le graphique filières) ---
    $query = "
        SELECT l.name AS level_name, COUNT(e.id) AS count
        FROM levels l
        LEFT JOIN enrollments e ON e.level_id = l.id AND e.status = 'Enrolled'
        GROUP BY l.id, l.name
        ORDER BY l.name
    ";
    $stmt = $db->query($query);
    $data['students_by_level'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- Répartition des étudiants par spécialisation ---
    $query = "
        SELECT sp.name AS specialization_name, COUNT(e.id) AS count
        FROM specializations sp
        LEFT JOIN enrollments e ON e.specialization_id = sp.id AND e.status = 'Enrolled'
        GROUP BY sp.id, sp.name
        ORDER BY sp.name
    ";
    $stmt = $db->query($query);
    $data['students_by_specialization'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- Taux de réussite global : % de notes >= 10/20 sur les évaluations
    // notées (is_absent = 0, score renseigné). Agrégat pur, aucune note
    // individuelle n'est exposée. ---
    $query = "
        SELECT
            COUNT(*) AS total_graded,
            SUM(CASE WHEN (score / max_score) * 20 >= 10 THEN 1 ELSE 0 END) AS passing
        FROM grades
        WHERE is_absent = 0 AND score IS NOT NULL
    ";
    $stmt = $db->query($query);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $totalGraded = (int)($row['total_graded'] ?? 0);
    $passing = (int)($row['passing'] ?? 0);
    $data['success_rate'] = [
        'total_graded' => $totalGraded,
        'passing' => $passing,
        'rate_percent' => $totalGraded > 0 ? round(($passing / $totalGraded) * 100, 1) : null,
    ];

    // --- Taux d'assiduité global sur les 30 derniers jours : agrégat, pas
    // de liste d'étudiants absents. ---
    $query = "
        SELECT
            COUNT(*) AS total_absences,
            SUM(CASE WHEN status = 'justified' THEN 1 ELSE 0 END) AS justified,
            SUM(CASE WHEN status = 'unjustified' THEN 1 ELSE 0 END) AS unjustified
        FROM absences
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    ";
    $stmt = $db->query($query);
    $absenceRow = $stmt->fetch(PDO::FETCH_ASSOC);
    $data['attendance_last_30_days'] = [
        'total_absences' => (int)($absenceRow['total_absences'] ?? 0),
        'justified' => (int)($absenceRow['justified'] ?? 0),
        'unjustified' => (int)($absenceRow['unjustified'] ?? 0),
    ];

    // --- Taux d'occupation moyen des salles ---
    $stmt = $db->query("SELECT ROUND(AVG(utilization_rate), 1) FROM rooms WHERE utilization_rate IS NOT NULL");
    $data['average_room_utilization'] = (float)($stmt->fetchColumn() ?? 0);

    // --- Évaluations à venir (comptage, pas le détail des notes) ---
    $stmt = $db->query("SELECT COUNT(*) FROM evaluations WHERE evaluation_date >= CURDATE() AND status = 'scheduled'");
    $data['upcoming_evaluations'] = (int)$stmt->fetchColumn();

    echo json_encode(['success' => true, 'data' => $data]);
} catch (PDOException $e) {
    error_log("PDOException in director_dashboard.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
