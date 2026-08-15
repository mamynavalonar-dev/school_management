<?php
class Level {
    private $conn;
    private $table_name = "levels";

    public $id;
    public $name;
    public $capacity;
    public $created_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getName(){ return $this->name; }
    public function setName($val){ $this->name = $val; }

    public function getCapacity(){ return $this->capacity; }
    public function setCapacity($val){ $this->capacity = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    // Create level
    public function create(){
        $query = "INSERT INTO " . $this->table_name . " (name, capacity) VALUES (:name, :capacity)";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->capacity=htmlspecialchars(strip_tags($this->capacity));

        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":capacity", $this->capacity);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Read all levels
    public function readAll(){
        $query = "SELECT id, name, capacity, created_at FROM " . $this->table_name . " ORDER BY name";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single level
    public function readOne(){
        $query = "SELECT id, name, capacity, created_at FROM " . $this->table_name . " WHERE id = ? LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if($row){
            $this->id = $row['id'];
            $this->name = $row['name'];
            $this->capacity = $row['capacity'];
            $this->created_at = $row['created_at'];
        }
        return $row;
    }

    // Update level
    public function update(){
        $query = "UPDATE " . $this->table_name . " SET name = :name, capacity = :capacity WHERE id = :id";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->capacity=htmlspecialchars(strip_tags($this->capacity));

        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":capacity", $this->capacity);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Delete level
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
