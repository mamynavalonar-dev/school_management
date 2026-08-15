<?php
/**
 * Flux de notifications contextuel de l'application.
 *
 * Il agrège uniquement des événements que l'utilisateur authentifié a le
 * droit de consulter : messages non lus, évaluations à venir et, pour un
 * étudiant, ses propres notes/absences. Les comptes d'administration voient
 * aussi les créations récentes de comptes.
 */
require_once '../config/database.php';
require_once '../config/cors.php';

applyCorsOrigin();
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/feature_permissions.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    exit();
}

function appendNotification(&$items, $id, $type, $title, $message, $createdAt, $extra = []) {
    $items[] = array_merge([
        'id' => (string)$id,
        'type' => $type,
        'title' => $title,
        'message' => $message,
        'created_at' => $createdAt,
        'is_unread' => true,
    ], $extra);
}

$database = new Database();
$db = $database->getConnection();
$userId = (int)$_SESSION['user_id'];
$role = $_SESSION['user_role'] ?? '';
$permissions = loadFeaturePermissions($db, $userId, $role);
$items = [];

try {
    // Messages que l'utilisateur n'a pas encore ouverts.
    if (!empty($permissions['messaging']['view'])) {
        $stmt = $db->prepare("
        SELECT m.id, m.conversation_id, m.body, m.created_at, u.name AS sender_name
        FROM conversation_participants cp
        INNER JOIN messages m ON m.conversation_id = cp.conversation_id
        INNER JOIN users u ON u.id = m.sender_id
        LEFT JOIN message_expirations expiration ON expiration.message_id = m.id
        LEFT JOIN conversation_user_settings settings
          ON settings.conversation_id = cp.conversation_id
         AND settings.user_id = cp.user_id
        WHERE cp.user_id = :participant_id
          AND m.sender_id != :sender_id
          AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
          AND (expiration.expires_at IS NULL OR expiration.expires_at > UTC_TIMESTAMP())
          AND (settings.muted_until IS NULL OR settings.muted_until <= UTC_TIMESTAMP())
          AND COALESCE(settings.is_blocked, 0) = 0
          AND COALESCE(settings.is_restricted, 0) = 0
        ORDER BY m.created_at DESC
        LIMIT 12
    ");
        $stmt->execute([':participant_id' => $userId, ':sender_id' => $userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $preview = trim((string)($row['body'] ?? ''));
            appendNotification(
                $items,
                'message-' . $row['id'],
                'message',
                'Nouveau message de ' . $row['sender_name'],
                $preview !== '' ? $preview : 'Vous avez reçu une pièce jointe.',
                $row['created_at'],
                ['conversation_id' => (int)$row['conversation_id']]
            );
        }
    }

    // Évaluations à venir : le périmètre dépend strictement du rôle.
    $evaluationRows = [];
    if (!empty($permissions['evaluations']['view']) && $role === 'student') {
        $stmt = $db->prepare("
            SELECT DISTINCT ev.id, ev.title,
                   CONCAT(ev.evaluation_date, ' ', COALESCE(ev.evaluation_time, '00:00:00')) AS created_at,
                   ev.evaluation_date,
                   ev.evaluation_time, c.name AS course_name
            FROM students s
            INNER JOIN enrollments en ON en.student_id = s.id AND en.status = 'Enrolled'
            INNER JOIN evaluations ev ON ev.level_id = en.level_id
                AND COALESCE(ev.specialization_id, 0) = COALESCE(en.specialization_id, 0)
            LEFT JOIN courses c ON c.id = ev.course_id
            WHERE s.user_id = :user_id
              AND ev.evaluation_date >= CURDATE()
              AND (ev.status IS NULL OR ev.status NOT IN ('cancelled', 'completed'))
            ORDER BY ev.evaluation_date, ev.evaluation_time
            LIMIT 8
        ");
        $stmt->execute([':user_id' => $userId]);
    } elseif (!empty($permissions['evaluations']['view']) && $role === 'teacher') {
        $stmt = $db->prepare("
            SELECT ev.id, ev.title,
                   CONCAT(ev.evaluation_date, ' ', COALESCE(ev.evaluation_time, '00:00:00')) AS created_at,
                   ev.evaluation_date,
                   ev.evaluation_time, c.name AS course_name
            FROM teachers t
            INNER JOIN evaluations ev ON ev.teacher_id = t.id
            LEFT JOIN courses c ON c.id = ev.course_id
            WHERE t.user_id = :user_id
              AND ev.evaluation_date >= CURDATE()
              AND (ev.status IS NULL OR ev.status NOT IN ('cancelled', 'completed'))
            ORDER BY ev.evaluation_date, ev.evaluation_time
            LIMIT 8
        ");
        $stmt->execute([':user_id' => $userId]);
    } elseif (!empty($permissions['evaluations']['view'])) {
        $stmt = $db->query("
            SELECT ev.id, ev.title,
                   CONCAT(ev.evaluation_date, ' ', COALESCE(ev.evaluation_time, '00:00:00')) AS created_at,
                   ev.evaluation_date,
                   ev.evaluation_time, c.name AS course_name
            FROM evaluations ev
            LEFT JOIN courses c ON c.id = ev.course_id
            WHERE ev.evaluation_date >= CURDATE()
              AND (ev.status IS NULL OR ev.status NOT IN ('cancelled', 'completed'))
            ORDER BY ev.evaluation_date, ev.evaluation_time
            LIMIT 8
        ");
    }

    if (!empty($permissions['evaluations']['view'])) {
        $evaluationRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    foreach ($evaluationRows as $row) {
        $date = date('d/m/Y', strtotime($row['evaluation_date']));
        $time = substr((string)($row['evaluation_time'] ?? ''), 0, 5);
        $when = trim($date . ($time !== '' ? ' à ' . $time : ''));
        appendNotification(
            $items,
            'evaluation-' . $row['id'],
            'evaluation',
            $row['title'],
            trim(($row['course_name'] ? $row['course_name'] . ' · ' : '') . $when),
            $row['created_at'] ?: $row['evaluation_date'],
            ['target' => 'evaluations']
        );
    }

    if ($role === 'student' && !empty($permissions['grades']['view'])) {
        $stmt = $db->prepare("
            SELECT g.id, g.score, g.max_score, g.created_at,
                   ev.title AS evaluation_title, c.name AS course_name
            FROM students s
            INNER JOIN grades g ON g.student_id = s.id
            INNER JOIN evaluations ev ON ev.id = g.evaluation_id
            INNER JOIN courses c ON c.id = ev.course_id
            WHERE s.user_id = :user_id
              AND g.status = 'completed'
              AND g.score IS NOT NULL
              AND g.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ORDER BY g.created_at DESC
            LIMIT 6
        ");
        $stmt->execute([':user_id' => $userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            appendNotification(
                $items,
                'grade-' . $row['id'],
                'grade',
                'Nouvelle note en ' . $row['course_name'],
                $row['evaluation_title'] . ' : ' . $row['score'] . '/' . $row['max_score'],
                $row['created_at'],
                ['target' => 'grades']
            );
        }
    }

    if ($role === 'student' && !empty($permissions['absences']['view'])) {
        $stmt = $db->prepare("
            SELECT a.id, a.date, a.status, a.created_at, c.name AS course_name
            FROM students s
            INNER JOIN absences a ON a.student_id = s.id
            LEFT JOIN courses c ON c.id = a.course_id
            WHERE s.user_id = :user_id AND a.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ORDER BY a.created_at DESC
            LIMIT 6
        ");
        $stmt->execute([':user_id' => $userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            appendNotification(
                $items,
                'absence-' . $row['id'],
                'absence',
                'Absence enregistrée' . ($row['course_name'] ? ' en ' . $row['course_name'] : ''),
                date('d/m/Y', strtotime($row['date'])) . ' · statut : ' . $row['status'],
                $row['created_at'],
                ['target' => 'absences']
            );
        }
    }

    if ($role === 'student') {
        $stmt = $db->prepare("
            SELECT aa.id,aa.event_type,aa.message,aa.created_at
            FROM students s
            INNER JOIN academic_alerts aa ON aa.student_id=s.id
            WHERE s.user_id=:user_id AND aa.created_at >= DATE_SUB(NOW(), INTERVAL 180 DAY)
            ORDER BY aa.created_at DESC LIMIT 12
        " );
        $stmt->execute([':user_id' => $userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $title = match ($row['event_type']) {
                'suspended' => 'Compte suspendu — décision académique',
                'repeat_allowed' => 'Redoublement autorisé',
                'reactivated' => 'Compte réactivé',
                default => 'Avertissement académique',
            };
            appendNotification(
                $items,
                'academic-' . $row['id'],
                'academic',
                $title,
                $row['message'],
                $row['created_at'],
                ['target' => 'grades']
            );
        }
    }

    if ($role === 'admin' || $role === 'directeur') {
        $stmt = $db->query("
            SELECT id, name, role, created_at
            FROM users
            WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ORDER BY created_at DESC
            LIMIT 8
        ");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            appendNotification(
                $items,
                'user-' . $row['id'],
                'user',
                'Nouveau compte utilisateur',
                $row['name'] . ' · ' . $row['role'],
                $row['created_at'],
                ['target' => $role === 'admin' ? 'admin-users' : null]
            );
        }
    }

    usort($items, static function ($a, $b) {
        return strtotime((string)$b['created_at']) <=> strtotime((string)$a['created_at']);
    });

    echo json_encode(['success' => true, 'data' => array_slice($items, 0, 30)]);
} catch (Throwable $e) {
    error_log('Throwable in notifications.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Impossible de charger les notifications.']);
}
?>
