<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

require_once __DIR__ . '/config/database.php';

$options = getopt('', ['name:', 'username::', 'email:', 'password:']);
$name = trim((string)($options['name'] ?? getenv('INITIAL_ADMIN_NAME') ?: ''));
$email = trim((string)($options['email'] ?? getenv('INITIAL_ADMIN_EMAIL') ?: ''));
$username = strtolower(trim((string)($options['username'] ?? getenv('INITIAL_ADMIN_USERNAME') ?: strtok($email, '@'))));
$password = (string)($options['password'] ?? getenv('INITIAL_ADMIN_PASSWORD') ?: '');

if ($name === '' || !preg_match('/^[a-z0-9._-]{3,50}$/', $username) || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12) {
    fwrite(
        STDERR,
        "Usage: php backend/create-admin.php --name=\"Nom\" --email=admin@example.org --password=\"12-caractères-minimum\"\n"
    );
    exit(1);
}

try {
    $db = (new Database())->getConnection();
    $adminCount = (int)$db->query("SELECT COUNT(*) FROM users WHERE role IN ('admin', 'directeur')")
        ->fetchColumn();
    if ($adminCount > 0) {
        fwrite(STDERR, "Un compte administrateur ou directeur existe déjà.\n");
        exit(1);
    }

    $db->beginTransaction();
    $stmt = $db->prepare('
        INSERT INTO users (name, username, email, password, role, status)
        VALUES (:name, :username, :email, :password, \'admin\', \'active\')
    ');
    $stmt->execute([
        ':name' => $name,
        ':username' => $username,
        ':email' => $email,
        ':password' => password_hash($password, PASSWORD_DEFAULT),
    ]);
    $adminId = (int)$db->lastInsertId();

    // Lors d'une installation neuve, la migration de paie est exécutée avant
    // la création du premier administrateur et ne peut donc pas encore créer
    // sa politique par défaut. On la complète ici si le module est installé.
    $policyTable = $db->prepare(
        "SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = 'payroll_policies'"
    );
    $policyTable->execute();
    if ((int)$policyTable->fetchColumn() > 0) {
        $policy = $db->prepare(
            "INSERT INTO payroll_policies
                (name, late_amount_per_minute, absence_daily_multiplier,
                 standard_working_days, maximum_deduction_percent, created_by)
             SELECT 'Politique standard', 0, 1, 22, 30, :admin_id
             WHERE NOT EXISTS (SELECT 1 FROM payroll_policies)"
        );
        $policy->execute([':admin_id' => $adminId]);
    }
    $db->commit();
    fwrite(STDOUT, "Premier administrateur créé.\n");
} catch (Throwable $e) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }
    error_log('Initial admin creation failure: ' . $e->getMessage());
    fwrite(STDERR, "Impossible de créer le premier administrateur : {$e->getMessage()}\n");
    exit(1);
}
?>
