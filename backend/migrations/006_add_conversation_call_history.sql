CREATE TABLE IF NOT EXISTS conversation_calls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_call_id VARCHAR(100) NOT NULL,
    conversation_id INT NOT NULL,
    caller_id INT NOT NULL,
    recipient_id INT NOT NULL,
    call_kind ENUM('audio', 'video') NOT NULL DEFAULT 'audio',
    status ENUM('ringing', 'answered', 'ended', 'missed', 'declined', 'cancelled', 'failed') NOT NULL DEFAULT 'ringing',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered_at DATETIME NULL,
    ended_at DATETIME NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_conversation_calls_client_id (client_call_id),
    KEY idx_conversation_calls_timeline (conversation_id, started_at),
    KEY idx_conversation_calls_recipient (recipient_id, status, started_at),
    CONSTRAINT fk_conversation_calls_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_calls_caller
        FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_calls_recipient
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);
