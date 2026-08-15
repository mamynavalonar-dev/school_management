<?php
class Enrollment {
    private $conn;
    private $table_name = "enrollments";

    public $id;
    public $student_id;
    public $level_id;
    public $specialization_id;
    public $academic_year;
    public $enrollment_date;
    public $status;
    public $created_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getStudentId(){ return $this->student_id; }
    public function setStudentId($val){ $this->student_id = $val; }

    public function getLevelId(){ return $this->level_id; }
    public function setLevelId($val){ $this->level_id = $val; }

    public function getSpecializationId(){ return $this->specialization_id; }
    public function setSpecializationId($val){ $this->specialization_id = $val; }

    public function getAcademicYear(){ return $this->academic_year; }
    public function setAcademicYear($val){ $this->academic_year = $val; }

    public function getEnrollmentDate(){ return $this->enrollment_date; }
    public function setEnrollmentDate($val){ $this->enrollment_date = $val; }

    public function getStatus(){ return $this->status; }
    public function setStatus($val){ $this->status = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    // Create enrollment
    public function create(){
        $query = "INSERT INTO " . $this->table_name . "
                  SET student_id = :student_id,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      academic_year = :academic_year,
                      enrollment_date = :enrollment_date,
                      status = :status";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->student_id=htmlspecialchars(strip_tags($this->student_id));
        $this->level_id=htmlspecialchars(strip_tags($this->level_id));
        $this->specialization_id=htmlspecialchars(strip_tags($this->specialization_id));
        $this->academic_year=htmlspecialchars(strip_tags($this->academic_year));
        $this->enrollment_date=htmlspecialchars(strip_tags($this->enrollment_date));
        $this->status=htmlspecialchars(strip_tags($this->status));

        $stmt->bindParam(":student_id", $this->student_id);
        $stmt->bindParam(":level_id", $this->level_id);
        $stmt->bindParam(":specialization_id", $this->specialization_id);
        $stmt->bindParam(":academic_year", $this->academic_year);
        $stmt->bindParam(":enrollment_date", $this->enrollment_date);
        $stmt->bindParam(":status", $this->status);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Read all enrollments
    public function readAll(){
        $query = "SELECT e.*, s.student_number, s.first_name, s.last_name, l.name as level_name, sp.name as specialization_name
                  FROM " . $this->table_name . " e
                  LEFT JOIN students s ON e.student_id = s.id
                  LEFT JOIN levels l ON e.level_id = l.id
                  LEFT JOIN specializations sp ON e.specialization_id = sp.id
                  ORDER BY e.enrollment_date DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single enrollment
    public function readOne(){
        $query = "SELECT e.*, s.student_number, s.first_name, s.last_name, l.name as level_name, sp.name as specialization_name
                  FROM " . $this->table_name . " e
                  LEFT JOIN students s ON e.student_id = s.id
                  LEFT JOIN levels l ON e.level_id = l.id
                  LEFT JOIN specializations sp ON e.specialization_id = sp.id
                  WHERE e.id = ? LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if($row){
            $this->id = $row['id'];
            $this->student_id = $row['student_id'];
            $this->level_id = $row['level_id'];
            $this->specialization_id = $row['specialization_id'];
            $this->academic_year = $row['academic_year'];
            $this->enrollment_date = $row['enrollment_date'];
            $this->status = $row['status'];
            $this->created_at = $row['created_at'];
        }
        return $row;
    }

    // Update enrollment
    public function update(){
        $query = "UPDATE " . $this->table_name . "
                  SET student_id = :student_id,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      academic_year = :academic_year,
                      enrollment_date = :enrollment_date,
                      status = :status
                  WHERE id = :id";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->student_id=htmlspecialchars(strip_tags($this->student_id));
        $this->level_id=htmlspecialchars(strip_tags($this->level_id));
        $this->specialization_id=htmlspecialchars(strip_tags($this->specialization_id));
        $this->academic_year=htmlspecialchars(strip_tags($this->academic_year));
        $this->enrollment_date=htmlspecialchars(strip_tags($this->enrollment_date));
        $this->status=htmlspecialchars(strip_tags($this->status));

        $stmt->bindParam(":student_id", $this->student_id);
        $stmt->bindParam(":level_id", $this->level_id);
        $stmt->bindParam(":specialization_id", $this->specialization_id);
        $stmt->bindParam(":academic_year", $this->academic_year);
        $stmt->bindParam(":enrollment_date", $this->enrollment_date);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Delete enrollment
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
