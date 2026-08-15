<?php

function featurePermissionKeys(): array {
    return [
        'students', 'teachers', 'courses', 'rooms', 'room-bookings', 'planning',
        'evaluations', 'grades', 'absences', 'school-operations',
        'messaging', 'payroll', 'admin-users', 'admin-references',
    ];
}

function defaultFeaturePermissions(string $role): array {
    $permissions = [];
    foreach (featurePermissionKeys() as $key) {
        $permissions[$key] = ['view' => false, 'manage' => false];
    }

    if ($role === 'admin') {
        foreach ($permissions as $key => $_value) {
            $permissions[$key] = ['view' => true, 'manage' => true];
        }
        return $permissions;
    }

    if ($role === 'directeur') {
        foreach ($permissions as $key => $_value) {
            $permissions[$key] = ['view' => true, 'manage' => true];
        }
        return $permissions;
    }

    $viewable = $role === 'teacher'
        ? ['students', 'teachers', 'courses', 'rooms', 'room-bookings', 'planning', 'evaluations', 'grades', 'absences', 'school-operations', 'messaging']
        : ['courses', 'rooms', 'room-bookings', 'planning', 'evaluations', 'grades', 'absences', 'messaging'];
    $manageable = $role === 'teacher'
        ? ['courses', 'room-bookings', 'evaluations', 'grades', 'absences', 'school-operations', 'messaging']
        : ['messaging'];

    foreach ($viewable as $key) $permissions[$key]['view'] = true;
    foreach ($manageable as $key) $permissions[$key]['manage'] = true;
    return $permissions;
}

function loadFeaturePermissions(PDO $db, int $userId, string $role): array {
    $permissions = defaultFeaturePermissions($role);
    if (in_array($role, ['admin', 'directeur'], true)) return $permissions;

    try {
        $stmt = $db->prepare('SELECT feature_key, can_view, can_manage FROM user_feature_permissions WHERE user_id = :user_id');
        $stmt->execute([':user_id' => $userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = $row['feature_key'];
            if (!array_key_exists($key, $permissions)) continue;
            $permissions[$key] = [
                'view' => (bool)$row['can_view'],
                'manage' => (bool)$row['can_manage'] && (bool)$row['can_view'],
            ];
        }
    } catch (PDOException $error) {
        // Compatibilité pendant le court intervalle entre le déploiement du
        // code et l'exécution de la migration 009.
        error_log('Feature permissions fallback: ' . $error->getMessage());
    }
    return $permissions;
}

/**
 * Applique les restrictions côté serveur. Masquer un menu React ne suffit
 * pas : sans ce contrôle, un utilisateur pourrait appeler directement une
 * URL d'API dont l'accès lui a été retiré.
 */
function enforceFeaturePermission(PDO $db, string $featureKey, bool $manage = false): void {
    if (!in_array($featureKey, featurePermissionKeys(), true)) {
        error_log('Unknown feature permission key: ' . $featureKey);
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Configuration des autorisations invalide.']);
        exit();
    }

    $role = (string)($_SESSION['user_role'] ?? '');
    if (in_array($role, ['admin', 'directeur'], true)) return;

    $permissions = loadFeaturePermissions($db, (int)($_SESSION['user_id'] ?? 0), $role);
    $feature = $permissions[$featureKey] ?? ['view' => false, 'manage' => false];
    $allowed = $manage
        ? (!empty($feature['view']) && !empty($feature['manage']))
        : !empty($feature['view']);
    if ($allowed) return;

    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => $manage
            ? 'Vous ne disposez pas de l’autorisation de modifier cette fonctionnalité.'
            : 'Cette fonctionnalité a été désactivée pour votre compte.',
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

function enforceFeaturePermissionForRequest(PDO $db, string $featureKey): void {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    enforceFeaturePermission($db, $featureKey, !in_array($method, ['GET', 'HEAD'], true));
}

function saveFeaturePermissions(PDO $db, int $userId, string $role, array $input, ?int $grantedBy): void {
    $delete = $db->prepare('DELETE FROM user_feature_permissions WHERE user_id = :user_id');
    $delete->execute([':user_id' => $userId]);
    if (in_array($role, ['admin', 'directeur'], true)) return;

    $defaults = defaultFeaturePermissions($role);
    $insert = $db->prepare(
        'INSERT INTO user_feature_permissions (user_id, feature_key, can_view, can_manage, granted_by)
         VALUES (:user_id, :feature_key, :can_view, :can_manage, :granted_by)'
    );
    foreach (featurePermissionKeys() as $key) {
        $value = is_array($input[$key] ?? null) ? $input[$key] : ($defaults[$key] ?? []);
        $canView = !empty($value['view']);
        $canManage = $canView && !empty($value['manage']);
        $insert->execute([
            ':user_id' => $userId,
            ':feature_key' => $key,
            ':can_view' => $canView ? 1 : 0,
            ':can_manage' => $canManage ? 1 : 0,
            ':granted_by' => $grantedBy,
        ]);
    }
}
?>
