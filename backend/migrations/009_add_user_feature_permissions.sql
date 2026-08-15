CREATE TABLE IF NOT EXISTS user_feature_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    feature_key VARCHAR(60) NOT NULL,
    can_view TINYINT(1) NOT NULL DEFAULT 0,
    can_manage TINYINT(1) NOT NULL DEFAULT 0,
    granted_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_feature_permissions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_feature_permissions_grantor
        FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_user_feature_permission (user_id, feature_key),
    INDEX idx_user_feature_permissions_user (user_id)
);
