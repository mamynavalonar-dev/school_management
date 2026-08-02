<?php
class Course {
    private $conn;
    private $table_name = "courses";

    public $id;
    public $code;
    public $name;
    public $description;
    public $credits;
    public $hours_per_week;
    public $course_type;
    public $level_id;
    public $specialization_id;
    public $is_mandatory;
    public $created_at;
    public $updated_at;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function read() {
        $query = "SELECT 
                    c.*,
                    l.name as level_name,
                    s.name as specialization_name
                  FROM " . $this->table_name . " c
                  LEFT JOIN levels l ON c.level_id = l.id
                  LEFT JOIN specializations s ON c.specialization_id = s.id
                  ORDER BY c.name";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    public function create() {
        $query = "INSERT INTO " . $this->table_name . "
                  SET code = :code,
                      name = :name,
                      description = :description,
                      credits = :credits,
                      hours_per_week = :hours_per_week,
                      course_type = :course_type,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      is_mandatory = :is_mandatory";

        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(':code', $this->code);
        $stmt->bindParam(':name', $this->name);
        $stmt->bindParam(':description', $this->description);
        $stmt->bindParam(':credits', $this->credits);
        $stmt->bindParam(':hours_per_week', $this->hours_per_week);
        $stmt->bindParam(':course_type', $this->course_type);
        $stmt->bindParam(':level_id', $this->level_id);
        $stmt->bindParam(':specialization_id', $this->specialization_id);
        $stmt->bindParam(':is_mandatory', $this->is_mandatory);

        if ($stmt->execute()) {
            $this->id = $this->conn->lastInsertId();
            return true;
        }

        return false;
    }
}
?>

