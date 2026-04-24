<?php
class Teacher {
    private $conn;
    private $table_name = "teachers";

    public $id;
    public $teacher_number;
    public $first_name;
    public $last_name;
    public $email;
    public $phone;
    public $birth_date;
    public $address;
    public $city;
    public $postal_code;
    public $hire_date;
    public $department;
    public $title;
    public $specialization;
    public $salary;
    public $status;
    public $created_at;
    public $updated_at;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function read() {
        $query = "SELECT * FROM " . $this->table_name . " ORDER BY last_name, first_name";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    public function read_single() {
        $query = "SELECT * FROM " . $this->table_name . " WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $this->id);
        $stmt->execute();

        if ($stmt->rowCount() > 0) {
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            $this->teacher_number = $row['teacher_number'];
            $this->first_name = $row['first_name'];
            $this->last_name = $row['last_name'];
            $this->email = $row['email'];
            $this->phone = $row['phone'];
            $this->birth_date = $row['birth_date'];
            $this->address = $row['address'];
            $this->city = $row['city'];
            $this->postal_code = $row['postal_code'];
            $this->hire_date = $row['hire_date'];
            $this->department = $row['department'];
            $this->title = $row['title'];
            $this->specialization = $row['specialization'];
            $this->salary = $row['salary'];
            $this->status = $row['status'];
            $this->created_at = $row['created_at'];
            $this->updated_at = $row['updated_at'];

            return $row;
        }
        
        return false;
    }

    public function create() {
        $query = "INSERT INTO " . $this->table_name . "
                  SET teacher_number = :teacher_number,
                      first_name = :first_name,
                      last_name = :last_name,
                      email = :email,
                      phone = :phone,
                      birth_date = :birth_date,
                      address = :address,
                      city = :city,
                      postal_code = :postal_code,
                      hire_date = :hire_date,
                      department = :department,
                      title = :title,
                      specialization = :specialization,
                      salary = :salary,
                      status = :status";

        $stmt = $this->conn->prepare($query);

        if (empty($this->teacher_number)) {
            $this->teacher_number = $this->generateTeacherNumber();
        }

        $stmt->bindParam(':teacher_number', $this->teacher_number);
        $stmt->bindParam(':first_name', $this->first_name);
        $stmt->bindParam(':last_name', $this->last_name);
        $stmt->bindParam(':email', $this->email);
        $stmt->bindParam(':phone', $this->phone);
        $stmt->bindParam(':birth_date', $this->birth_date);
        $stmt->bindParam(':address', $this->address);
        $stmt->bindParam(':city', $this->city);
        $stmt->bindParam(':postal_code', $this->postal_code);
        $stmt->bindParam(':hire_date', $this->hire_date);
        $stmt->bindParam(':department', $this->department);
        $stmt->bindParam(':title', $this->title);
        $stmt->bindParam(':specialization', $this->specialization);
        $stmt->bindParam(':salary', $this->salary);
        $stmt->bindParam(':status', $this->status);

        if ($stmt->execute()) {
            $this->id = $this->conn->lastInsertId();
            return true;
        }

        return false;
    }

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
                      hire_date = :hire_date,
                      department = :department,
                      title = :title,
                      specialization = :specialization,
                      salary = :salary,
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
        $stmt->bindParam(':hire_date', $this->hire_date);
        $stmt->bindParam(':department', $this->department);
        $stmt->bindParam(':title', $this->title);
        $stmt->bindParam(':specialization', $this->specialization);
        $stmt->bindParam(':salary', $this->salary);
        $stmt->bindParam(':status', $this->status);
        $stmt->bindParam(':id', $this->id);

        return $stmt->execute();
    }

    public function delete() {
        $query = "DELETE FROM " . $this->table_name . " WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $this->id);
        return $stmt->execute();
    }

    private function generateTeacherNumber() {
        $year = date('Y');
        $query = "SELECT MAX(CAST(SUBSTRING(teacher_number, -4) AS UNSIGNED)) as max_num 
                  FROM " . $this->table_name . " 
                  WHERE teacher_number LIKE :pattern";
        
        $stmt = $this->conn->prepare($query);
        $pattern = "TEA{$year}%";
        $stmt->bindParam(':pattern', $pattern);
        $stmt->execute();
        
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $next_num = ($row['max_num'] ?? 0) + 1;
        
        return "TEA{$year}" . str_pad($next_num, 4, '0', STR_PAD_LEFT);
    }
}
?>