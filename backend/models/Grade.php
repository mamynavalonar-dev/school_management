<?php
class Grade {
    private $conn;
    private $table_name = "grades";

    public $id;
    public $student_id;
    public $student_name;
    public $student_number;
    public $evaluation_id;
    public $evaluation_title;
    public $course_name;
    public $score;
    public $max_score;
    public $status;
    public $grade_date;
    public $is_absent;
    public $created_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getStudentId(){ return $this->student_id; }
    public function setStudentId($val){ $this->student_id = $val; }

    public function getStudentName(){ return $this->student_name; }
    public function setStudentName($val){ $this->student_name = $val; }

    public function getStudentNumber(){ return $this->student_number; }
    public function setStudentNumber($val){ $this->student_number = $val; }

    public function getEvaluationId(){ return $this->evaluation_id; }
    public function setEvaluationId($val){ $this->evaluation_id = $val; }

    public function getEvaluationTitle(){ return $this->evaluation_title; }
    public function setEvaluationTitle($val){ $this->evaluation_title = $val; }

    public function getCourseName(){ return $this->course_name; }
    public function setCourseName($val){ $this->course_name = $val; }

    public function getScore(){ return $this->score; }
    public function setScore($val){ $this->score = $val; }

    public function getMaxScore(){ return $this->max_score; }
    public function setMaxScore($val){ $this->max_score = $val; }

    public function getStatus(){ return $this->status; }
    public function setStatus($val){ $this->status = $val; }

    public function getGradeDate(){ return $this->grade_date; }
    public function setGradeDate($val){ $this->grade_date = $val; }

    public function getIsAbsent(){ return $this->is_absent; }
    public function setIsAbsent($val){ $this->is_absent = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    // Create grade
    public function create(){
        $query = "INSERT INTO " . $this->table_name . "
                  SET student_id = :student_id,
                      evaluation_id = :evaluation_id,
                      score = :score,
                      max_score = :max_score,
                      status = :status,
                      grade_date = :grade_date,
                      is_absent = :is_absent";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->student_id = htmlspecialchars(strip_tags($this->student_id));
        $this->evaluation_id = htmlspecialchars(strip_tags($this->evaluation_id));
        $this->score = htmlspecialchars(strip_tags($this->score));
        $this->max_score = htmlspecialchars(strip_tags($this->max_score));
        $this->status = htmlspecialchars(strip_tags($this->status));
        $this->grade_date = htmlspecialchars(strip_tags($this->grade_date));
        $this->is_absent = htmlspecialchars(strip_tags($this->is_absent));

        $stmt->bindParam(":student_id", $this->student_id);
        $stmt->bindParam(":evaluation_id", $this->evaluation_id);
        $stmt->bindParam(":score", $this->score);
        $stmt->bindParam(":max_score", $this->max_score);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":grade_date", $this->grade_date);
        $stmt->bindParam(":is_absent", $this->is_absent);

        if($stmt->execute()){
            $this->id = $this->conn->lastInsertId();
            return true;
        }

        return false;
    }

    // Read all grades
    public function readAll(){
        $query = "SELECT g.*,
                         CONCAT(s.first_name, ' ', s.last_name) as student_name,
                         s.student_number,
                         e.title as evaluation_title,
                         c.name as course_name
                  FROM " . $this->table_name . " g
                  LEFT JOIN students s ON g.student_id = s.id
                  LEFT JOIN evaluations e ON g.evaluation_id = e.id
                  LEFT JOIN courses c ON e.course_id = c.id
                  ORDER BY g.grade_date";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single grade
    public function readOne(){
        $query = "SELECT g.*,
                         s.student_number,
                         CONCAT_WS(' ', s.first_name, s.last_name) AS student_name,
                         s.first_name,
                         s.last_name,
                         e.title as evaluation_title,
                         c.name as course_name
                  FROM " . $this->table_name . " g
                  LEFT JOIN students s ON g.student_id = s.id
                  LEFT JOIN evaluations e ON g.evaluation_id = e.id
                  LEFT JOIN courses c ON e.course_id = c.id
                  WHERE g.id = ? LIMIT 0,1";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if($row){

            $this->id = $row['id'];
            $this->student_id = $row['student_id'];
            $this->student_name = $row['student_name'];
            $this->student_number = $row['student_number'];
            $this->evaluation_id = $row['evaluation_id'];
            $this->evaluation_title = $row['evaluation_title'];
            $this->course_name = $row['course_name'];
            $this->score = $row['score'];
            $this->max_score = $row['max_score'];
            $this->status = $row['status'];
            $this->grade_date = $row['grade_date'];
            $this->is_absent = $row['is_absent'];
            $this->created_at = $row['created_at'];
        }

        return $row ?: false;
    }

    // Update grade
    public function update(){
        $query = "UPDATE " . $this->table_name . "
                  SET score = :score,
                      max_score = :max_score,
                      status = :status,
                      grade_date = :grade_date,
                      is_absent = :is_absent
                  WHERE id = :id";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->score = htmlspecialchars(strip_tags($this->score));
        $this->max_score = htmlspecialchars(strip_tags($this->max_score));
        $this->status = htmlspecialchars(strip_tags($this->status));
        $this->grade_date = htmlspecialchars(strip_tags($this->grade_date));
        $this->is_absent = htmlspecialchars(strip_tags($this->is_absent));

        $stmt->bindParam(":score", $this->score);
        $stmt->bindParam(":max_score", $this->max_score);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":grade_date", $this->grade_date);
        $stmt->bindParam(":is_absent", $this->is_absent);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }

        return false;
    }

    // Delete grade
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
