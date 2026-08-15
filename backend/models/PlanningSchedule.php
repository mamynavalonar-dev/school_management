<?php
class PlanningSchedule {
    private $conn;
    private $table_name = "planning_schedules";

    public $id;
    public $course_id;
    public $teacher_id;
    public $room_id;
    public $level_id;
    public $specialization_id;
    public $day_of_week;
    public $start_time;
    public $end_time;
    public $type;
    public $color;
    public $created_at;

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getCourseId(){ return $this->course_id; }
    public function setCourseId($val){ $this->course_id = $val; }

    public function getTeacherId(){ return $this->teacher_id; }
    public function setTeacherId($val){ $this->teacher_id = $val; }

    public function getRoomId(){ return $this->room_id; }
    public function setRoomId($val){ $this->room_id = $val; }

    public function getLevelId(){ return $this->level_id; }
    public function setLevelId($val){ $this->level_id = $val; }

    public function getSpecializationId(){ return $this->specialization_id; }
    public function setSpecializationId($val){ $this->specialization_id = $val; }

    public function getDayOfWeek(){ return $this->day_of_week; }
    public function setDayOfWeek($val){ $this->day_of_week = $val; }

    public function getStartTime(){ return $this->start_time; }
    public function setStartTime($val){ $this->start_time = $val; }

    public function getEndTime(){ return $this->end_time; }
    public function setEndTime($val){ $this->end_time = $val; }

    public function getType(){ return $this->type; }
    public function setType($val){ $this->type = $val; }

    public function getColor(){ return $this->color; }
    public function setColor($val){ $this->color = $val; }

    public function getCreatedAt(){ return $this->created_at; }
    public function setCreatedAt($val){ $this->created_at = $val; }

    // Create planning schedule
    public function create(){
        $query = "INSERT INTO " . $this->table_name . "
                  SET course_id = :course_id,
                      teacher_id = :teacher_id,
                      room_id = :room_id,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      day_of_week = :day_of_week,
                      start_time = :start_time,
                      end_time = :end_time,
                      type = :type,
                      color = :color";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->course_id=htmlspecialchars(strip_tags($this->course_id));
        $this->teacher_id=htmlspecialchars(strip_tags($this->teacher_id));
        $this->room_id=htmlspecialchars(strip_tags($this->room_id));
        $this->level_id=htmlspecialchars(strip_tags($this->level_id));
        $this->specialization_id=htmlspecialchars(strip_tags($this->specialization_id));
        $this->day_of_week=htmlspecialchars(strip_tags($this->day_of_week));
        $this->start_time=htmlspecialchars(strip_tags($this->start_time));
        $this->end_time=htmlspecialchars(strip_tags($this->end_time));
        $this->type=htmlspecialchars(strip_tags($this->type));
        $this->color=htmlspecialchars(strip_tags($this->color));

        $stmt->bindParam(":course_id", $this->course_id);
        $stmt->bindParam(":teacher_id", $this->teacher_id);
        $stmt->bindParam(":room_id", $this->room_id);
        $stmt->bindParam(":level_id", $this->level_id);
        $stmt->bindParam(":specialization_id", $this->specialization_id);
        $stmt->bindParam(":day_of_week", $this->day_of_week);
        $stmt->bindParam(":start_time", $this->start_time);
        $stmt->bindParam(":end_time", $this->end_time);
        $stmt->bindParam(":type", $this->type);
        $stmt->bindParam(":color", $this->color);

        if($stmt->execute()){
            $this->id = $this->conn->lastInsertId();
            return true;
        }
        return false;
    }

    // Read all planning schedules
    public function readAll(){
        $query = "SELECT id, course_id, teacher_id, room_id, level_id, specialization_id, day_of_week, start_time, end_time, type, color, created_at FROM " . $this->table_name . " ORDER BY day_of_week, start_time";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single planning schedule
    public function readOne(){
        $query = "SELECT id, course_id, teacher_id, room_id, level_id, specialization_id, day_of_week, start_time, end_time, type, color, created_at FROM " . $this->table_name . " WHERE id = ? LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if($row){
            $this->id = $row['id'];
            $this->course_id = $row['course_id'];
            $this->teacher_id = $row['teacher_id'];
            $this->room_id = $row['room_id'];
            $this->level_id = $row['level_id'];
            $this->specialization_id = $row['specialization_id'];
            $this->day_of_week = $row['day_of_week'];
            $this->start_time = $row['start_time'];
            $this->end_time = $row['end_time'];
            $this->type = $row['type'];
            $this->color = $row['color'];
            $this->created_at = $row['created_at'];
        }
        return $row;
    }

    // Update planning schedule
    public function update(){
        $query = "UPDATE " . $this->table_name . "
                  SET course_id = :course_id,
                      teacher_id = :teacher_id,
                      room_id = :room_id,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      day_of_week = :day_of_week,
                      start_time = :start_time,
                      end_time = :end_time,
                      type = :type,
                      color = :color
                  WHERE id = :id";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->course_id=htmlspecialchars(strip_tags($this->course_id));
        $this->teacher_id=htmlspecialchars(strip_tags($this->teacher_id));
        $this->room_id=htmlspecialchars(strip_tags($this->room_id));
        $this->level_id=htmlspecialchars(strip_tags($this->level_id));
        $this->specialization_id=htmlspecialchars(strip_tags($this->specialization_id));
        $this->day_of_week=htmlspecialchars(strip_tags($this->day_of_week));
        $this->start_time=htmlspecialchars(strip_tags($this->start_time));
        $this->end_time=htmlspecialchars(strip_tags($this->end_time));
        $this->type=htmlspecialchars(strip_tags($this->type));
        $this->color=htmlspecialchars(strip_tags($this->color));

        $stmt->bindParam(":course_id", $this->course_id);
        $stmt->bindParam(":teacher_id", $this->teacher_id);
        $stmt->bindParam(":room_id", $this->room_id);
        $stmt->bindParam(":level_id", $this->level_id);
        $stmt->bindParam(":specialization_id", $this->specialization_id);
        $stmt->bindParam(":day_of_week", $this->day_of_week);
        $stmt->bindParam(":start_time", $this->start_time);
        $stmt->bindParam(":end_time", $this->end_time);
        $stmt->bindParam(":type", $this->type);
        $stmt->bindParam(":color", $this->color);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Delete planning schedule
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
