<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

require_once __DIR__ . '/config/database.php';

/**
 * Les fichiers copiés depuis Windows peuvent passer de CRLF à LF (ou recevoir
 * un BOM UTF-8) sans que leur SQL change. L'empreinte canonique évite de
 * considérer cette différence purement textuelle comme une migration altérée.
 */
function canonicalMigrationSql(string $sql): string {
    if (strncmp($sql, "\xEF\xBB\xBF", 3) === 0) {
        $sql = substr($sql, 3);
    }
    $sql = str_replace(["\r\n", "\r"], "\n", $sql);
    return rtrim($sql) . "\n";
}

function migrationChecksumVariants(string $sql): array {
    $canonical = canonicalMigrationSql($sql);
    $withoutFinalNewline = rtrim($canonical, "\n");
    $crlf = str_replace("\n", "\r\n", $canonical);
    $variants = [
        $sql,
        $canonical,
        $withoutFinalNewline,
        $crlf,
        rtrim($crlf, "\r\n"),
        "\xEF\xBB\xBF" . $canonical,
        "\xEF\xBB\xBF" . $crlf,
    ];
    return array_values(array_unique(array_map(
        static fn(string $content): string => hash('sha256', $content),
        $variants
    )));
}

function reconcileMigrationChecksum(PDO $db, string $version, string $checksum): void {
    $stmt = $db->prepare(
        'UPDATE schema_migrations SET checksum = :checksum WHERE version = :version'
    );
    $stmt->execute([':version' => $version, ':checksum' => $checksum]);
}

/**
 * La toute première version du correctif de scolarité 007 a circulé avant la
 * stabilisation de son fichier. On n'accepte son ancienne empreinte que si le
 * schéma réellement présent contient chaque objet attendu par la version
 * actuelle. Aucun ALTER TABLE n'est rejoué à l'aveugle.
 */
function missingSchoolOperationsSchema(PDO $db): array {
    $databaseName = (string)$db->query('SELECT DATABASE()')->fetchColumn();
    $required = [
        'academic_years' => ['id', 'name', 'start_date', 'end_date', 'is_active'],
        'academic_terms' => ['id', 'academic_year_id', 'name', 'start_date', 'end_date', 'is_active'],
        'student_groups' => ['id', 'academic_year_id', 'level_id', 'specialization_id', 'name', 'capacity', 'tuition_amount', 'is_active'],
        'students' => ['birth_place', 'photo_url'],
        'teachers' => ['gender', 'nationality', 'profession', 'diploma', 'contract_type', 'contract_start_date', 'contract_end_date', 'photo_url'],
        'enrollments' => ['academic_year_id', 'group_id'],
        'student_guardians' => ['id', 'student_id', 'relationship', 'first_name', 'last_name'],
        'student_fee_accounts' => ['id', 'enrollment_id', 'tuition_amount', 'discount_amount', 'payment_mode', 'status'],
        'student_payments' => ['id', 'fee_account_id', 'amount', 'payment_date', 'payment_method', 'recorded_by'],
        'class_sessions' => ['id', 'academic_year_id', 'group_id', 'session_date', 'lesson_title', 'status', 'created_by'],
        'attendance_records' => ['id', 'session_id', 'student_id', 'status', 'marked_by'],
        'user_profiles' => ['user_id', 'first_name', 'last_name', 'avatar_url'],
    ];

    $tableStmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = :schema_name AND table_name = :table_name'
    );
    $columnStmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = :schema_name AND table_name = :table_name AND column_name = :column_name'
    );
    $missing = [];
    foreach ($required as $table => $columns) {
        $tableStmt->execute([':schema_name' => $databaseName, ':table_name' => $table]);
        if ((int)$tableStmt->fetchColumn() === 0) {
            $missing[] = "table {$table}";
            continue;
        }
        foreach ($columns as $column) {
            $columnStmt->execute([
                ':schema_name' => $databaseName,
                ':table_name' => $table,
                ':column_name' => $column,
            ]);
            if ((int)$columnStmt->fetchColumn() === 0) {
                $missing[] = "colonne {$table}.{$column}";
            }
        }
    }
    return $missing;
}

/**
 * Vérifie la version fonctionnelle complète de la migration 008 avant de
 * réconcilier une empreinte provenant d'un correctif antérieur.
 */
