-- V7 — gouvernance des sujets d'évaluation, ressources pédagogiques,
-- politique académique, accès financier et purge irréversible des comptes.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS purged_at DATETIME NULL AFTER deleted_by;

ALTER TABLE student_fee_accounts
    ADD COLUMN IF NOT EXISTS registration_fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER enrollment_id;

ALTER TABLE course_resources
    ADD COLUMN IF NOT EXISTS resource_type ENUM('lesson','exercise','other') NOT NULL DEFAULT 'lesson' AFTER title,
    ADD COLUMN IF NOT EXISTS review_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER size_bytes,
    ADD COLUMN IF NOT EXISTS reviewed_by INT NULL AFTER review_status,
    ADD COLUMN IF NOT EXISTS reviewed_at DATETIME NULL AFTER reviewed_by,
    ADD COLUMN IF NOT EXISTS review_note VARCHAR(500) NULL AFTER reviewed_at;

-- Les documents déjà présents avant V7 restent accessibles. Les nouveaux
-- dépôts seront explicitement créés en attente de validation.
UPDATE course_resources SET review_status = 'approved' WHERE review_status = 'pending';

CREATE TABLE IF NOT EXISTS evaluation_subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evaluation_id INT NOT NULL UNIQUE,
    teacher_id INT NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,
    review_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    review_note VARCHAR(500) NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_eval_subject_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
    CONSTRAINT fk_eval_subject_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT fk_eval_subject_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_eval_subject_status (review_status)
);

CREATE TABLE IF NOT EXISTS student_resource_access_overrides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    reason VARCHAR(500) DEFAULT NULL,
    expires_at DATETIME DEFAULT NULL,
    granted_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_resource_override_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_override_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_override_user FOREIGN KEY (granted_by) REFERENCES users(id),
    UNIQUE KEY uniq_student_course_resource_override (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS academic_progress_policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL DEFAULT 'Politique académique principale',
    warning_average_threshold DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    repeat_min_average DECIMAL(5,2) NOT NULL DEFAULT 8.00,
    max_warnings_before_action INT NOT NULL DEFAULT 3,
    max_repeat_count INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT NULL,
    updated_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_academic_policy_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_academic_policy_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_academic_policy_active (is_active)
);

INSERT INTO academic_progress_policies (
    name, warning_average_threshold, repeat_min_average,
    max_warnings_before_action, max_repeat_count, is_active, created_by, updated_by
)
SELECT 'Politique académique principale', 10.00, 8.00, 3, 1, TRUE,
       (SELECT id FROM users WHERE role IN ('directeur','admin') AND status='active' AND deleted_at IS NULL ORDER BY FIELD(role,'directeur','admin'), id LIMIT 1),
       (SELECT id FROM users WHERE role IN ('directeur','admin') AND status='active' AND deleted_at IS NULL ORDER BY FIELD(role,'directeur','admin'), id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM academic_progress_policies);

CREATE TABLE IF NOT EXISTS student_academic_status (
    student_id INT PRIMARY KEY,
    warning_count INT NOT NULL DEFAULT 0,
    repeat_count INT NOT NULL DEFAULT 0,
    account_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_at DATETIME NULL,
    block_reason VARCHAR(500) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_academic_status_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS academic_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    report_card_id INT NULL,
    event_type ENUM('warning','repeat_allowed','suspended','reactivated') NOT NULL,
    overall_average DECIMAL(5,2) NULL,
    message TEXT NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_academic_alert_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_academic_alert_report FOREIGN KEY (report_card_id) REFERENCES report_cards(id) ON DELETE CASCADE,
    CONSTRAINT fk_academic_alert_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_report_academic_event (report_card_id, event_type),
    INDEX idx_academic_alert_student_created (student_id, created_at)
);
