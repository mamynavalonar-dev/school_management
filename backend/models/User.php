<?php
class User {
    private $conn;
    private $table_name = "users";

    public $id;
    public $name;
    public $username;
    public $email;
    public $password;
    public $role;
    public $status;
    public $created_at;
    public $updated_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getName(){ return $this->name; }
    public function setName($val){ $this->name = $val; }

    public function getUsername(){ return $this->username; }
    public function setUsername($val){ $this->username = $val; }

    public function getEmail(){ return $this->email; }
    public function setEmail($val){ $this->email = $val; }

    public function getPassword(){ return $this->password; }
    public function setPassword($val){ $this->password = $val; }

    public function getRole(){ return $this->role; }
    public function setRole($val){ $this->role = $val; }

    public function getStatus(){ return $this->status; }
    public function setStatus($val){ $this->status = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    public function getUpdatedAt(){ return $this->updated_at; }
    public function setUpdatedAt($val){ $this->updated_at = $val; }

    // Create user
    public function create(){
        $query = "INSERT INTO " . $this->table_name . " (name, username, email, password, role, status) VALUES (:name, :username, :email, :password, :role, :status)";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->username=strtolower(trim((string)$this->username));
        $this->email=htmlspecialchars(strip_tags($this->email));
        $this->password=htmlspecialchars(strip_tags($this->password));
        $this->role=htmlspecialchars(strip_tags($this->role));
        $this->status=htmlspecialchars(strip_tags($this->status));

        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":username", $this->username);
        $stmt->bindParam(":email", $this->email);
        $hashed_password = password_hash($this->password, PASSWORD_DEFAULT);
        $stmt->bindParam(":password", $hashed_password);
        $stmt->bindParam(":role", $this->role);
        $stmt->bindParam(":status", $this->status);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Read all users
    public function readAll(){
        $query = "SELECT id, name, username, email, role, status, created_at FROM " . $this->table_name . " ORDER BY created_at DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single user
    public function readOne(){
        $query = "SELECT id, name, username, email, role, status, created_at, updated_at FROM " . $this->table_name . " WHERE id = ? LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if($row){
            $this->id = $row['id'];
            $this->name = $row['name'];
            $this->username = $row['username'];
            $this->email = $row['email'];
            $this->role = $row['role'];
            $this->status = $row['status'];
            $this->created_at = $row['created_at'];
            $this->updated_at = $row['updated_at'];
        }
        return $row;
    }

    // Update user
    public function update(){
        $query = "UPDATE " . $this->table_name . " SET name = :name, username = :username, email = :email, role = :role, status = :status, updated_at = :updated_at WHERE id = :id";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->username=strtolower(trim((string)$this->username));
        $this->email=htmlspecialchars(strip_tags($this->email));
        $this->role=htmlspecialchars(strip_tags($this->role));
        $this->status=htmlspecialchars(strip_tags($this->status));

        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":username", $this->username);
        $stmt->bindParam(":email", $this->email);
        // password is not updated here for security; use a separate method if needed
        $stmt->bindParam(":role", $this->role);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":updated_at", $this->updated_at);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Delete user
    public function delete(){
        $query = "DELETE FROM " . $this->table_name . " WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        if($stmt->execute()){
            return true;
        }
        return false;
    }
}
?>
