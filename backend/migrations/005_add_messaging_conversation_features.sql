CREATE TABLE IF NOT EXISTS conversation_user_settings (
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    muted_until DATETIME NULL,
    read_receipts_enabled TINYINT(1) NOT NULL DEFAULT 1,
    allow_messages TINYINT(1) NOT NULL DEFAULT 1,
    is_restricted TINYINT(1) NOT NULL DEFAULT 0,
    is_blocked TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT fk_conversation_user_settings_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_user_settings_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_settings (
    conversation_id INT NOT NULL,
    ephemeral_seconds INT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id),
    CONSTRAINT fk_conversation_settings_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_settings_user
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS message_expirations (
    message_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (message_id),
    KEY idx_message_expirations_expires_at (expires_at),
    CONSTRAINT fk_message_expirations_message
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_pins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    message_id INT NOT NULL,
    pinned_by INT NOT NULL,
    pinned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_message_pins_message (message_id),
    KEY idx_message_pins_conversation (conversation_id, pinned_at),
    CONSTRAINT fk_message_pins_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_message_pins_message
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_message_pins_user
        FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    reported_by INT NOT NULL,
    category VARCHAR(50) NOT NULL,
    details TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_conversation_reports_conversation (conversation_id, created_at),
    KEY idx_conversation_reports_reporter (reported_by, created_at),
    CONSTRAINT fk_conversation_reports_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_reports_user
        FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE
);
