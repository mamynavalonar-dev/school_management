<?php
class EvaluationType {
    private $conn;
    private $table_name = "evaluation_types";

    public $id;
    public $name;
    public $description;
    public $created_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getName(){ return $this->name; }
    public function setName($val){ $this->name = $val; }

    public function getDescription(){ return $this->description; }
    public function setDescription($val){ $this->description = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    // Create evaluation type
    public function create(){
        $query = "INSERT INTO " . $this->table_name . " (name, description) VALUES (:name, :description)";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->description=htmlspecialchars(strip_tags($this->description));

        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":description", $this->description);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Read all evaluation types
    public function readAll(){
        $query = "SELECT id, name, description, created_at FROM " . $this->table_name . " ORDER BY name";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single evaluation type
    public function readOne(){
        $query = "SELECT id, name, description, created_at FROM " . $this->table_name . " WHERE id = ? LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if($row){
            $this->id = $row['id'];
            $this->name = $row['name'];
            $this->description = $row['description'];
            $this->created_at = $row['created_at'];
        }
        return $row;
    }

    // Update evaluation type
    public function update(){
        $query = "UPDATE " . $this->table_name . " SET name = :name, description = :description WHERE id = :id";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->description=htmlspecialchars(strip_tags($this->description));

        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":description", $this->description);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Delete evaluation type
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
