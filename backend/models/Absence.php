<?php
class Absence {
    private $conn;
    private $table_name = "absences";

    public $id;
    public $student_id;
    public $course_id;
    public $student_name;
    public $student_number;
    public $date;
    public $reason;
    public $status;
    public $justification;
    public $course_name;
    public $created_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getStudentId(){ return $this->student_id; }
    public function setStudentId($val){ $this->student_id = $val; }

    public function getCourseId(){ return $this->course_id; }
    public function setCourseId($val){ $this->course_id = $val; }

    public function getStudentName(){ return $this->student_name; }
    public function setStudentName($val){ $this->student_name = $val; }

    public function getStudentNumber(){ return $this->student_number; }
    public function setStudentNumber($val){ $this->student_number = $val; }

    public function getDate(){ return $this->date; }
    public function setDate($val){ $this->date = $val; }

    public function getReason(){ return $this->reason; }
    public function setReason($val){ $this->reason = $val; }

    public function getStatus(){ return $this->status; }
    public function setStatus($val){ $this->status = $val; }

    public function getJustification(){ return $this->justification; }
    public function setJustification($val){ $this->justification = $val; }

    public function getCourseName(){ return $this->course_name; }
    public function setCourseName($val){ $this->course_name = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    // Create absence
    public function create(){
        $query = "INSERT INTO " . $this->table_name . "
                  SET student_id = :student_id,
                      course_id = :course_id,
                      date = :date,
                      reason = :reason,
                      status = :status,
                      justification = :justification";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->student_id = htmlspecialchars(strip_tags($this->student_id));
        $this->course_id = htmlspecialchars(strip_tags($this->course_id));
        $this->date = htmlspecialchars(strip_tags($this->date));
        $this->reason = htmlspecialchars(strip_tags($this->reason));
        $this->status = htmlspecialchars(strip_tags($this->status));
        $this->justification = htmlspecialchars(strip_tags($this->justification));

        $stmt->bindParam(":student_id", $this->student_id);
        $stmt->bindParam(":course_id", $this->course_id);
        $stmt->bindParam(":date", $this->date);
        $stmt->bindParam(":reason", $this->reason);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":justification", $this->justification);

        if($stmt->execute()){
            $this->id = $this->conn->lastInsertId();
            return true;
        }

        return false;
    }

    // Read all absences
    public function readAll(){
        $query = "SELECT a.*,
                         s.student_number,
                         CONCAT_WS(' ', s.first_name, s.last_name) AS student_name,
                         s.first_name,
                         s.last_name,
                         c.name as course_name
                  FROM " . $this->table_name . " a
                  LEFT JOIN students s ON a.student_id = s.id
                  LEFT JOIN courses c ON a.course_id = c.id
                  ORDER BY a.date";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single absence
    public function readOne(){
        $query = "SELECT a.*,
                         s.student_number,
                         CONCAT_WS(' ', s.first_name, s.last_name) AS student_name,
                         s.first_name,
                         s.last_name,
                         c.name as course_name
                  FROM " . $this->table_name . " a
                  LEFT JOIN students s ON a.student_id = s.id
                  LEFT JOIN courses c ON a.course_id = c.id
                  WHERE a.id = ? LIMIT 0,1";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if($row){

            $this->id = $row['id'];
            $this->student_id = $row['student_id'];
            $this->course_id = $row['course_id'];
            $this->student_name = $row['student_name'];
            $this->student_number = $row['student_number'];
            $this->date = $row['date'];
            $this->reason = $row['reason'];
            $this->status = $row['status'];
            $this->justification = $row['justification'];
            $this->course_name = $row['course_name'];
            $this->created_at = $row['created_at'];
        }

        return $row ?: false;
    }

    // Update absence
    public function update(){
        $query = "UPDATE " . $this->table_name . "
                  SET date = :date,
                      reason = :reason,
                      status = :status,
                      justification = :justification
                  WHERE id = :id";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->date = htmlspecialchars(strip_tags($this->date));
        $this->reason = htmlspecialchars(strip_tags($this->reason));
        $this->status = htmlspecialchars(strip_tags($this->status));
        $this->justification = htmlspecialchars(strip_tags($this->justification));

        $stmt->bindParam(":date", $this->date);
        $stmt->bindParam(":reason", $this->reason);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":justification", $this->justification);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }

        return false;
    }

    // Delete absence
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
