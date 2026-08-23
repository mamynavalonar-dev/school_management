<?php
require_once __DIR__ . '/env.php';

final class DemoDatabaseProbe
{
    public static function isReady(): bool
    {
        $host = trim((string)(getenv('DB_HOST') ?: '127.0.0.1'));
        $port = (int)(getenv('DB_PORT') ?: 3306);
        $db = trim((string)(getenv('DB_NAME') ?: 'school_management'));
        $user = (string)(getenv('DB_USER') ?: 'root');
        $pass = (string)(getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : '');
        $opts = [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_TIMEOUT=>3,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC];
        $ca = trim((string)(getenv('DB_SSL_CA') ?: ''));
        $verify = filter_var(getenv('DB_SSL_VERIFY') ?: 'false', FILTER_VALIDATE_BOOLEAN);
        if ($ca !== '') {
            if (!is_readable($ca)) { error_log('Demo readiness: CA MySQL illisible.'); return false; }
            $opts[PDO::MYSQL_ATTR_SSL_CA] = $ca;
            if (defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) $opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = $verify;
        }
        try {
            $pdo = new PDO("mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",$user,$pass,$opts);
            return (int)$pdo->query('SELECT 1')->fetchColumn() === 1;
        } catch (Throwable $e) {
            error_log('Demo readiness DB probe: ' . $e->getMessage());
            return false;
        }
    }
}
