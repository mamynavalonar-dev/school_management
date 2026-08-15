<?php
/**
 * teacher_dashboard.php
 *
 * Tableau de bord quotidien pour le rôle "teacher".
 *
 * GET  ?section=overview   -> cours du jour + alertes (vue par défaut)
 * GET  ?section=thresholds -> liste des seuils d'alerte configurés par cet enseignant
 * POST ?section=thresholds -> créer/mettre à jour un seuil d'alerte
 * DELETE ?section=thresholds&id=X -> supprimer un seuil
 *
 * Un enseignant ne voit que SES cours et les étudiants qui y sont inscrits
 * (séparation des devoirs : pas d'accès aux cours d'un autre enseignant).
 */
require_once __DIR__ . '/../config/database.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/csrf_guard.php';
require_once __DIR__ . '/../config/feature_permissions.php';

if (empty($_SESSION['user_role']) || $_SESSION['user_role'] !== 'teacher') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès réservé aux enseignants']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$featurePermissions = loadFeaturePermissions($db, (int)$_SESSION['user_id'], 'teacher');

// Résout teachers.id à partir de users.id (session) : tout le reste de ce
// fichier filtre par ce teacher_id, jamais par un id fourni par le client.
$stmt = $db->prepare("SELECT id FROM teachers WHERE user_id = :user_id");
$stmt->bindParam(':user_id', $_SESSION['user_id']);
$stmt->execute();
$teacherRow = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$teacherRow) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Aucun profil enseignant associé à ce compte.']);
    exit();
}
$teacherId = (int)$teacherRow['id'];

