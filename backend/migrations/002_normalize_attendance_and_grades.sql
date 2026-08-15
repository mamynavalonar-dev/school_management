-- Conserve les lignes impossibles à rattacher ou en double avant de renforcer
-- les contraintes. Ces tables servent de quarantaine et ne sont pas lues par
-- l'application.

CREATE TABLE IF NOT EXISTS grades_migration_rejects LIKE grades;

INSERT IGNORE INTO grades_migration_rejects
SELECT g.*
FROM grades g
LEFT JOIN students s ON s.id = g.student_id
LEFT JOIN evaluations ev ON ev.id = g.evaluation_id
WHERE s.id IS NULL OR ev.id IS NULL;

INSERT IGNORE INTO grades_migration_rejects
SELECT g.*
FROM grades g
INNER JOIN (
    SELECT student_id, evaluation_id, MAX(id) AS keep_id
    FROM grades
    WHERE student_id IS NOT NULL AND evaluation_id IS NOT NULL
    GROUP BY student_id, evaluation_id
    HAVING COUNT(*) > 1
) duplicates
    ON duplicates.student_id = g.student_id
   AND duplicates.evaluation_id = g.evaluation_id
   AND duplicates.keep_id <> g.id;

DELETE g
FROM grades g
LEFT JOIN students s ON s.id = g.student_id
LEFT JOIN evaluations ev ON ev.id = g.evaluation_id
WHERE s.id IS NULL OR ev.id IS NULL;

DELETE g
FROM grades g
INNER JOIN (
    SELECT student_id, evaluation_id, MAX(id) AS keep_id
    FROM grades
    GROUP BY student_id, evaluation_id
    HAVING COUNT(*) > 1
) duplicates
    ON duplicates.student_id = g.student_id
   AND duplicates.evaluation_id = g.evaluation_id
   AND duplicates.keep_id <> g.id;

ALTER TABLE grades
    DROP COLUMN student_name,
    DROP COLUMN student_number,
    DROP COLUMN evaluation_title,
    DROP COLUMN course_name,
    MODIFY student_id INT NOT NULL,
    MODIFY evaluation_id INT NOT NULL,
    ADD CONSTRAINT fk_grades_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_grades_evaluation
        FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
    ADD CONSTRAINT uniq_grade_student_evaluation UNIQUE (student_id, evaluation_id);

ALTER TABLE absences ADD COLUMN course_id INT NULL AFTER student_id;

UPDATE absences a
INNER JOIN courses c ON c.name = a.course_name
SET a.course_id = c.id
WHERE a.course_id IS NULL;

CREATE TABLE IF NOT EXISTS absences_migration_rejects LIKE absences;

INSERT IGNORE INTO absences_migration_rejects
SELECT a.*
FROM absences a
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN courses c ON c.id = a.course_id
WHERE s.id IS NULL OR c.id IS NULL OR a.date IS NULL;

INSERT IGNORE INTO absences_migration_rejects
SELECT a.*
FROM absences a
INNER JOIN (
    SELECT student_id, course_id, date, MAX(id) AS keep_id
    FROM absences
    WHERE student_id IS NOT NULL AND course_id IS NOT NULL AND date IS NOT NULL
    GROUP BY student_id, course_id, date
    HAVING COUNT(*) > 1
) duplicates
    ON duplicates.student_id = a.student_id
   AND duplicates.course_id = a.course_id
   AND duplicates.date = a.date
   AND duplicates.keep_id <> a.id;

DELETE a
FROM absences a
LEFT JOIN students s ON s.id = a.student_id
LEFT JOIN courses c ON c.id = a.course_id
WHERE s.id IS NULL OR c.id IS NULL OR a.date IS NULL;

DELETE a
FROM absences a
INNER JOIN (
    SELECT student_id, course_id, date, MAX(id) AS keep_id
    FROM absences
    GROUP BY student_id, course_id, date
    HAVING COUNT(*) > 1
) duplicates
    ON duplicates.student_id = a.student_id
   AND duplicates.course_id = a.course_id
   AND duplicates.date = a.date
   AND duplicates.keep_id <> a.id;

ALTER TABLE absences
    DROP COLUMN student_name,
    DROP COLUMN student_number,
    DROP COLUMN course_name,
    MODIFY student_id INT NOT NULL,
    MODIFY course_id INT NOT NULL,
    MODIFY date DATE NOT NULL,
    ADD CONSTRAINT fk_absences_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_absences_course
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    ADD CONSTRAINT uniq_absence_student_course_date UNIQUE (student_id, course_id, date);
