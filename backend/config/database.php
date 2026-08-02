<?php
class Database {
    private $host = 'localhost';
    private $db_name = 'school_management';
    private $username = 'root';
    private $password = '';
    private ?PDO $conn;

    public function getConnection(): ?PDO {
        $this->conn = null;
        try {
            $this->conn = new PDO(
                "mysql:host={$this->host};dbname={$this->db_name};charset=utf8mb4",
                $this->username, $this->password
            );
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (PDOException $exception) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur connexion BDD: " . $exception->getMessage()]);
            exit();
        }
        return $this->conn;
    }
}
?>


