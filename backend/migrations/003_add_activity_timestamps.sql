-- Ajoute les dates de création oubliées sur les tables existantes.
-- Les anciennes lignes utilisent leur date métier afin de préserver
-- un ordre chronologique raisonnable dans le tableau de bord.

ALTER TABLE grades
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT NULL AFTER is_absent;

UPDATE grades
SET created_at = COALESCE(
    TIMESTAMP(grade_date, '00:00:00'),
    CURRENT_TIMESTAMP
)
WHERE created_at IS NULL;

ALTER TABLE grades
    MODIFY COLUMN created_at TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP;


ALTER TABLE absences
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT NULL AFTER justification;

UPDATE absences
SET created_at = COALESCE(
    TIMESTAMP(date, '00:00:00'),
    CURRENT_TIMESTAMP
)
WHERE created_at IS NULL;

ALTER TABLE absences
    MODIFY COLUMN created_at TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP;
