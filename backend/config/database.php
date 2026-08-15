<?php
class Database {
    private $host = 'localhost';
    private $port = 3306;
    private $db_name = 'school_management';
    private $username = 'root';
    private $password = '';
    private ?PDO $conn;

    public function __construct() {
        require_once __DIR__ . '/env.php';
        $this->host = getenv('DB_HOST') ?: $this->host;
        $this->port = (int)(getenv('DB_PORT') ?: $this->port);
        $this->db_name = getenv('DB_NAME') ?: $this->db_name;
        $this->username = getenv('DB_USER') ?: $this->username;
        $this->password = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : $this->password;
    }

    public function getConnection(): ?PDO {
        $this->conn = null;
        try {
            $this->conn = new PDO(
                "mysql:host={$this->host};port={$this->port};dbname={$this->db_name};charset=utf8mb4",
                $this->username, $this->password
            );
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (PDOException $exception) {
            error_log('Database connection failure: ' . $exception->getMessage());
            if (PHP_SAPI === 'cli') {
                throw new RuntimeException(
                    'Connexion à la base de données impossible : ' . $exception->getMessage(),
                    0,
                    $exception
                );
            }
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Connexion à la base de données impossible.']);
            exit();
        }
        return $this->conn;
    }
}
?>
