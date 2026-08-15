CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(30) DEFAULT 'student',
            status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS levels (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            capacity INT DEFAULT 30,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS specializations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            capacity INT DEFAULT 30,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS evaluation_types (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );


        CREATE TABLE IF NOT EXISTS buildings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS room_types (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO buildings (name) VALUES
            ('Bâtiment A'), ('Bâtiment B'), ('Bâtiment C'), ('Bâtiment D')
        ON DUPLICATE KEY UPDATE name = VALUES(name);

        INSERT INTO room_types (name) VALUES
            ('Salle de cours'), ('Laboratoire'), ('Amphithéâtre'),
            ('Salle de conférence'), ('Salle informatique')
        ON DUPLICATE KEY UPDATE name = VALUES(name);

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

        CREATE TABLE IF NOT EXISTS courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(20) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            credits INT DEFAULT 3,
            hours_per_week INT DEFAULT 3,
            course_type VARCHAR(50) DEFAULT 'Theory',
            level_id INT NOT NULL,
            specialization_id INT NOT NULL,
            is_mandatory TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (level_id) REFERENCES levels(id),
            FOREIGN KEY (specialization_id) REFERENCES specializations(id)
        );

        CREATE TABLE IF NOT EXISTS teachers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            teacher_number VARCHAR(20) NOT NULL UNIQUE,
            first_name VARCHAR(50) NOT NULL,
            last_name VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL,
            phone VARCHAR(20),
            birth_date DATE,
            address TEXT,
            city VARCHAR(100),
            postal_code VARCHAR(20),
            hire_date DATE,
            department VARCHAR(100),
            title VARCHAR(100),
            specialization VARCHAR(100),
            salary DECIMAL(10, 2),
            status ENUM('active', 'inactive', 'on_leave') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            student_number VARCHAR(20) NOT NULL UNIQUE,
            first_name VARCHAR(50) NOT NULL,
            last_name VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL,
            phone VARCHAR(20),
            birth_date DATE,
            address TEXT,
            city VARCHAR(100),
            postal_code VARCHAR(20),
            gender ENUM('male', 'female', 'other'),
            nationality VARCHAR(100),
            emergency_contact_name VARCHAR(100),
            emergency_contact_phone VARCHAR(20),
            status ENUM('active', 'inactive', 'graduated') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS enrollments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            level_id INT NOT NULL,
            specialization_id INT NOT NULL,
            academic_year VARCHAR(9) NOT NULL,
            enrollment_date DATE NOT NULL,
            status ENUM('Enrolled', 'Dropped', 'Completed', 'Pending') DEFAULT 'Enrolled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(id),
            FOREIGN KEY (level_id) REFERENCES levels(id),
            FOREIGN KEY (specialization_id) REFERENCES specializations(id)
        );

        CREATE TABLE IF NOT EXISTS planning_schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id INT,
            teacher_id INT,
            room_id INT,
            level_id INT,
            specialization_id INT,
            day_of_week INT,
            start_time TIME,
            end_time TIME,
            type VARCHAR(50),
            color VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id),
            FOREIGN KEY (room_id) REFERENCES rooms(id),
            FOREIGN KEY (level_id) REFERENCES levels(id),
            FOREIGN KEY (specialization_id) REFERENCES specializations(id)
        );

        CREATE TABLE IF NOT EXISTS evaluations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(100) NOT NULL,
            course_id INT,
            teacher_id INT,
            room_id INT,
            evaluation_type_id INT,
            evaluation_date DATE,
            evaluation_time VARCHAR(10),
            duration_minutes INT DEFAULT 120,
            level_id INT,
            specialization_id INT,
            status VARCHAR(30) DEFAULT 'upcoming',
            registered_students INT DEFAULT 0,
            completed_grades INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id),
            FOREIGN KEY (room_id) REFERENCES rooms(id),
            FOREIGN KEY (evaluation_type_id) REFERENCES evaluation_types(id),
            FOREIGN KEY (level_id) REFERENCES levels(id),
            FOREIGN KEY (specialization_id) REFERENCES specializations(id)
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
            is_absent BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            course_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS auth_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            token VARCHAR(64) NOT NULL UNIQUE,
            user_id INT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_token (token),
            INDEX idx_expires (expires_at)
        );

        -- Justificatifs d'absence avec fichier (Task #4)
        CREATE TABLE IF NOT EXISTS absence_justification_files (
            id INT AUTO_INCREMENT PRIMARY KEY,
            absence_id INT NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            stored_name VARCHAR(255) NOT NULL,   -- nom randomisé sur disque, jamais exposé tel quel
            mime_type VARCHAR(100) NOT NULL,
            size_bytes INT NOT NULL,
            uploaded_by INT NOT NULL,             -- users.id (l'étudiant)
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (absence_id) REFERENCES absences(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );

        -- Seuils d'alerte configurables par enseignant (Task #4)
        CREATE TABLE IF NOT EXISTS alert_thresholds (
            id INT AUTO_INCREMENT PRIMARY KEY,
            teacher_id INT NOT NULL,
            course_id INT DEFAULT NULL,           -- NULL = s'applique à tous les cours de l'enseignant
            metric ENUM('average_below', 'absences_above') NOT NULL,
            threshold_value DECIMAL(5,2) NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE KEY uniq_teacher_course_metric (teacher_id, course_id, metric)
        );

        -- Messagerie (Task #4) : conversations à 2+ participants (extensible groupe plus tard)
        CREATE TABLE IF NOT EXISTS conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id INT DEFAULT NULL,           -- rattachement optionnel à un cours
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS conversation_participants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            user_id INT NOT NULL,
            last_read_at TIMESTAMP NULL DEFAULT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY uniq_conv_user (conversation_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_id INT NOT NULL,
            body TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            INDEX idx_conv_created (conversation_id, created_at)
        );

        CREATE TABLE IF NOT EXISTS message_attachments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            stored_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            size_bytes INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
        );

        -- Table de handshake WebSocket : un ticket court (60s) échangé contre le
        -- token Bearer, pour éviter de faire transiter le vrai token long-terme
        -- dans l'URL de connexion WebSocket (qui finit dans des logs serveur).
        CREATE TABLE IF NOT EXISTS ws_tickets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticket VARCHAR(64) NOT NULL UNIQUE,
            user_id INT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_ticket (ticket)
        );

        -- Documents/supports de cours (Task #4 - "resources", partie documents).
        -- Un enseignant depose un fichier rattache a un de SES cours ; tous les
        -- etudiants inscrits (via enrollments/planning_schedules) au niveau et a la
        -- specialisation de ce cours peuvent le consulter.
        CREATE TABLE IF NOT EXISTS course_resources (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id INT NOT NULL,
            teacher_id INT NOT NULL,
            title VARCHAR(150) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            stored_name VARCHAR(255) NOT NULL,   -- nom randomise sur disque, jamais expose tel quel
            mime_type VARCHAR(100) NOT NULL,
            size_bytes INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
            INDEX idx_course (course_id)
        );

        -- Reservations ponctuelles de salles (Task #4 - "resources", partie
        -- materielle). Distinct de planning_schedules (creneaux recurrents
        -- hebdomadaires) : ici, une reservation datee, pour un usage exceptionnel
        -- (reunion, rattrapage, evenement) qui n'entre pas dans le planning fixe.
        CREATE TABLE IF NOT EXISTS room_bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            booked_by INT NOT NULL,          -- users.id
            title VARCHAR(150) NOT NULL,
            booking_date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            status VARCHAR(30) DEFAULT 'confirmed', -- confirmed | cancelled
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_room_date (room_id, booking_date)
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            action ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
            table_name VARCHAR(50) NOT NULL,
            record_id INT NOT NULL,
            changes TEXT,
            ip_address VARCHAR(45),
            user_agent VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
