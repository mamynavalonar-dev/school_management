<?php
require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

// Gérer les requêtes OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';
require_once '../config/admin_guard.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$type = $_GET['type'] ?? 'stats';

if ($method === 'GET') {
    if ($type === 'stats') {
        getDashboardStats($db);
    } elseif ($type === 'users') {
        getUserStats($db);
    } elseif ($type === 'system-info') {
        getSystemInfo($db);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Type de statistique inconnu']);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée']);
}

function getDashboardStats($db) {
    try {
        $stats = [];

        // Total users
        $query = "SELECT COUNT(*) as total FROM users WHERE deleted_at IS NULL";
        $stmt = $db->query($query);
        $stats['total_users'] = (int)$stmt->fetchColumn();

        // Users by role
        $query = "SELECT role, COUNT(*) as count FROM users WHERE deleted_at IS NULL GROUP BY role";
        $stmt = $db->query($query);
        $usersByRole = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        $stats['users_by_role'] = $usersByRole ?: [];

        // Users by status
        $query = "SELECT status, COUNT(*) as count FROM users WHERE deleted_at IS NULL GROUP BY status";
        $stmt = $db->query($query);
        $usersByStatus = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        $stats['users_by_status'] = $usersByStatus ?: [];

        // Recent users (last 7 days)
        $query = "SELECT COUNT(*) as recent FROM users
                  WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
        $stmt = $db->query($query);
        $stats['recent_users_week'] = (int)$stmt->fetchColumn();

        $query = "SELECT COUNT(*) FROM users
                  WHERE deleted_at IS NULL AND status = 'active'
                    AND last_seen_at >= UTC_DATE()";
        $stats['active_today'] = (int)$db->query($query)->fetchColumn();

        echo json_encode([
            'success' => true,
            'data' => $stats
        ]);
    } catch (PDOException $e) {
        error_log('Admin dashboard statistics failure: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Impossible de récupérer les statistiques du tableau de bord'
        ]);
    }
}

function getUserStats($db) {
    try {
        $stats = [];

        // Growth over time (last 30 days by week)
        $query = "
            SELECT
                WEEKOFYEAR(created_at) as week,
                YEAR(created_at) as year,
                COUNT(*) as count
            FROM users
            WHERE deleted_at IS NULL
              AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY YEAR(created_at), WEEKOFYEAR(created_at)
            ORDER BY year, week
        ";
        $stmt = $db->query($query);
        $growth = $stmt->fetchAll();
        $stats['growth_last_30_days'] = $growth;

        // Role distribution percentage
        $query = "
            SELECT
                role,
                COUNT(*) as count,
                ROUND((COUNT(*) * 100.0 /
                    NULLIF((SELECT COUNT(*) FROM users WHERE deleted_at IS NULL), 0)), 2) as percentage
            FROM users
            WHERE deleted_at IS NULL
            GROUP BY role
        ";
        $stmt = $db->query($query);
        $stats['role_distribution'] = $stmt->fetchAll();

        echo json_encode([
            'success' => true,
            'data' => $stats
        ]);
    } catch (PDOException $e) {
        error_log('Admin user statistics failure: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Impossible de récupérer les statistiques utilisateurs'
        ]);
    }
}

function getSystemInfo($db) {
    try {
        $info = [];

        $info['database_status'] = 'connected';
        $info['database_name'] = (string)$db->query("SELECT DATABASE()")->fetchColumn();

        // Database version
        $query = "SELECT VERSION() as version";
        $stmt = $db->query($query);
        $info['database_version'] = $stmt->fetchColumn();

        // Database size
        $dbName = $info['database_name'];
        $query = "
            SELECT
                ROUND(COALESCE(SUM(data_length + index_length), 0) / 1024 / 1024, 2) AS size_mb
            FROM information_schema.tables
            WHERE table_schema = :database_name
        ";
        $stmt = $db->prepare($query);
        $stmt->execute([':database_name' => $dbName]);
        $sizeResult = $stmt->fetch();
        $info['database_size_mb'] = $sizeResult ? (float)$sizeResult['size_mb'] : 0;

        // Table count
        $stmt = $db->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = :database_name");
        $stmt->execute([':database_name' => $dbName]);
        $info['table_count'] = (int)$stmt->fetchColumn();

        // Migrations appliquées. La table est créée par backend/migrate.php.
        $migrationTable = $db->prepare("
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = :database_name AND table_name = 'schema_migrations'
        ");
        $migrationTable->execute([':database_name' => $dbName]);
        $info['migration_count'] = (int)$migrationTable->fetchColumn() > 0
            ? (int)$db->query("SELECT COUNT(*) FROM schema_migrations")->fetchColumn()
            : 0;

        // PHP version
        $info['php_version'] = PHP_VERSION;

        $info['memory_limit'] = ini_get('memory_limit') ?: 'Non défini';
        $info['upload_max_filesize'] = ini_get('upload_max_filesize') ?: 'Non défini';
        $info['server_time_utc'] = gmdate('Y-m-d H:i:s');

        // Server info
        $info['server_software'] = $_SERVER['SERVER_SOFTWARE'] ?? PHP_SAPI;

        echo json_encode([
            'success' => true,
            'data' => $info
        ]);
    } catch (Exception $e) {
        error_log('Admin system information failure: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Impossible de récupérer les informations système'
        ]);
    }
}
?>
