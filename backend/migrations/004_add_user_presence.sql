-- Dernière activité connue pour l'indicateur de présence de la messagerie.
-- La colonne est ajoutée à la fin de la table afin de rester compatible avec
-- les anciennes bases dans lesquelles users.updated_at n'existe pas.

ALTER TABLE users
    ADD COLUMN last_seen_at DATETIME NULL DEFAULT NULL;

CREATE INDEX idx_users_last_seen_at ON users (last_seen_at);
