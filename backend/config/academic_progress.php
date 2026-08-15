<?php

function academicRow(PDO $db, string $sql, array $params = []): ?array {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function getActiveAcademicPolicy(PDO $db): array {
    $row = academicRow($db, 'SELECT * FROM academic_progress_policies WHERE is_active = 1 ORDER BY updated_at DESC, id DESC LIMIT 1');
    return $row ?: [
        'warning_average_threshold' => 10.0,
        'repeat_min_average' => 8.0,
        'max_warnings_before_action' => 3,
        'max_repeat_count' => 1,
    ];
}

function ensureStudentAcademicStatus(PDO $db, int $studentId): array {
    $stmt = $db->prepare('INSERT IGNORE INTO student_academic_status (student_id) VALUES (:student_id)');
    $stmt->execute([':student_id' => $studentId]);
    return academicRow($db, 'SELECT * FROM student_academic_status WHERE student_id = :student_id', [':student_id' => $studentId]) ?: [];
}

function getAcademicSenderUserId(PDO $db): ?int {
    $row = academicRow($db, "SELECT id FROM users WHERE role IN ('directeur','admin') AND status='active' AND deleted_at IS NULL AND purged_at IS NULL ORDER BY FIELD(role,'directeur','admin'), id LIMIT 1");
    return $row ? (int)$row['id'] : null;
}

function academicDirectConversation(PDO $db, int $senderId, int $studentUserId): int {
    $row = academicRow($db, "SELECT c.id
        FROM conversations c
        JOIN conversation_participants cps ON cps.conversation_id=c.id AND cps.user_id=:sender
        JOIN conversation_participants cpt ON cpt.conversation_id=c.id AND cpt.user_id=:student
        WHERE c.course_id IS NULL
          AND (SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id=c.id)=2
        ORDER BY c.id DESC LIMIT 1", [':sender' => $senderId, ':student' => $studentUserId]);
    if ($row) return (int)$row['id'];

    $stmt = $db->prepare('INSERT INTO conversations (course_id, created_by) VALUES (NULL, :created_by)');
    $stmt->execute([':created_by' => $senderId]);
    $conversationId = (int)$db->lastInsertId();
    $participants = $db->prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (:conversation_id, :user_id)');
    $participants->execute([':conversation_id' => $conversationId, ':user_id' => $senderId]);
    $participants->execute([':conversation_id' => $conversationId, ':user_id' => $studentUserId]);
    return $conversationId;
}

function sendAcademicMessage(PDO $db, int $studentId, string $message): void {
    $student = academicRow($db, 'SELECT user_id FROM students WHERE id=:student LIMIT 1', [':student' => $studentId]);
    $senderId = getAcademicSenderUserId($db);
    $studentUserId = (int)($student['user_id'] ?? 0);
    if (!$senderId || !$studentUserId) return;

    $conversationId = academicDirectConversation($db, $senderId, $studentUserId);
    $stmt = $db->prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (:conversation_id, :sender_id, :body)');
    $stmt->execute([':conversation_id' => $conversationId, ':sender_id' => $senderId, ':body' => $message]);
}

function insertAcademicAlert(PDO $db, int $studentId, ?int $reportCardId, string $type, ?float $average, string $message, ?int $createdBy): bool {
    try {
        $stmt = $db->prepare('INSERT INTO academic_alerts (student_id, report_card_id, event_type, overall_average, message, created_by) VALUES (:student_id,:report_card_id,:event_type,:average,:message,:created_by)');
        $stmt->execute([
            ':student_id' => $studentId,
            ':report_card_id' => $reportCardId,
            ':event_type' => $type,
            ':average' => $average,
            ':message' => $message,
            ':created_by' => $createdBy ?: null,
        ]);
        return true;
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') return false;
        throw $error;
    }
}

function suspendStudentAcademicAccount(PDO $db, int $studentId, string $reason): void {
    $student = academicRow($db, 'SELECT user_id FROM students WHERE id=:student LIMIT 1', [':student' => $studentId]);
    $userId = (int)($student['user_id'] ?? 0);
    if (!$userId) return;

    $stmt = $db->prepare("UPDATE users SET status='suspended', updated_at=CURRENT_TIMESTAMP WHERE id=:user_id AND role='student'");
    $stmt->execute([':user_id' => $userId]);
    $db->prepare('DELETE FROM auth_tokens WHERE user_id=:user_id')->execute([':user_id' => $userId]);
    $db->prepare('DELETE FROM ws_tickets WHERE user_id=:user_id')->execute([':user_id' => $userId]);
    $stmt = $db->prepare('UPDATE student_academic_status SET account_blocked=1, blocked_at=NOW(), block_reason=:reason WHERE student_id=:student_id');
    $stmt->execute([':reason' => $reason, ':student_id' => $studentId]);
}

/**
 * Applique la politique académique une seule fois par bulletin publié.
 * La contrainte unique academic_alerts(report_card_id,event_type) évite les
 * doubles avertissements lors d'une republication du même bulletin.
 */
function applyAcademicProgressPolicy(PDO $db, int $studentId, int $reportCardId, ?float $average, int $actorUserId): array {
    if ($average === null) return ['action' => 'none'];
    $policy = getActiveAcademicPolicy($db);
    $warningThreshold = (float)$policy['warning_average_threshold'];
    if ($average >= $warningThreshold) return ['action' => 'none'];

    $existing = academicRow($db, "SELECT id FROM academic_alerts WHERE report_card_id=:report AND event_type='warning' LIMIT 1", [':report' => $reportCardId]);
    if ($existing) return ['action' => 'already_processed'];

    $status = ensureStudentAcademicStatus($db, $studentId);
    $newWarningCount = (int)($status['warning_count'] ?? 0) + 1;
    $warningMessage = sprintf(
        "Avertissement académique : votre moyenne générale publiée est de %.2f/20, inférieure au seuil de %.2f/20 fixé par la direction. Avertissement %d/%d.",
        $average,
        $warningThreshold,
        $newWarningCount,
        max(1, (int)$policy['max_warnings_before_action'])
    );
    if (insertAcademicAlert($db, $studentId, $reportCardId, 'warning', $average, $warningMessage, $actorUserId)) {
        $db->prepare('UPDATE student_academic_status SET warning_count=:count WHERE student_id=:student')->execute([':count' => $newWarningCount, ':student' => $studentId]);
        sendAcademicMessage($db, $studentId, $warningMessage);
    }

    $maxWarnings = max(1, (int)$policy['max_warnings_before_action']);
    if ($newWarningCount < $maxWarnings) return ['action' => 'warning', 'warning_count' => $newWarningCount];

    $status = ensureStudentAcademicStatus($db, $studentId);
    $repeatMin = (float)$policy['repeat_min_average'];
    $maxRepeats = max(0, (int)$policy['max_repeat_count']);
    $repeatCount = (int)($status['repeat_count'] ?? 0);

    if ($average >= $repeatMin && $repeatCount < $maxRepeats) {
        $nextRepeat = $repeatCount + 1;
        $repeatMessage = sprintf(
            "Décision académique : vous êtes autorisé(e) à redoubler. Redoublement %d/%d autorisé par la politique de la direction. Votre compte reste actif.",
            $nextRepeat,
            $maxRepeats
        );
        if (insertAcademicAlert($db, $studentId, $reportCardId, 'repeat_allowed', $average, $repeatMessage, $actorUserId)) {
            $db->prepare('UPDATE student_academic_status SET repeat_count=:repeat_count, warning_count=0, account_blocked=0, blocked_at=NULL, block_reason=NULL WHERE student_id=:student')->execute([':repeat_count' => $nextRepeat, ':student' => $studentId]);
            sendAcademicMessage($db, $studentId, $repeatMessage);
        }
        return ['action' => 'repeat_allowed', 'repeat_count' => $nextRepeat];
    }

    $blockMessage = sprintf(
        "Décision académique : votre compte a été suspendu automatiquement après %d avertissement(s). Moyenne %.2f/20. Seuls un administrateur ou la direction peuvent réactiver le compte.",
        $newWarningCount,
        $average
    );
    if (insertAcademicAlert($db, $studentId, $reportCardId, 'suspended', $average, $blockMessage, $actorUserId)) {
        suspendStudentAcademicAccount($db, $studentId, $blockMessage);
        sendAcademicMessage($db, $studentId, $blockMessage);
    }
    return ['action' => 'suspended'];
}

function reactivateAcademicStudent(PDO $db, int $studentId, int $actorUserId): void {
    $student = academicRow($db, 'SELECT user_id FROM students WHERE id=:student LIMIT 1', [':student' => $studentId]);
    $userId = (int)($student['user_id'] ?? 0);
    if (!$userId) throw new RuntimeException('Compte étudiant introuvable.');
    $db->prepare("UPDATE users SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=:user_id AND role='student' AND deleted_at IS NULL")->execute([':user_id' => $userId]);
    ensureStudentAcademicStatus($db, $studentId);
    $db->prepare('UPDATE student_academic_status SET warning_count=0, account_blocked=0, blocked_at=NULL, block_reason=NULL WHERE student_id=:student')->execute([':student' => $studentId]);
    $message = 'Votre compte étudiant a été réactivé par un administrateur ou la direction. Les avertissements actifs ont été remis à zéro.';
    insertAcademicAlert($db, $studentId, null, 'reactivated', null, $message, $actorUserId);
    sendAcademicMessage($db, $studentId, $message);
}
