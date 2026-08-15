<?php
class Evaluation {
    private $conn;
    private $table_name = "evaluations";

    public $id;
    public $title;
    public $course_id;
    public $teacher_id;
    public $room_id;
    public $evaluation_type_id;
    public $evaluation_date;
    public $evaluation_time;
    public $duration_minutes;
    public $level_id;
    public $specialization_id;
    public $status;
    public $registered_students;
    public $completed_grades;
    public $created_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getTitle(){ return $this->title; }
    public function setTitle($val){ $this->title = $val; }

    public function getCourseId(){ return $this->course_id; }
    public function setCourseId($val){ $this->course_id = $val; }

    public function getTeacherId(){ return $this->teacher_id; }
    public function setTeacherId($val){ $this->teacher_id = $val; }

    public function getRoomId(){ return $this->room_id; }
    public function setRoomId($val){ $this->room_id = $val; }

    public function getEvaluationTypeId(){ return $this->evaluation_type_id; }
    public function setEvaluationTypeId($val){ $this->evaluation_type_id = $val; }

    public function getEvaluationDate(){ return $this->evaluation_date; }
    public function setEvaluationDate($val){ $this->evaluation_date = $val; }

    public function getEvaluationTime(){ return $this->evaluation_time; }
    public function setEvaluationTime($val){ $this->evaluation_time = $val; }

    public function getDurationMinutes(){ return $this->duration_minutes; }
    public function setDurationMinutes($val){ $this->duration_minutes = $val; }

    public function getLevelId(){ return $this->level_id; }
    public function setLevelId($val){ $this->level_id = $val; }

    public function getSpecializationId(){ return $this->specialization_id; }
    public function setSpecializationId($val){ $this->specialization_id = $val; }

    public function getStatus(){ return $this->status; }
    public function setStatus($val){ $this->status = $val; }

    public function getRegisteredStudents(){ return $this->registered_students; }
    public function setRegisteredStudents($val){ $this->registered_students = $val; }

    public function getCompletedGrades(){ return $this->completed_grades; }
    public function setCompletedGrades($val){ $this->completed_grades = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    // Create evaluation
    public function create(){
        $query = "INSERT INTO " . $this->table_name . "
                  SET title = :title,
                      course_id = :course_id,
                      teacher_id = :teacher_id,
                      room_id = :room_id,
                      evaluation_type_id = :evaluation_type_id,
                      evaluation_date = :evaluation_date,
                      evaluation_time = :evaluation_time,
                      duration_minutes = :duration_minutes,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      status = :status,
                      registered_students = :registered_students,
                      completed_grades = :completed_grades";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->title = htmlspecialchars(strip_tags($this->title));
        $this->course_id = htmlspecialchars(strip_tags($this->course_id));
        $this->teacher_id = htmlspecialchars(strip_tags($this->teacher_id));
        $this->room_id = htmlspecialchars(strip_tags($this->room_id));
        $this->evaluation_type_id = htmlspecialchars(strip_tags($this->evaluation_type_id));
        $this->evaluation_date = htmlspecialchars(strip_tags($this->evaluation_date));
        $this->evaluation_time = htmlspecialchars(strip_tags($this->evaluation_time));
        $this->duration_minutes = htmlspecialchars(strip_tags($this->duration_minutes));
        $this->level_id = htmlspecialchars(strip_tags($this->level_id));
        $this->specialization_id = htmlspecialchars(strip_tags($this->specialization_id));
        $this->status = htmlspecialchars(strip_tags($this->status));
        $this->registered_students = htmlspecialchars(strip_tags($this->registered_students));
        $this->completed_grades = htmlspecialchars(strip_tags($this->completed_grades));

        $stmt->bindParam(":title", $this->title);
        $stmt->bindParam(":course_id", $this->course_id);
        $stmt->bindParam(":teacher_id", $this->teacher_id);
        $stmt->bindParam(":room_id", $this->room_id);
        $stmt->bindParam(":evaluation_type_id", $this->evaluation_type_id);
        $stmt->bindParam(":evaluation_date", $this->evaluation_date);
        $stmt->bindParam(":evaluation_time", $this->evaluation_time);
        $stmt->bindParam(":duration_minutes", $this->duration_minutes);
        $stmt->bindParam(":level_id", $this->level_id);
        $stmt->bindParam(":specialization_id", $this->specialization_id);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":registered_students", $this->registered_students);
        $stmt->bindParam(":completed_grades", $this->completed_grades);

        if($stmt->execute()){
            $this->id = $this->conn->lastInsertId();
            return true;
        }

        return false;
    }