$method = $_SERVER['REQUEST_METHOD'];
$section = $_GET['section'] ?? 'overview';
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($section === 'thresholds') {
        handleThresholds($db, $teacherId, $method, $input, $featurePermissions);
    } else {
        getOverview($db, $teacherId, $featurePermissions);
    }
} catch (PDOException $e) {
    error_log("PDOException in teacher_dashboard.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}

/**
 * Get today's schedule for the teacher
 */
function getTodaySchedule($db, $teacherId) {
    // Même convention que planning_schedules : 1=lundi ... 7=dimanche.
    $dayOfWeek = (int)date('N');

    $stmt = $db->prepare("
        SELECT
            ps.id,
            c.id AS course_id,
            c.name AS course_name,
            l.name AS level_name,
            s.name AS specialization_name,
            r.name AS room_name,
            ps.start_time,
            ps.end_time
        FROM planning_schedules ps
        JOIN courses c ON ps.course_id = c.id
        JOIN levels l ON ps.level_id = l.id
        LEFT JOIN specializations s ON ps.specialization_id = s.id
        JOIN rooms r ON ps.room_id = r.id
        WHERE ps.teacher_id = :teacher_id
        AND ps.day_of_week = :day_of_week
        ORDER BY ps.start_time
    ");

    $stmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
    $stmt->bindParam(':day_of_week', $dayOfWeek, PDO::PARAM_INT);
    $stmt->execute();

    $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Format times to remove seconds if present
    foreach ($result as &$row) {
        $row['start_time'] = substr($row['start_time'], 0, 5); // HH:MM
        $row['end_time'] = substr($row['end_time'], 0, 5); // HH:MM
    }

    return $result;
}

/**
 * Get distinct courses taught by the teacher
 */
function getMyCourses($db, $teacherId) {
    $stmt = $db->prepare("
        SELECT DISTINCT
            c.id,
            c.name
        FROM planning_schedules ps
        JOIN courses c ON ps.course_id = c.id
        WHERE ps.teacher_id = :teacher_id
        ORDER BY c.name
    ");

    $stmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Compute alerts based on teacher's thresholds
 */
function computeAlerts($db, $teacherId, $permissions) {
    $alerts = [];
    $stmt = $db->prepare("
        SELECT at.metric, at.threshold_value, at.course_id
        FROM alert_thresholds at
        WHERE at.teacher_id = :teacher_id AND at.is_active = TRUE
    ");
    $stmt->execute([':teacher_id' => $teacherId]);

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $threshold) {
        $courseId = $threshold['course_id'] !== null ? (int)$threshold['course_id'] : null;

        if ($threshold['metric'] === 'average_below' && !empty($permissions['grades']['view'])) {
            $studentStmt = $db->prepare("
                SELECT CONCAT(st.first_name, ' ', st.last_name) AS student_name,
                       c.name AS course_name,
                       AVG((g.score / g.max_score) * 20) AS metric_value
                FROM grades g
                INNER JOIN students st ON st.id = g.student_id
                INNER JOIN evaluations ev ON ev.id = g.evaluation_id
                INNER JOIN courses c ON c.id = ev.course_id
                WHERE g.status = 'completed'
                  AND g.is_absent = FALSE
                  AND g.score IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM planning_schedules ps
                      WHERE ps.course_id = c.id AND ps.teacher_id = :teacher_id
                  )
                  AND (:course_id IS NULL OR c.id = :course_filter)
                GROUP BY st.id, st.first_name, st.last_name, c.id, c.name
                HAVING metric_value < :threshold
            ");
        } elseif ($threshold['metric'] === 'absences_above' && !empty($permissions['absences']['view'])) {
            $studentStmt = $db->prepare("
                SELECT CONCAT(st.first_name, ' ', st.last_name) AS student_name,
                       c.name AS course_name,
                       COUNT(a.id) AS metric_value
                FROM absences a
                INNER JOIN students st ON st.id = a.student_id
                INNER JOIN courses c ON c.id = a.course_id
                WHERE a.status IN ('pending', 'unjustified')
                  AND (a.justification IS NULL OR a.justification = '')
                  AND EXISTS (
                      SELECT 1 FROM planning_schedules ps
                      WHERE ps.course_id = c.id AND ps.teacher_id = :teacher_id
                  )
                  AND (:course_id IS NULL OR c.id = :course_filter)
                GROUP BY st.id, st.first_name, st.last_name, c.id, c.name
                HAVING metric_value > :threshold
            ");
        } else {
            continue;
        }

        $studentStmt->bindValue(':teacher_id', $teacherId, PDO::PARAM_INT);
        $studentStmt->bindValue(':course_id', $courseId, $courseId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $studentStmt->bindValue(':course_filter', $courseId, $courseId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $studentStmt->bindValue(':threshold', $threshold['threshold_value']);
        $studentStmt->execute();

        foreach ($studentStmt->fetchAll(PDO::FETCH_ASSOC) as $student) {
            $alerts[] = [
                'student_name' => $student['student_name'],
                'course_name' => $student['course_name'],
                'type' => $threshold['metric'],
                'threshold' => $threshold['threshold_value'],
                'value' => round((float)$student['metric_value'], 2),
            ];
        }
    }

    return $alerts;
}

function getOverview($db, $teacherId, $permissions) {
    $data = [
        'feature_access' => array_map(
            static fn($value) => !empty($value['view']),
            $permissions
        ),
    ];
    $data['today_schedule'] = !empty($permissions['planning']['view'])
        ? getTodaySchedule($db, $teacherId)
        : [];
    $data['my_courses'] = !empty($permissions['courses']['view'])
        ? getMyCourses($db, $teacherId)
        : [];
    $data['alerts'] = computeAlerts($db, $teacherId, $permissions);

    echo json_encode(['success' => true, 'data' => $data]);
}

function handleThresholds($db, $teacherId, $method, $input, $permissions) {
    if ($method === 'GET') {
        // Bug corrigé : cette branche renvoyait [] en dur, donc les seuils
        // configurés (pourtant bien écrits en base une fois le POST corrigé
        // ci-dessous) n'étaient jamais réaffichés après un rechargement.
        $stmt = $db->prepare("
            SELECT at.id, at.metric, at.threshold_value, at.course_id,
                   at.is_active, c.name AS course_name
            FROM alert_thresholds at
            LEFT JOIN courses c ON at.course_id = c.id
            WHERE at.teacher_id = :teacher_id
            ORDER BY at.created_at DESC
        ");
        $stmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
        $stmt->execute();
        $rows = array_values(array_filter(
            $stmt->fetchAll(PDO::FETCH_ASSOC),
            static fn($row) => $row['metric'] === 'average_below'
                ? !empty($permissions['grades']['view'])
                : !empty($permissions['absences']['view'])
        ));
        echo json_encode(['success' => true, 'data' => $rows]);
        return;
    }

    if ($method === 'POST') {
        // Bug corrigé : cette branche renvoyait un succès factice sans
        // jamais écrire en base, donc computeAlerts() (qui lit la vraie
        // table) ne déclenchait jamais aucune alerte.
        if (empty($input['metric']) || !in_array($input['metric'], ['average_below', 'absences_above'], true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Métrique invalide.']);
            return;
        }
        if (!isset($input['threshold_value']) || !is_numeric($input['threshold_value'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Valeur de seuil invalide.']);
            return;
        }

        $metric = $input['metric'];
        enforceFeaturePermission($db, $metric === 'average_below' ? 'grades' : 'absences', true);
        $thresholdValue = (float)$input['threshold_value'];
        if ($metric === 'average_below' && ($thresholdValue < 0 || $thresholdValue > 20)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le seuil de moyenne doit être entre 0 et 20.']);
            return;
        }
        if ($metric === 'absences_above' && $thresholdValue < 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le seuil d\'absences doit être positif.']);
            return;
        }

        $courseId = !empty($input['course_id']) ? intval($input['course_id']) : null;

        // Si un course_id est fourni, vérifie qu'il s'agit bien d'un cours
        // de CET enseignant (jamais faire confiance à un course_id fourni
        // par le client sans vérification de propriété).
        if ($courseId !== null) {
            $ownStmt = $db->prepare("
                SELECT 1 FROM planning_schedules
                WHERE teacher_id = :teacher_id AND course_id = :course_id
                LIMIT 1
            ");
            $ownStmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
            $ownStmt->bindParam(':course_id', $courseId, PDO::PARAM_INT);
            $ownStmt->execute();
            if ($ownStmt->fetchColumn() === false) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => "Ce cours ne vous appartient pas."]);
                return;
            }
        }

        // Upsert manuel plutôt que INSERT ... ON DUPLICATE KEY : la
        // contrainte UNIQUE(teacher_id, course_id, metric) ne se déclenche
        // jamais quand course_id est NULL (deux NULL ne sont jamais égaux
        // pour une contrainte unique en SQL), donc ON DUPLICATE KEY
        // créerait une nouvelle ligne à chaque appel pour un seuil "tous
        // cours" au lieu de remplacer le précédent. On fait donc un
        // check-then-act explicite qui fonctionne dans les deux cas.
        if ($courseId === null) {
            $existingStmt = $db->prepare("
                SELECT id FROM alert_thresholds
                WHERE teacher_id = :teacher_id AND course_id IS NULL AND metric = :metric
            ");
            $existingStmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
            $existingStmt->bindParam(':metric', $metric);
        } else {
            $existingStmt = $db->prepare("
                SELECT id FROM alert_thresholds
                WHERE teacher_id = :teacher_id AND course_id = :course_id AND metric = :metric
            ");
            $existingStmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
            $existingStmt->bindParam(':course_id', $courseId, PDO::PARAM_INT);
            $existingStmt->bindParam(':metric', $metric);
        }
        $existingStmt->execute();
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $updateStmt = $db->prepare("
                UPDATE alert_thresholds
                SET threshold_value = :threshold_value, is_active = TRUE
                WHERE id = :id
            ");
            $updateStmt->bindParam(':threshold_value', $thresholdValue);
            $updateStmt->bindParam(':id', $existing['id'], PDO::PARAM_INT);
            $updateStmt->execute();
        } else {
            $insertStmt = $db->prepare("
                INSERT INTO alert_thresholds (teacher_id, course_id, metric, threshold_value, is_active)
                VALUES (:teacher_id, :course_id, :metric, :threshold_value, TRUE)
            ");
            $insertStmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
            // bindValue + type explicite : bindParam sur une valeur PHP
            // null avec PARAM_INT peut être casté en 0 par certains
            // drivers au lieu de NULL.
            if ($courseId === null) {
                $insertStmt->bindValue(':course_id', null, PDO::PARAM_NULL);
            } else {
                $insertStmt->bindValue(':course_id', $courseId, PDO::PARAM_INT);
            }
            $insertStmt->bindParam(':metric', $metric);
            $insertStmt->bindParam(':threshold_value', $thresholdValue);
            $insertStmt->execute();
        }

        echo json_encode(['success' => true, 'message' => 'Seuil enregistré.']);
        return;
    }

    if ($method === 'DELETE') {
        if (empty($_GET['id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'ID de seuil requis.']);
            return;
        }
        $metricStmt = $db->prepare('SELECT metric FROM alert_thresholds WHERE id = :id AND teacher_id = :teacher_id');
        $metricStmt->execute([':id' => (int)$_GET['id'], ':teacher_id' => $teacherId]);
        $metric = $metricStmt->fetchColumn();
        if ($metric === false) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Seuil introuvable.']);
            return;
        }
        enforceFeaturePermission($db, $metric === 'average_below' ? 'grades' : 'absences', true);
        $stmt = $db->prepare("DELETE FROM alert_thresholds WHERE id = :id AND teacher_id = :teacher_id");
        $stmt->bindParam(':id', $_GET['id'], PDO::PARAM_INT);
        $stmt->bindParam(':teacher_id', $teacherId, PDO::PARAM_INT);
        $stmt->execute();
        echo json_encode(['success' => true, 'message' => 'Seuil supprimé.']);
        return;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
}
?>
