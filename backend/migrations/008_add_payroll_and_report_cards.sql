-- Gestion RH de la présence, paie et bulletins scolaires.

CREATE TABLE IF NOT EXISTS employee_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    status ENUM('present', 'late', 'absent', 'excused') NOT NULL DEFAULT 'present',
    late_minutes INT NOT NULL DEFAULT 0,
    justification_status ENUM('none', 'pending', 'valid', 'invalid') NOT NULL DEFAULT 'none',
    justification_note TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    recorded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_employee_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT fk_employee_attendance_user FOREIGN KEY (recorded_by) REFERENCES users(id),
    UNIQUE KEY uniq_teacher_attendance_date (teacher_id, attendance_date),
    INDEX idx_employee_attendance_period (attendance_date, status)
);

CREATE TABLE IF NOT EXISTS payroll_policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    late_amount_per_minute DECIMAL(12,2) NOT NULL DEFAULT 0,
    absence_daily_multiplier DECIMAL(6,3) NOT NULL DEFAULT 1,
    standard_working_days INT NOT NULL DEFAULT 22,
    maximum_deduction_percent DECIMAL(5,2) NOT NULL DEFAULT 30,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payroll_policy_user FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO payroll_policies (
    name, late_amount_per_minute, absence_daily_multiplier,
    standard_working_days, maximum_deduction_percent, created_by
)
SELECT 'Politique standard', 0, 1, 22, 30, u.id
FROM users u
WHERE u.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM payroll_policies)
ORDER BY u.id LIMIT 1;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    period_month DATE NOT NULL,
    policy_id INT NOT NULL,
    status ENUM('draft', 'approved', 'paid', 'cancelled') NOT NULL DEFAULT 'draft',
    created_by INT NOT NULL,
    approved_by INT DEFAULT NULL,
    approved_at DATETIME DEFAULT NULL,
    paid_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payroll_run_policy FOREIGN KEY (policy_id) REFERENCES payroll_policies(id),
    CONSTRAINT fk_payroll_run_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_payroll_run_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_payroll_period (period_month)
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_run_id INT NOT NULL,
    teacher_id INT NOT NULL,
    base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
    late_count INT NOT NULL DEFAULT 0,
    late_minutes INT NOT NULL DEFAULT 0,
    unjustified_absences INT NOT NULL DEFAULT 0,
    late_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    absence_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    manual_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
    bonus_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payroll_item_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    CONSTRAINT fk_payroll_item_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_run_teacher (payroll_run_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS report_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    academic_year_id INT NOT NULL,
    term_id INT NOT NULL,
    appreciation TEXT DEFAULT NULL,
    decision VARCHAR(160) DEFAULT NULL,
    status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    published_at DATETIME DEFAULT NULL,
    updated_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_report_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
    CONSTRAINT fk_report_term FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE,
    CONSTRAINT fk_report_user FOREIGN KEY (updated_by) REFERENCES users(id),
    UNIQUE KEY uniq_student_term_report (student_id, academic_year_id, term_id)
);