    // Read all evaluations
    // Dans Evaluation.php, méthode readAll()
    public function readAll(){
        $query = "
            SELECT e.*,
                c.name AS course_name,
                CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
                r.name AS room_name,
                et.name AS evaluation_type_name,
                l.name AS level_name,
                s.name AS specialization_name
            FROM evaluations e
            LEFT JOIN courses c ON e.course_id = c.id
            LEFT JOIN teachers t ON e.teacher_id = t.id
            LEFT JOIN rooms r ON e.room_id = r.id
            LEFT JOIN evaluation_types et ON e.evaluation_type_id = et.id
            LEFT JOIN levels l ON e.level_id = l.id
            LEFT JOIN specializations s ON e.specialization_id = s.id
            ORDER BY e.evaluation_date DESC
        ";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single evaluation
    public function readOne(){
        $query = "SELECT e.*,
                         c.name as course_name,
                         CONCAT(t.first_name, ' ', t.last_name) as teacher_name,
                         r.name as room_name,
                         et.name as evaluation_type_name,
                         l.name as level_name,
                         s.name as specialization_name
                  FROM " . $this->table_name . " e
                  LEFT JOIN courses c ON e.course_id = c.id
                  LEFT JOIN teachers t ON e.teacher_id = t.id
                  LEFT JOIN rooms r ON e.room_id = r.id
                  LEFT JOIN evaluation_types et ON e.evaluation_type_id = et.id
                  LEFT JOIN levels l ON e.level_id = l.id
                  LEFT JOIN specializations s ON e.specialization_id = s.id
                  WHERE e.id = ? LIMIT 0,1";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if($row){

            $this->id = $row['id'];
            $this->title = $row['title'];
            $this->course_id = $row['course_id'];
            $this->teacher_id = $row['teacher_id'];
            $this->room_id = $row['room_id'];
            $this->evaluation_type_id = $row['evaluation_type_id'];
            $this->evaluation_date = $row['evaluation_date'];
            $this->evaluation_time = $row['evaluation_time'];
            $this->duration_minutes = $row['duration_minutes'];
            $this->level_id = $row['level_id'];
            $this->specialization_id = $row['specialization_id'];
            $this->status = $row['status'];
            $this->registered_students = $row['registered_students'];
            $this->completed_grades = $row['completed_grades'];
            $this->created_at = $row['created_at'];
        }

        return $row ?: false;
    }

    // Update evaluation
    public function update(){
        $query = "UPDATE " . $this->table_name . "
                  SET title = :title,
                      course_id = :course_id,
                      teacher_id = :teacher_id,
                      room_id = :room_id,
                      evaluation_type_id = :evaluation_type_id,
                      evaluation_date = :evaluation_date,
                      evaluation_time = :evaluation_time,
                      duration_minutes = :duration_minutes,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      status = :status,
                      registered_students = :registered_students,
                      completed_grades = :completed_grades
                  WHERE id = :id";

        $stmt = $this->conn->prepare($query);

        // Sanitize
        $this->title = htmlspecialchars(strip_tags($this->title));
        $this->course_id = htmlspecialchars(strip_tags($this->course_id));
        $this->teacher_id = htmlspecialchars(strip_tags($this->teacher_id));
        $this->room_id = htmlspecialchars(strip_tags($this->room_id));
        $this->evaluation_type_id = htmlspecialchars(strip_tags($this->evaluation_type_id));
        $this->evaluation_date = htmlspecialchars(strip_tags($this->evaluation_date));
        $this->evaluation_time = htmlspecialchars(strip_tags($this->evaluation_time));
        $this->duration_minutes = htmlspecialchars(strip_tags($this->duration_minutes));
        $this->level_id = htmlspecialchars(strip_tags($this->level_id));
        $this->specialization_id = htmlspecialchars(strip_tags($this->specialization_id));
        $this->status = htmlspecialchars(strip_tags($this->status));
        $this->registered_students = htmlspecialchars(strip_tags($this->registered_students));
        $this->completed_grades = htmlspecialchars(strip_tags($this->completed_grades));

        $stmt->bindParam(":title", $this->title);
        $stmt->bindParam(":course_id", $this->course_id);
        $stmt->bindParam(":teacher_id", $this->teacher_id);
        $stmt->bindParam(":room_id", $this->room_id);
        $stmt->bindParam(":evaluation_type_id", $this->evaluation_type_id);
        $stmt->bindParam(":evaluation_date", $this->evaluation_date);
        $stmt->bindParam(":evaluation_time", $this->evaluation_time);
        $stmt->bindParam(":duration_minutes", $this->duration_minutes);
        $stmt->bindParam(":level_id", $this->level_id);
        $stmt->bindParam(":specialization_id", $this->specialization_id);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":registered_students", $this->registered_students);
        $stmt->bindParam(":completed_grades", $this->completed_grades);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }

        return false;
    }

    // Delete evaluation
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
