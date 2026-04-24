<?php
class Student {
    private $conn;
    private $table_name = "students";

    // Properties
    public $id;
    public $student_number;
    public $first_name;
    public $last_name;
    public $email;
    public $phone;
    public $birth_date;
    public $address;
    public $city;
    public $postal_code;
    public $gender;
    public $nationality;
    public $emergency_contact_name;
    public $emergency_contact_phone;
    public $status;
    public $created_at;
    public $updated_at;

    public function __construct($db) {
        $this->conn = $db;
    }

    // Read all students with enrollment info
    public function read() {
        $query = "SELECT 
                    s.*, 
                    e.level_id,
                    e.specialization_id,
                    e.academic_year,
                    e.enrollment_date,
                    e.status as enrollment_status,
                    l.name as level_name,
                    sp.name as specialization_name
                  FROM " . $this->table_name . " s
                  LEFT JOIN enrollments e ON s.id = e.student_id 
                  LEFT JOIN levels l ON e.level_id = l.id
                  LEFT JOIN specializations sp ON e.specialization_id = sp.id
                  WHERE e.status = 'Enrolled' OR e.status IS NULL
                  ORDER BY s.last_name, s.first_name";

        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single student
    public function read_single() {
        $query = "SELECT 
                    s.*, 
                    e.level_id,
                    e.specialization_id,
                    e.academic_year,
                    e.enrollment_date,
                    e.status as enrollment_status,
                    l.name as level_name,
                    sp.name as specialization_name
                  FROM " . $this->table_name . " s
                  LEFT JOIN enrollments e ON s.id = e.student_id 
                  LEFT JOIN levels l ON e.level_id = l.id
                  LEFT JOIN specializations sp ON e.specialization_id = sp.id
                  WHERE s.id = :id";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $this->id);
        $stmt->execute();

        if ($stmt->rowCount() > 0) {
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            $this->student_number = $row['student_number'];
            $this->first_name = $row['first_name'];
            $this->last_name = $row['last_name'];
            $this->email = $row['email'];
            $this->phone = $row['phone'];
            $this->birth_date = $row['birth_date'];
            $this->address = $row['address'];
            $this->city = $row['city'];
            $this->postal_code = $row['postal_code'];
            $this->gender = $row['gender'];
            $this->nationality = $row['nationality'];
            $this->emergency_contact_name = $row['emergency_contact_name'];
            $this->emergency_contact_phone = $row['emergency_contact_phone'];
            $this->status = $row['status'];
            $this->created_at = $row['created_at'];
            $this->updated_at = $row['updated_at'];

            return $row;
        }
        
        return false;
    }

    // Create student
    public function create() {
        $query = "INSERT INTO " . $this->table_name . "
                  SET student_number = :student_number,
                      first_name = :first_name,
                      last_name = :last_name,
                      email = :email,
                      phone = :phone,
                      birth_date = :birth_date,
                      address = :address,
                      city = :city,
                      postal_code = :postal_code,
                      gender = :gender,
                      nationality = :nationality,
                      emergency_contact_name = :emergency_contact_name,
                      emergency_contact_phone = :emergency_contact_phone,
                      status = :status";

        $stmt = $this->conn->prepare($query);

        // Generate student number if not provided
        if (empty($this->student_number)) {
            $this->student_number = $this->generateStudentNumber();
        }

        // Bind values
        $stmt->bindParam(':student_number', $this->student_number);
        $stmt->bindParam(':first_name', $this->first_name);
        $stmt->bindParam(':last_name', $this->last_name);
        $stmt->bindParam(':email', $this->email);
        $stmt->bindParam(':phone', $this->phone);
        $stmt->bindParam(':birth_date', $this->birth_date);
        $stmt->bindParam(':address', $this->address);
        $stmt->bindParam(':city', $this->city);
        $stmt->bindParam(':postal_code', $this->postal_code);
        $stmt->bindParam(':gender', $this->gender);
        $stmt->bindParam(':nationality', $this->nationality);
        $stmt->bindParam(':emergency_contact_name', $this->emergency_contact_name);
        $stmt->bindParam(':emergency_contact_phone', $this->emergency_contact_phone);
        $stmt->bindParam(':status', $this->status);

        if ($stmt->execute()) {
            $this->id = $this->conn->lastInsertId();
            return true;
        }

        return false;
    }

    // Update student
    public function update() {
        $query = "UPDATE " . $this->table_name . "
                  SET first_name = :first_name,
                      last_name = :last_name,
                      email = :email,
                      phone = :phone,
                      birth_date = :birth_date,
                      address = :address,
                      city = :city,
                      postal_code = :postal_code,
                      gender = :gender,
                      nationality = :nationality,
                      emergency_contact_name = :emergency_contact_name,
                      emergency_contact_phone = :emergency_contact_phone,
                      status = :status
                  WHERE id = :id";

        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(':first_name', $this->first_name);
        $stmt->bindParam(':last_name', $this->last_name);
        $stmt->bindParam(':email', $this->email);
        $stmt->bindParam(':phone', $this->phone);
        $stmt->bindParam(':birth_date', $this->birth_date);
        $stmt->bindParam(':address', $this->address);
        $stmt->bindParam(':city', $this->city);
        $stmt->bindParam(':postal_code', $this->postal_code);
        $stmt->bindParam(':gender', $this->gender);
        $stmt->bindParam(':nationality', $this->nationality);
        $stmt->bindParam(':emergency_contact_name', $this->emergency_contact_name);
        $stmt->bindParam(':emergency_contact_phone', $this->emergency_contact_phone);
        $stmt->bindParam(':status', $this->status);
        $stmt->bindParam(':id', $this->id);

        return $stmt->execute();
    }

    // Delete student
    public function delete() {
        $query = "DELETE FROM " . $this->table_name . " WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $this->id);
        return $stmt->execute();
    }

    // Generate unique student number
    private function generateStudentNumber() {
        $year = date('Y');
        $query = "SELECT MAX(CAST(SUBSTRING(student_number, -4) AS UNSIGNED)) as max_num 
                  FROM " . $this->table_name . " 
                  WHERE student_number LIKE :pattern";
        
        $stmt = $this->conn->prepare($query);
        $pattern = "STU{$year}%";
        $stmt->bindParam(':pattern', $pattern);
        $stmt->execute();
        
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $next_num = ($row['max_num'] ?? 0) + 1;
        
        return "STU{$year}" . str_pad($next_num, 4, '0', STR_PAD_LEFT);
    }

    // Check enrollment capacity
    public function checkEnrollmentCapacity($level_id, $specialization_id) {
        $query = "SELECT 
                    l.capacity as level_capacity,
                    s.capacity as specialization_capacity,
                    COUNT(e.id) as current_enrollments
                  FROM levels l
                  CROSS JOIN specializations s
                  LEFT JOIN enrollments e ON e.level_id = l.id 
                                          AND e.specialization_id = s.id 
                                          AND e.status = 'Enrolled'
                  WHERE l.id = :level_id AND s.id = :specialization_id
                  GROUP BY l.id, s.id";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':level_id', $level_id);
        $stmt->bindParam(':specialization_id', $specialization_id);
        $stmt->execute();

        if ($stmt->rowCount() > 0) {
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $max_capacity = min($row['level_capacity'], $row['specialization_capacity']);
            
            return [
                'can_enroll' => $row['current_enrollments'] < $max_capacity,
                'current_enrollments' => (int)$row['current_enrollments'],
                'max_capacity' => $max_capacity
            ];
        }

        return ['can_enroll' => false, 'current_enrollments' => 0, 'max_capacity' => 0];
    }

    // Enroll student
    public function enroll($level_id, $specialization_id, $academic_year) {
        // Check capacity first
        $capacity_check = $this->checkEnrollmentCapacity($level_id, $specialization_id);
        
        if (!$capacity_check['can_enroll']) {
            return ['success' => false, 'message' => 'Capacity exceeded'];
        }

        $query = "INSERT INTO enrollments 
                  SET student_id = :student_id,
                      level_id = :level_id,
                      specialization_id = :specialization_id,
                      academic_year = :academic_year,
                      enrollment_date = CURDATE(),
                      status = 'Enrolled'";

        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':student_id', $this->id);
        $stmt->bindParam(':level_id', $level_id);
        $stmt->bindParam(':specialization_id', $specialization_id);
        $stmt->bindParam(':academic_year', $academic_year);

        if ($stmt->execute()) {
            return ['success' => true, 'message' => 'Student enrolled successfully'];
        }

        return ['success' => false, 'message' => 'Enrollment failed'];
    }
}
?>