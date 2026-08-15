<?php
class AlertThreshold {
    private $conn;
    private $table_name = "alert_thresholds";

    public $id;
    public $teacher_id;
    public $course_id;
    public $metric;
    public $threshold_value;
    public $is_active;
    public $created_at;
    public $updated_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getTeacherId(){ return $this->teacher_id; }
    public function setTeacherId($val){ $this->teacher_id = $val; }

    public function getCourseId(){ return $this->course_id; }
    public function setCourseId($val){ $this->course_id = $val; }

    public function getMetric(){ return $this->metric; }
    public function setMetric($val){ $this->metric = $val; }

    public function getThresholdValue(){ return $this->threshold_value; }
    public function setThresholdValue($val){ $this->threshold_value = $val; }

    public function getIsActive(){ return $this->is_active; }
    public function setIsActive($val){ $this->is_active = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    public function getUpdatedAt(){ return $this->updated_at; }
    public function setUpdatedAt($val){ $this->updated_at = $val; }

    // Create alert threshold
    public function create(){
        $query = "INSERT INTO " . $this->table_name . "
                  SET teacher_id = :teacher_id,
                      course_id = :course_id,
                      metric = :metric,
                      threshold_value = :threshold_value,
                      is_active = :is_active";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->teacher_id = htmlspecialchars(strip_tags($this->teacher_id));
        $this->course_id = $this->course_id === null ? null : htmlspecialchars(strip_tags($this->course_id));
        $this->metric = htmlspecialchars(strip_tags($this->metric));
        $this->threshold_value = htmlspecialchars(strip_tags($this->threshold_value));
        $this->is_active = $this->is_active === true ? 1 : 0; // Ensure boolean is stored as 0/1

        $stmt->bindParam(":teacher_id", $this->teacher_id);
        $stmt->bindParam(":course_id", $this->course_id, $this->course_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindParam(":metric", $this->metric);
        $stmt->bindParam(":threshold_value", $this->threshold_value);
        $stmt->bindParam(":is_active", $this->is_active);

        if($stmt->execute()){
            $this->id = $this->conn->lastInsertId();
            return true;
        }

        return false;
    }

    // Read all alert thresholds
    public function readAll(){
        $query = "SELECT at.*,
                         t.first_name as teacher_first_name,
                         t.last_name as teacher_last_name,
                         c.name as course_name
                  FROM " . $this->table_name . " at
                  LEFT JOIN teachers t ON at.teacher_id = t.id
                  LEFT JOIN courses c ON at.course_id = c.id
                  ORDER BY at.created_at DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single alert threshold
    public function readOne(){
        $query = "SELECT at.*,
                         t.first_name as teacher_first_name,
                         t.last_name as teacher_last_name,
                         c.name as course_name
                  FROM " . $this->table_name . " at
                  LEFT JOIN teachers t ON at.teacher_id = t.id
                  LEFT JOIN courses c ON at.course_id = c.id
                  WHERE at.id = ? LIMIT 0,1";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if($row){

            $this->id = $row['id'];
            $this->teacher_id = $row['teacher_id'];
            $this->course_id = $row['course_id'];
            $this->metric = $row['metric'];
            $this->threshold_value = $row['threshold_value'];
            $this->is_active = $row['is_active'];
            $this->created_at = $row['created_at'];
            $this->updated_at = $row['updated_at'];
        }

        return $row ?: false;
    }

    // Read alert thresholds by teacher
    public function readByTeacher($teacherId){
        $query = "SELECT at.*,
                         t.first_name as teacher_first_name,
                         t.last_name as teacher_last_name,
                         c.name as course_name
                  FROM " . $this->table_name . " at
                  LEFT JOIN teachers t ON at.teacher_id = t.id
                  LEFT JOIN courses c ON at.course_id = c.id
                  WHERE at.teacher_id = ?
                  ORDER BY at.created_at DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $teacherId);
        $stmt->execute();
        return $stmt;
    }

    // Update alert threshold
    public function update(){
        $query = "UPDATE " . $this->table_name . "
                  SET teacher_id = :teacher_id,
                      course_id = :course_id,
                      metric = :metric,
                      threshold_value = :threshold_value,
                      is_active = :is_active
                  WHERE id = :id";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->teacher_id = htmlspecialchars(strip_tags($this->teacher_id));
        $this->course_id = $this->course_id === null ? null : htmlspecialchars(strip_tags($this->course_id));
        $this->metric = htmlspecialchars(strip_tags($this->metric));
        $this->threshold_value = htmlspecialchars(strip_tags($this->threshold_value));
        $this->is_active = $this->is_active === true ? 1 : 0; // Ensure boolean is stored as 0/1

        $stmt->bindParam(":teacher_id", $this->teacher_id);
        $stmt->bindParam(":course_id", $this->course_id, $this->course_id === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindParam(":metric", $this->metric);
        $stmt->bindParam(":threshold_value", $this->threshold_value);
        $stmt->bindParam(":is_active", $this->is_active);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }

        return false;
    }

    // Delete alert threshold
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
