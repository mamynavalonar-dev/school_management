-- V7.19 — authentification par nom d'utilisateur
-- Les anciennes migrations restent immuables : cette migration fait évoluer
-- les installations existantes ET les installations neuves.

ALTER TABLE users
    ADD COLUMN username VARCHAR(50) NULL AFTER name;

-- Username initial lisible : partie locale de l'adresse e-mail, normalisée.
UPDATE users
SET username = LOWER(
    LEFT(
        REGEXP_REPLACE(SUBSTRING_INDEX(email, '@', 1), '[^A-Za-z0-9._-]+', '_'),
        40
    )
)
WHERE username IS NULL OR username = '';

-- Très petits identifiants : fournir une valeur exploitable.
UPDATE users
SET username = CONCAT('user', id)
WHERE CHAR_LENGTH(username) < 3;

-- Si deux adresses de domaines différents ont la même partie avant @,
-- rendre uniquement ces usernames distincts.
UPDATE users u
INNER JOIN (
    SELECT username
    FROM (
        SELECT username
        FROM users
        GROUP BY username
        HAVING COUNT(*) > 1
    ) duplicate_names
) duplicates ON duplicates.username = u.username
SET u.username = CONCAT(LEFT(u.username, 34), '_', u.id);

ALTER TABLE users
    MODIFY username VARCHAR(50) NOT NULL,
    ADD CONSTRAINT uniq_users_username UNIQUE (username);