function missingPayrollAndReportCardsSchema(PDO $db): array {
    $databaseName = (string)$db->query('SELECT DATABASE()')->fetchColumn();
    $required = [
        'employee_attendance' => [
            'id', 'teacher_id', 'attendance_date', 'status', 'late_minutes',
            'justification_status', 'justification_note', 'notes', 'recorded_by',
            'created_at', 'updated_at',
        ],
        'payroll_policies' => [
            'id', 'name', 'late_amount_per_minute', 'absence_daily_multiplier',
            'standard_working_days', 'maximum_deduction_percent', 'is_active',
            'created_by', 'created_at', 'updated_at',
        ],
        'payroll_runs' => [
            'id', 'period_month', 'policy_id', 'status', 'created_by',
            'approved_by', 'approved_at', 'paid_at', 'created_at', 'updated_at',
        ],
        'payroll_items' => [
            'id', 'payroll_run_id', 'teacher_id', 'base_salary', 'late_count',
            'late_minutes', 'unjustified_absences', 'late_deduction',
            'absence_deduction', 'manual_deduction', 'bonus_amount', 'net_salary',
            'notes', 'created_at', 'updated_at',
        ],
        'report_cards' => [
            'id', 'student_id', 'academic_year_id', 'term_id', 'appreciation',
            'decision', 'status', 'published_at', 'updated_by', 'created_at',
            'updated_at',
        ],
    ];

    $tableStmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = :schema_name AND table_name = :table_name'
    );
    $columnStmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = :schema_name AND table_name = :table_name AND column_name = :column_name'
    );
    $missing = [];
    foreach ($required as $table => $columns) {
        $tableStmt->execute([':schema_name' => $databaseName, ':table_name' => $table]);
        if ((int)$tableStmt->fetchColumn() === 0) {
            $missing[] = "table {$table}";
            continue;
        }
        foreach ($columns as $column) {
            $columnStmt->execute([
                ':schema_name' => $databaseName,
                ':table_name' => $table,
                ':column_name' => $column,
            ]);
            if ((int)$columnStmt->fetchColumn() === 0) {
                $missing[] = "colonne {$table}.{$column}";
            }
        }
    }
    return $missing;
}

function missingFeaturePermissionsSchema(PDO $db): array {
    $databaseName = (string)$db->query('SELECT DATABASE()')->fetchColumn();
    $requiredColumns = [
        'id', 'user_id', 'feature_key', 'can_view', 'can_manage', 'granted_by',
        'created_at', 'updated_at',
    ];
    $tableStmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = :schema_name AND table_name = :table_name'
    );
    $tableStmt->execute([
        ':schema_name' => $databaseName,
        ':table_name' => 'user_feature_permissions',
    ]);
    if ((int)$tableStmt->fetchColumn() === 0) {
        return ['table user_feature_permissions'];
    }

    $columnStmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = :schema_name AND table_name = :table_name AND column_name = :column_name'
    );
    $missing = [];
    foreach ($requiredColumns as $column) {
        $columnStmt->execute([
            ':schema_name' => $databaseName,
            ':table_name' => 'user_feature_permissions',
            ':column_name' => $column,
        ]);
        if ((int)$columnStmt->fetchColumn() === 0) {
            $missing[] = "colonne user_feature_permissions.{$column}";
        }
    }
    return $missing;
}

/**
 * La migration initiale la plus récente contient déjà ces deux colonnes.
 * La migration 003 reste nécessaire pour les bases historiques, mais elle
 * doit pouvoir être rejouée sans erreur sur une installation neuve.
 */
function missingActivityTimestampsSchema(PDO $db): array {
    $databaseName = (string)$db->query('SELECT DATABASE()')->fetchColumn();
    $columnStmt = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = :schema_name AND table_name = :table_name AND column_name = :column_name'
    );
    $missing = [];
    foreach (['grades', 'absences'] as $table) {
        $columnStmt->execute([
            ':schema_name' => $databaseName,
            ':table_name' => $table,
            ':column_name' => 'created_at',
        ]);
        if ((int)$columnStmt->fetchColumn() === 0) {
            $missing[] = "colonne {$table}.created_at";
        }
    }
    return $missing;
}

