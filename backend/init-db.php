<?php
header("Content-Type: application/json; charset=UTF-8");
require_once 'config/database.php';
$db = (new Database())->getConnection();

try {
    $sql = "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(30) DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rooms (
            id INT AUTO_INCREMENT PRIMARY KEY,
            number VARCHAR(20) NOT NULL,
            name VARCHAR(100) NOT NULL,
            building VARCHAR(50),
            floor INT DEFAULT 1,
            capacity INT DEFAULT 30,
            room_type VARCHAR(50),
            equipment TEXT,
            is_available BOOLEAN DEFAULT TRUE,
            current_usage VARCHAR(100),
            next_booking VARCHAR(100),
            utilization_rate INT DEFAULT 0,
            maintenance_date DATE
        );

        CREATE TABLE IF NOT EXISTS planning_schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id INT,
            course_name VARCHAR(100),
            teacher_id INT,
            teacher_name VARCHAR(100),
            room_id INT,
            room_name VARCHAR(100),
            level VARCHAR(20),
            specialization VARCHAR(50),
            day_of_week INT,
            start_time VARCHAR(10),
            end_time VARCHAR(10),
            type VARCHAR(50),
            color VARCHAR(30)
        );

        CREATE TABLE IF NOT EXISTS evaluations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(100) NOT NULL,
            course_id INT,
            course_name VARCHAR(100),
            course_code VARCHAR(20),
            teacher_id INT,
            teacher_name VARCHAR(100),
            room_id INT,
            room_name VARCHAR(100),
            evaluation_type_name VARCHAR(50),
            evaluation_date DATE,
            evaluation_time VARCHAR(10),
            duration_minutes INT DEFAULT 120,
            level_name VARCHAR(20),
            specialization_name VARCHAR(50),
            status VARCHAR(30) DEFAULT 'upcoming',
            registered_students INT DEFAULT 0,
            completed_grades INT DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS grades (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT,
            student_name VARCHAR(100),
            student_number VARCHAR(50),
            evaluation_id INT,
            evaluation_title VARCHAR(100),
            course_name VARCHAR(100),
            score DECIMAL(5,2),
            max_score INT DEFAULT 20,
            status VARCHAR(30) DEFAULT 'pending',
            grade_date DATE,
            is_absent BOOLEAN DEFAULT FALSE
        );

        CREATE TABLE IF NOT EXISTS absences (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT,
            student_name VARCHAR(100),
            student_number VARCHAR(50),
            date DATE,
            reason VARCHAR(255),
            status VARCHAR(30) DEFAULT 'pending',
            justification TEXT,
            course_name VARCHAR(100)
        );
    ";
    $db->exec($sql);
    echo json_encode(['success' => true, 'message' => "Tables créées avec succès"]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>


