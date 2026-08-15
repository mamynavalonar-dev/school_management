-- Compatibilité avec les bases créées par une ancienne version de
-- 001_initial_schema, où users.updated_at n'existait pas encore.
-- La clause IF NOT EXISTS rend cette réparation sûre sur une base récente.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP;
