-- Suppression logique des comptes : les dossiers scolaires, historiques de
-- messages, appels et éléments de paie restent cohérents sans conserver un
-- compte capable de se reconnecter.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL AFTER updated_at,
    ADD COLUMN IF NOT EXISTS deleted_by INT DEFAULT NULL AFTER deleted_at;
