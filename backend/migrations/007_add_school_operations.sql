-- Parcours métier de scolarité : années/périodes, groupes, dossiers financiers,
-- appels de présence, émargements et profil utilisateur.

CREATE TABLE IF NOT EXISTS academic_years (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(9) NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_academic_year_active (is_active)
);

INSERT INTO academic_years (name, start_date, end_date, is_active)
SELECT
    CONCAT(
        IF(MONTH(CURDATE()) >= 8, YEAR(CURDATE()), YEAR(CURDATE()) - 1),
        '-',
        IF(MONTH(CURDATE()) >= 8, YEAR(CURDATE()) + 1, YEAR(CURDATE()))
    ),
    STR_TO_DATE(CONCAT(IF(MONTH(CURDATE()) >= 8, YEAR(CURDATE()), YEAR(CURDATE()) - 1), '-08-01'), '%Y-%m-%d'),
    STR_TO_DATE(CONCAT(IF(MONTH(CURDATE()) >= 8, YEAR(CURDATE()) + 1, YEAR(CURDATE())), '-07-31'), '%Y-%m-%d'),
    1
WHERE NOT EXISTS (SELECT 1 FROM academic_years);

CREATE TABLE IF NOT EXISTS academic_terms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year_id INT NOT NULL,
    name VARCHAR(80) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_terms_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_term_year_name (academic_year_id, name),
    INDEX idx_term_dates (start_date, end_date)
);

CREATE TABLE IF NOT EXISTS student_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year_id INT NOT NULL,
    level_id INT NOT NULL,
    specialization_id INT DEFAULT NULL,
    name VARCHAR(80) NOT NULL,
    capacity INT NOT NULL DEFAULT 30,
    tuition_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_groups_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    CONSTRAINT fk_groups_level FOREIGN KEY (level_id) REFERENCES levels(id),
    CONSTRAINT fk_groups_specialization FOREIGN KEY (specialization_id) REFERENCES specializations(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_group_year_level_name (academic_year_id, level_id, name)
);

ALTER TABLE students
    ADD COLUMN birth_place VARCHAR(120) DEFAULT NULL AFTER birth_date,
    ADD COLUMN photo_url VARCHAR(500) DEFAULT NULL AFTER emergency_contact_phone;

ALTER TABLE teachers
    ADD COLUMN gender VARCHAR(20) DEFAULT NULL AFTER birth_date,
    ADD COLUMN nationality VARCHAR(100) DEFAULT NULL AFTER postal_code,
    ADD COLUMN profession VARCHAR(120) DEFAULT NULL AFTER nationality,
    ADD COLUMN diploma VARCHAR(120) DEFAULT NULL AFTER profession,
    ADD COLUMN contract_type VARCHAR(50) DEFAULT NULL AFTER salary,
    ADD COLUMN contract_start_date DATE DEFAULT NULL AFTER contract_type,
    ADD COLUMN contract_end_date DATE DEFAULT NULL AFTER contract_start_date,
    ADD COLUMN photo_url VARCHAR(500) DEFAULT NULL AFTER contract_end_date;

ALTER TABLE enrollments
    ADD COLUMN academic_year_id INT DEFAULT NULL AFTER academic_year,
    ADD COLUMN group_id INT DEFAULT NULL AFTER specialization_id,
    ADD CONSTRAINT fk_enrollments_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_enrollments_group FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE SET NULL;

UPDATE enrollments e
INNER JOIN academic_years ay ON ay.name = e.academic_year
SET e.academic_year_id = ay.id
WHERE e.academic_year_id IS NULL;

CREATE TABLE IF NOT EXISTS student_guardians (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL UNIQUE,
    relationship VARCHAR(60) DEFAULT 'Responsable financier',
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    email VARCHAR(150) DEFAULT NULL,
    profession VARCHAR(120) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_guardian_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_fee_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL UNIQUE,
    tuition_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_mode VARCHAR(60) DEFAULT NULL,
    status ENUM('Pending', 'Partial', 'Paid', 'Exempt') NOT NULL DEFAULT 'Pending',
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fee_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fee_account_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(60) NOT NULL,
    reference VARCHAR(100) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_account FOREIGN KEY (fee_account_id) REFERENCES student_fee_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_user FOREIGN KEY (recorded_by) REFERENCES users(id),
    INDEX idx_payment_date (payment_date)
);

CREATE TABLE IF NOT EXISTS class_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year_id INT NOT NULL,
    term_id INT DEFAULT NULL,
    group_id INT NOT NULL,
    course_id INT DEFAULT NULL,
    teacher_id INT DEFAULT NULL,
    session_date DATE NOT NULL,
    start_time TIME DEFAULT NULL,
    end_time TIME DEFAULT NULL,
    session_type VARCHAR(50) NOT NULL DEFAULT 'Cours',
    lesson_title VARCHAR(180) NOT NULL,
    lesson_summary TEXT DEFAULT NULL,
    status ENUM('planned', 'completed', 'cancelled') NOT NULL DEFAULT 'planned',
    teacher_signed_at DATETIME DEFAULT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_session_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    CONSTRAINT fk_session_term FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE SET NULL,
    CONSTRAINT fk_session_group FOREIGN KEY (group_id) REFERENCES student_groups(id),
    CONSTRAINT fk_session_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    CONSTRAINT fk_session_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
    CONSTRAINT fk_session_creator FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_session_date_group (session_date, group_id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    student_id INT NOT NULL,
    status ENUM('present', 'absent', 'late', 'excused') NOT NULL DEFAULT 'present',
    notes VARCHAR(255) DEFAULT NULL,
    marked_by INT NOT NULL,
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_session FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_user FOREIGN KEY (marked_by) REFERENCES users(id),
    UNIQUE KEY uniq_session_student (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INT PRIMARY KEY,
    first_name VARCHAR(80) DEFAULT NULL,
    last_name VARCHAR(80) DEFAULT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    nationality VARCHAR(100) DEFAULT NULL,
    title VARCHAR(120) DEFAULT NULL,
    bio TEXT DEFAULT NULL,
    avatar_url VARCHAR(500) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