try {
    $db = (new Database())->getConnection();
    $db->exec(
        'CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(190) PRIMARY KEY,
            checksum CHAR(64) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )'
    );
    $lockAcquired = (int)$db->query("SELECT GET_LOCK('school_management_migrations', 30)")->fetchColumn();
} catch (Throwable $e) {
    error_log('Migration initialization failure: ' . $e->getMessage());
    fwrite(STDERR, "Impossible d’initialiser les migrations : {$e->getMessage()}\n");
    exit(1);
}
if ($lockAcquired !== 1) {
    fwrite(STDERR, "Impossible d'obtenir le verrou de migration.\n");
    exit(1);
}

try {
    $files = glob(__DIR__ . '/migrations/*.sql') ?: [];
    sort($files, SORT_STRING);
    $applied = $db->query('SELECT version, checksum FROM schema_migrations')
        ->fetchAll(PDO::FETCH_KEY_PAIR);

    // Compatibilité avec un ancien correctif qui avait livré par erreur la
    // migration de scolarité sous le numéro 008 alors que son contenu avait
    // déjà été appliqué et enregistré sous 007. Le fichier peut encore être
    // présent sur certaines installations Windows. Il ne doit surtout pas
    // rejouer les ALTER TABLE (birth_place, photo_url, etc.).
    $legacyAliases = [
        '008_add_school_operations' => '007_add_school_operations',
    ];

    foreach ($files as $file) {
        $version = basename($file, '.sql');
        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException("Impossible de lire la migration {$version}.");
        }
        $checksum = hash('sha256', canonicalMigrationSql($sql));

        if (isset($legacyAliases[$version]) && isset($applied[$legacyAliases[$version]])) {
            if (!isset($applied[$version])) {
                $stmt = $db->prepare(
                    'INSERT INTO schema_migrations (version, checksum) VALUES (:version, :checksum)'
                );
                $stmt->execute([':version' => $version, ':checksum' => $checksum]);
                $applied[$version] = $checksum;
            }
            fwrite(
                STDOUT,
                "[doublon historique ignoré] {$version} -> {$legacyAliases[$version]}\n"
            );
            continue;
        }

        if (isset($applied[$version])) {
            if (!hash_equals($applied[$version], $checksum)) {
                $knownTextVariant = false;
                foreach (migrationChecksumVariants($sql) as $variant) {
                    if (hash_equals($applied[$version], $variant)) {
                        $knownTextVariant = true;
                        break;
                    }
                }

                if ($knownTextVariant) {
                    reconcileMigrationChecksum($db, $version, $checksum);
                    $applied[$version] = $checksum;
                    fwrite(STDOUT, "[empreinte normalisée] {$version} (LF/CRLF/BOM)\n");
                    continue;
                }

                $schemaReconcilers = [
                    '003_add_activity_timestamps' => 'missingActivityTimestampsSchema',
                    '007_add_school_operations' => 'missingSchoolOperationsSchema',
                    '008_add_payroll_and_report_cards' => 'missingPayrollAndReportCardsSchema',
                    '009_add_user_feature_permissions' => 'missingFeaturePermissionsSchema',
                ];
                if (isset($schemaReconcilers[$version])) {
                    $checker = $schemaReconcilers[$version];
                    $missing = $checker($db);
                    if ($missing === []) {
                        reconcileMigrationChecksum($db, $version, $checksum);
                        $applied[$version] = $checksum;
                        fwrite(STDOUT, "[empreinte réconciliée] {$version} (schéma vérifié)\n");
                        continue;
                    }
                    throw new RuntimeException(
                        "La migration {$version} diffère et son schéma est incomplet : " . implode(', ', $missing)
                    );
                }

                throw new RuntimeException("La migration déjà appliquée {$version} a été modifiée.");
            }
            fwrite(STDOUT, "[déjà appliquée] {$version}\n");
            continue;
        }

        fwrite(STDOUT, "[application] {$version}\n");
        $db->exec($sql);
        $stmt = $db->prepare(
            'INSERT INTO schema_migrations (version, checksum) VALUES (:version, :checksum)'
        );
        $stmt->execute([':version' => $version, ':checksum' => $checksum]);
    }

    fwrite(STDOUT, "Schéma à jour.\n");
} catch (Throwable $e) {
    error_log('Migration failure: ' . $e->getMessage());
    fwrite(STDERR, "Échec de la migration : {$e->getMessage()}\n");
    exit(1);
} finally {
    $db->query("SELECT RELEASE_LOCK('school_management_migrations')");
}
?>
