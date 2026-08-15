<?php
/**
 * messages.php
 *
 * API REST classique pour la messagerie (persistance, historique, upload de
 * pièces jointes, gestion des conversations). Le serveur Node/WebSocket
 * (backend-ws/server.js) est utilisé UNIQUEMENT pour la diffusion en temps
 * réel des nouveaux messages aux clients déjà connectés — il partage la
 * même base MySQL mais n'est jamais la source de vérité exclusive : tout
 * message est d'abord écrit ici (ou par lui, dans la même table), jamais en
 * mémoire seule.
 *
 * GET  ?action=conversations              -> liste des conversations de l'utilisateur courant
 * POST ?action=conversations               -> créer une conversation (body: participant_ids[], course_id?)
 * GET  ?action=messages&conversation_id=X  -> historique des messages d'une conversation
 * POST ?action=messages&conversation_id=X  -> envoyer un message (multipart si pièce jointe, sinon JSON {body})
 * GET  ?action=conversation_details&conversation_id=X -> préférences et état de la discussion
 * POST ?action=conversation_setting&conversation_id=X -> modifier un réglage persistant
 * GET  ?action=pins&conversation_id=X       -> messages épinglés
 * POST ?action=pin|unpin&conversation_id=X  -> épingler/désépingler un message
 * GET  ?action=attachment&id=X              -> télécharger une pièce jointe après contrôle d'accès
 * POST ?action=report&conversation_id=X     -> signaler une conversation
 * GET  ?action=calls&conversation_id=X      -> journal persistant des appels
 * POST ?action=call_event&conversation_id=X -> démarrer/mettre à jour un appel
 * POST ?action=ws_ticket                   -> génère un ticket court (60s) pour l'authentification WebSocket
 */
require_once '../config/env.php';
require_once '../config/database.php';
require_once '../config/upload_guard.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

header("Content-Type: application/json; charset=UTF-8");

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// URL interne du serveur Node (jamais exposée publiquement : à restreindre
// par firewall/localhost only sur le VPS, ce endpoint n'a pas vocation à
// être appelé depuis l'extérieur).
// IMPORTANT : ces define() doivent être exécutés AVANT le bloc try
// ci-dessous, car sendMessage() -> notifyRealtimeServer() en dépend.
// Contrairement aux déclarations de fonction (hoistées automatiquement
// par PHP), les define() s'exécutent séquentiellement : les placer après
// le bloc try provoquait une Fatal Error "Undefined constant" dès le
// premier message envoyé, empêchant l'écho du JSON de réponse (d'où le
// "Unexpected token '<'" côté frontend, qui recevait du HTML d'erreur
// à la place du JSON attendu).
$configuredRealtimeUrl = trim((string)(getenv('REALTIME_INTERNAL_URL') ?: ''));
$realtimePort = (int)(getenv('WS_PORT') ?: 3001);
define('REALTIME_INTERNAL_URL', $configuredRealtimeUrl !== ''
    ? $configuredRealtimeUrl
    : "http://127.0.0.1:{$realtimePort}/internal/notify");
define('REALTIME_INTERNAL_SECRET', getenv('REALTIME_INTERNAL_SECRET') ?: '');

purgeExpiredMessages($db);

try {
    if ($action === 'conversations' && $method === 'GET') {
        listConversations($db);
    } elseif ($action === 'conversations' && $method === 'POST') {
        createConversation($db, readJsonObject());
    } elseif ($action === 'messages' && $method === 'GET' && isset($_GET['conversation_id'])) {
        listMessages($db, intval($_GET['conversation_id']));
    } elseif ($action === 'messages' && $method === 'POST' && isset($_GET['conversation_id'])) {
        sendMessage($db, intval($_GET['conversation_id']));
    } elseif ($action === 'conversation_details' && $method === 'GET' && isset($_GET['conversation_id'])) {
        getConversationDetails($db, intval($_GET['conversation_id']));
    } elseif ($action === 'conversation_setting' && $method === 'POST' && isset($_GET['conversation_id'])) {
        updateConversationSetting($db, intval($_GET['conversation_id']), readJsonObject());
    } elseif ($action === 'pins' && $method === 'GET' && isset($_GET['conversation_id'])) {
        listPinnedMessages($db, intval($_GET['conversation_id']));
    } elseif ($action === 'pin' && $method === 'POST' && isset($_GET['conversation_id'])) {
        pinMessage($db, intval($_GET['conversation_id']), readJsonObject());
    } elseif ($action === 'unpin' && $method === 'POST' && isset($_GET['conversation_id'])) {
        unpinMessage($db, intval($_GET['conversation_id']), readJsonObject());
    } elseif ($action === 'attachment' && $method === 'GET' && isset($_GET['id'])) {
        downloadMessageAttachment($db, intval($_GET['id']));
    } elseif ($action === 'report' && $method === 'POST' && isset($_GET['conversation_id'])) {
        reportConversation($db, intval($_GET['conversation_id']), readJsonObject());
    } elseif ($action === 'calls' && $method === 'GET' && isset($_GET['conversation_id'])) {
        listConversationCalls($db, intval($_GET['conversation_id']));
    } elseif ($action === 'call_event' && $method === 'POST' && isset($_GET['conversation_id'])) {
        recordConversationCallEvent($db, intval($_GET['conversation_id']), readJsonObject());
    } elseif ($action === 'ws_ticket' && $method === 'POST') {
        issueWsTicket($db);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Requête invalide.']);
    }
} catch (Throwable $e) {
    error_log("Throwable in messages.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}

/**
 * Notifie le serveur Node qu'un nouveau message a été inséré, pour qu'il le
 * relise en base et le pousse aux sockets des participants concernés.
 * On transmet seulement des identifiants, jamais le contenu du message :
 * Node relit la donnée en base pour garantir qu'il diffuse exactement ce
 * qui a été persisté (pas une copie potentiellement désynchronisée).
 */
function notifyRealtimeServer($conversationId, $messageId) {
    if (strlen(REALTIME_INTERNAL_SECRET) < 32) {
        error_log('notifyRealtimeServer: REALTIME_INTERNAL_SECRET absent ou trop court.');
        return;
    }
    $payload = json_encode(['conversation_id' => $conversationId, 'message_id' => $messageId]);

    $ch = curl_init(REALTIME_INTERNAL_URL);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Internal-Secret: ' . REALTIME_INTERNAL_SECRET,
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT_MS, 800); // ne bloque jamais longtemps la réponse HTTP au client
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 300);
    // "Best effort" : le message reste persisté même si cet appel échoue
    // (Node down, etc.) — mais on loggue l'échec pour rester diagnosticable,
    // contrairement à l'ancien @curl_exec() qui masquait tout silencieusement.
    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    if ($result === false || $httpCode !== 200) {
        error_log("notifyRealtimeServer: échec de notification du serveur temps réel pour conversation_id=$conversationId message_id=$messageId - HTTP $httpCode - curl_error: $curlError");
    }
    curl_close($ch);
}

function isParticipant($db, $conversationId, $userId) {
    $stmt = $db->prepare("SELECT 1 FROM conversation_participants WHERE conversation_id = :cid AND user_id = :uid");
    $stmt->bindParam(':cid', $conversationId, PDO::PARAM_INT);
    $stmt->bindParam(':uid', $userId);
    $stmt->execute();
    return $stmt->fetchColumn() !== false;
}

/**
 * Les messages éphémères ne doivent pas seulement disparaître de l'écran :
 * leurs lignes et leurs pièces jointes physiques sont supprimées par petits
 * lots. Le nettoyage est opportuniste afin de ne nécessiter aucun cron sur
 * une installation locale Windows.
 */
function purgeExpiredMessages($db) {
    try {
        $stmt = $db->query("
            SELECT expiration.message_id, attachment.stored_name
            FROM message_expirations expiration
            LEFT JOIN message_attachments attachment
              ON attachment.message_id = expiration.message_id
            WHERE expiration.expires_at <= UTC_TIMESTAMP()
            ORDER BY expiration.expires_at ASC
            LIMIT 200
        ");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($rows === []) return;

        $messageIds = array_values(array_unique(array_map(
            static fn($row) => (int)$row['message_id'],
            $rows
        )));
        $placeholders = implode(',', array_fill(0, count($messageIds), '?'));

        $db->beginTransaction();
        $delete = $db->prepare("DELETE FROM messages WHERE id IN ({$placeholders})");
        $delete->execute($messageIds);
        $db->commit();

        foreach ($rows as $row) {
            if (empty($row['stored_name'])) continue;
            $path = resolveSecureUploadPath('messages', $row['stored_name']);
            if ($path && is_file($path)) unlink($path);
        }
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('Nettoyage des messages éphémères impossible : ' . $error->getMessage());
    }
}

function readJsonObject(): array {
    $decoded = json_decode(file_get_contents('php://input'), true);
    return is_array($decoded) ? $decoded : [];
}

function listConversations($db) {
    $stmt = $db->prepare("
        SELECT c.id, c.course_id, co.name AS course_name,
               (SELECT m.body FROM messages m LEFT JOIN message_expirations mx ON mx.message_id = m.id WHERE m.conversation_id = c.id AND (mx.expires_at IS NULL OR mx.expires_at > UTC_TIMESTAMP()) ORDER BY m.created_at DESC LIMIT 1) AS last_message,
               (SELECT m.created_at FROM messages m LEFT JOIN message_expirations mx ON mx.message_id = m.id WHERE m.conversation_id = c.id AND (mx.expires_at IS NULL OR mx.expires_at > UTC_TIMESTAMP()) ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
               (SELECT m.sender_id FROM messages m LEFT JOIN message_expirations mx ON mx.message_id = m.id WHERE m.conversation_id = c.id AND (mx.expires_at IS NULL OR mx.expires_at > UTC_TIMESTAMP()) ORDER BY m.created_at DESC LIMIT 1) AS last_sender_id,
               (
                   SELECT COUNT(*)
                   FROM messages unread
                   LEFT JOIN message_expirations unread_expiration ON unread_expiration.message_id = unread.id
                   WHERE unread.conversation_id = c.id
                     AND unread.sender_id != :unread_user_id
                     AND (cp.last_read_at IS NULL OR unread.created_at > cp.last_read_at)
                     AND (unread_expiration.expires_at IS NULL OR unread_expiration.expires_at > UTC_TIMESTAMP())
               ) AS unread_count,
               CASE WHEN cus.muted_until IS NOT NULL AND cus.muted_until > UTC_TIMESTAMP() THEN 1 ELSE 0 END AS is_muted,
               COALESCE(cus.is_restricted, 0) AS is_restricted,
               COALESCE(cus.is_blocked, 0) AS is_blocked
        FROM conversations c
        INNER JOIN conversation_participants cp ON cp.conversation_id = c.id
        LEFT JOIN conversation_user_settings cus ON cus.conversation_id = c.id AND cus.user_id = cp.user_id
        LEFT JOIN courses co ON co.id = c.course_id
        WHERE cp.user_id = :user_id
        ORDER BY last_message_at IS NULL, last_message_at DESC
    ");
    $stmt->bindParam(':unread_user_id', $_SESSION['user_id']);
    $stmt->bindParam(':user_id', $_SESSION['user_id']);
    $stmt->execute();
    $conversations = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Pour chaque conversation, on ajoute la liste des autres participants
    // (nécessaire pour afficher "avec qui" côté front).
    foreach ($conversations as &$conv) {
        $p = $db->prepare("
            SELECT u.id, u.name, u.role, u.last_seen_at
            FROM conversation_participants cp
            INNER JOIN users u ON u.id = cp.user_id
            WHERE cp.conversation_id = :cid AND u.id != :self_id
        ");
        $p->bindParam(':cid', $conv['id'], PDO::PARAM_INT);
        $p->bindParam(':self_id', $_SESSION['user_id']);
        $p->execute();
        $conv['participants'] = $p->fetchAll(PDO::FETCH_ASSOC);
        $conv['unread_count'] = (int)$conv['unread_count'];
        $conv['last_sender_id'] = $conv['last_sender_id'] !== null ? (int)$conv['last_sender_id'] : null;
        $conv['is_muted'] = (bool)$conv['is_muted'];
        $conv['is_restricted'] = (bool)$conv['is_restricted'];
        $conv['is_blocked'] = (bool)$conv['is_blocked'];
    }
    unset($conv);

    echo json_encode(['success' => true, 'data' => $conversations]);
}

function createConversation($db, $input) {
    if (!is_array($input) || empty($input['participant_ids']) || !is_array($input['participant_ids'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'participant_ids requis (tableau).']);
        return;
    }

    // La séparation des devoirs interdit à un étudiant de démarrer une
    // conversation avec n'importe quel autre étudiant au hasard ; on
    // autorise ici : student <-> teacher, teacher <-> teacher,
    // n'importe qui <-> admin/directeur (support). Un étudiant ne peut pas
    // initier une conversation avec un autre étudiant.
    $selfRole = $_SESSION['user_role'];
    $selfId = (int)$_SESSION['user_id'];
    $participantIds = [];
    foreach ($input['participant_ids'] as $rawId) {
        $participantId = filter_var($rawId, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1],
        ]);
        if ($participantId === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'La liste des participants contient un identifiant invalide.']);
            return;
        }
        if ((int)$participantId !== $selfId) {
            $participantIds[] = (int)$participantId;
        }
    }
    $participantIds = array_values(array_unique($participantIds));
    if ($participantIds === []) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Sélectionnez au moins un autre participant.']);
        return;
    }
    if (count($participantIds) > 49) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Une conversation est limitée à 50 participants.']);
        return;
    }

    $placeholders = implode(',', array_fill(0, count($participantIds), '?'));
    $stmt = $db->prepare("SELECT id, role FROM users WHERE id IN ($placeholders) AND status = 'active' AND deleted_at IS NULL");
    $stmt->execute($participantIds);
    $targetUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($targetUsers) !== count($participantIds)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Un participant est introuvable, inactif ou suspendu.']);
        return;
    }

    if ($selfRole === 'student') {
        foreach ($targetUsers as $u) {
            if ($u['role'] === 'student') {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Un étudiant ne peut pas contacter directement un autre étudiant.']);
                return;
            }
        }
    }

    $courseId = null;
    if (array_key_exists('course_id', $input) && $input['course_id'] !== null && $input['course_id'] !== '') {
        $validatedCourseId = filter_var($input['course_id'], FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1],
        ]);
        if ($validatedCourseId === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Cours invalide.']);
            return;
        }
        $courseCheck = $db->prepare('SELECT 1 FROM courses WHERE id = :course_id LIMIT 1');
        $courseCheck->execute([':course_id' => (int)$validatedCourseId]);
        if ($courseCheck->fetchColumn() === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le cours sélectionné est introuvable.']);
            return;
        }
        $courseId = (int)$validatedCourseId;
    }

    // Un clic répété sur le même contact doit rouvrir la discussion directe,
    // pas créer une série de conversations identiques dans la liste.
    if (count($participantIds) === 1) {
        $courseCondition = $courseId === null ? 'c.course_id IS NULL' : 'c.course_id = :course_id';
        $existing = $db->prepare("
            SELECT c.id
            FROM conversations c
            INNER JOIN conversation_participants self_participant
              ON self_participant.conversation_id = c.id AND self_participant.user_id = :self_id
            INNER JOIN conversation_participants target_participant
              ON target_participant.conversation_id = c.id AND target_participant.user_id = :target_id
            WHERE {$courseCondition}
              AND (SELECT COUNT(*) FROM conversation_participants participant_count WHERE participant_count.conversation_id = c.id) = 2
            ORDER BY c.created_at DESC, c.id DESC
            LIMIT 1
        ");
        $existingParams = [':self_id' => $selfId, ':target_id' => $participantIds[0]];
        if ($courseId !== null) $existingParams[':course_id'] = $courseId;
        $existing->execute($existingParams);
        $existingId = $existing->fetchColumn();
        if ($existingId !== false) {
            echo json_encode(['success' => true, 'conversation_id' => (int)$existingId, 'reused' => true]);
            return;
        }
    }

    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO conversations (course_id, created_by) VALUES (:course_id, :created_by)");
        $stmt->bindParam(':course_id', $courseId, $courseId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindParam(':created_by', $_SESSION['user_id']);
        $stmt->execute();
        $conversationId = $db->lastInsertId();

        $allParticipants = array_merge($participantIds, [$selfId]);
        $insertP = $db->prepare("INSERT INTO conversation_participants (conversation_id, user_id) VALUES (:cid, :uid)");
        foreach ($allParticipants as $uid) {
            $insertP->bindParam(':cid', $conversationId, PDO::PARAM_INT);
            $insertP->bindParam(':uid', $uid, PDO::PARAM_INT);
            $insertP->execute();
        }

        $db->commit();
        http_response_code(201);
        echo json_encode(['success' => true, 'conversation_id' => (int)$conversationId]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

function listMessages($db, $conversationId) {
    if (!isParticipant($db, $conversationId, $_SESSION['user_id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Vous ne participez pas à cette conversation.']);
        return;
    }

    $stmt = $db->prepare("
        SELECT m.id, m.sender_id, u.name AS sender_name, m.body, m.created_at,
               expiration.expires_at,
               CASE WHEN pin.message_id IS NULL THEN 0 ELSE 1 END AS is_pinned,
               CASE
                   WHEN m.sender_id = :receipt_user_id AND EXISTS (
                       SELECT 1
                       FROM conversation_participants reader
                       LEFT JOIN conversation_user_settings reader_settings
                         ON reader_settings.conversation_id = reader.conversation_id
                        AND reader_settings.user_id = reader.user_id
                       WHERE reader.conversation_id = m.conversation_id
                         AND reader.user_id != :receipt_other_user_id
                         AND reader.last_read_at >= m.created_at
                         AND COALESCE(reader_settings.read_receipts_enabled, 1) = 1
                   ) THEN 1
                   ELSE 0
               END AS is_read
        FROM messages m
        INNER JOIN users u ON u.id = m.sender_id
        LEFT JOIN message_expirations expiration ON expiration.message_id = m.id
        LEFT JOIN message_pins pin ON pin.message_id = m.id
        WHERE m.conversation_id = :cid
          AND (expiration.expires_at IS NULL OR expiration.expires_at > UTC_TIMESTAMP())
        ORDER BY m.created_at ASC
    ");
    $stmt->bindParam(':receipt_user_id', $_SESSION['user_id']);
    $stmt->bindParam(':receipt_other_user_id', $_SESSION['user_id']);
    $stmt->bindParam(':cid', $conversationId, PDO::PARAM_INT);
    $stmt->execute();
    $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($messages as &$msg) {
        $a = $db->prepare("SELECT id, original_name, mime_type, size_bytes FROM message_attachments WHERE message_id = :mid");
        $a->bindParam(':mid', $msg['id'], PDO::PARAM_INT);
        $a->execute();
        $msg['attachments'] = $a->fetchAll(PDO::FETCH_ASSOC);
        $msg['is_pinned'] = (bool)$msg['is_pinned'];
        $msg['is_read'] = (bool)$msg['is_read'];
    }
    unset($msg);

    // Marque la conversation comme lue jusqu'à maintenant pour cet utilisateur.
    $update = $db->prepare("UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = :cid AND user_id = :uid");
    $update->bindParam(':cid', $conversationId, PDO::PARAM_INT);
    $update->bindParam(':uid', $_SESSION['user_id']);
    $update->execute();

    echo json_encode(['success' => true, 'data' => $messages]);
}

function sendMessage($db, $conversationId) {
    if (!isParticipant($db, $conversationId, $_SESSION['user_id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Vous ne participez pas à cette conversation.']);
        return;
    }

    $permission = getConversationSendPermission($db, $conversationId, (int)$_SESSION['user_id']);
    if (!$permission['allowed']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => $permission['message']]);
        return;
    }

    // Le corps du message peut arriver soit en JSON (pas de pièce jointe),
    // soit en multipart/form-data (avec un fichier).
    $isMultipart = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false;
    $payload = $isMultipart ? null : json_decode(file_get_contents("php://input"), true);
    $body = $isMultipart ? ($_POST['body'] ?? null) : (is_array($payload) ? ($payload['body'] ?? null) : null);
    if ($body !== null && !is_string($body)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Le texte du message est invalide.']);
        return;
    }
    $body = is_string($body) ? trim($body) : null;
    $hasFile = isset($_FILES['file']) && (int)($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

    if (($body === null || $body === '') && !$hasFile) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Un message doit avoir du texte ou une pièce jointe.']);
        return;
    }
    $bodyLength = function_exists('mb_strlen') ? mb_strlen((string)$body, 'UTF-8') : strlen((string)$body);
    if ($bodyLength > 10000) {
        http_response_code(413);
        echo json_encode(['success' => false, 'message' => 'Le message est trop long (10 000 caractères maximum).']);
        return;
    }

    $uploadedPath = null;
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO messages (conversation_id, sender_id, body) VALUES (:cid, :sender_id, :body)");
        $stmt->bindParam(':cid', $conversationId, PDO::PARAM_INT);
        $stmt->bindParam(':sender_id', $_SESSION['user_id']);
        $stmt->bindParam(':body', $body);
        $stmt->execute();
        $messageId = $db->lastInsertId();

        $ephemeral = $db->prepare("SELECT ephemeral_seconds FROM conversation_settings WHERE conversation_id = :cid");
        $ephemeral->execute([':cid' => $conversationId]);
        $ephemeralSeconds = $ephemeral->fetchColumn();
        if ($ephemeralSeconds !== false && (int)$ephemeralSeconds > 0) {
            $expiresAt = gmdate('Y-m-d H:i:s', time() + (int)$ephemeralSeconds);
            $expiration = $db->prepare("INSERT INTO message_expirations (message_id, expires_at) VALUES (:mid, :expires_at)");
            $expiration->execute([':mid' => $messageId, ':expires_at' => $expiresAt]);
        }

        $attachment = null;
        if ($hasFile) {
            $uploaded = handleSecureUpload($_FILES['file'], 'messages');
            $uploadedPath = $uploaded['path'];
            $stmt = $db->prepare("
                INSERT INTO message_attachments (message_id, original_name, stored_name, mime_type, size_bytes)
                VALUES (:mid, :original_name, :stored_name, :mime_type, :size_bytes)
            ");
            $stmt->bindParam(':mid', $messageId, PDO::PARAM_INT);
            $stmt->bindParam(':original_name', $uploaded['original_name']);
            $stmt->bindParam(':stored_name', $uploaded['stored_name']);
            $stmt->bindParam(':mime_type', $uploaded['mime_type']);
            $stmt->bindParam(':size_bytes', $uploaded['size_bytes'], PDO::PARAM_INT);
            $stmt->execute();
            $attachment = $uploaded;
        }

        $db->commit();

        // Notifie immédiatement le serveur Node/WebSocket pour diffusion en
        // temps réel aux participants connectés. Cet appel est "best effort" :
        // s'il échoue (Node down, réseau...), le message reste quand même
        // persisté en base — un participant qui rafraîchit ou se reconnecte
        // le verra via listMessages(). On ne fait donc JAMAIS dépendre la
        // réussite de l'envoi du message de la disponibilité de Node.
        notifyRealtimeServer($conversationId, (int)$messageId);

        http_response_code(201);
        echo json_encode([
            'success' => true,
            'message_id' => (int)$messageId,
            'attachment' => $attachment ? ['original_name' => $attachment['original_name']] : null,
        ]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($uploadedPath !== null && is_file($uploadedPath)) {
            unlink($uploadedPath);
        }
        throw $e;
    }
}

function getConversationSendPermission($db, $conversationId, $userId) {
    $stmt = $db->prepare("
        SELECT
            COALESCE(self_settings.is_blocked, 0) AS blocked_by_me,
            EXISTS(
                SELECT 1
                FROM conversation_participants other_participant
                INNER JOIN users other_user ON other_user.id = other_participant.user_id
                LEFT JOIN conversation_user_settings other_settings
                  ON other_settings.conversation_id = other_participant.conversation_id
                 AND other_settings.user_id = other_participant.user_id
                WHERE other_participant.conversation_id = :cid_other
                  AND other_participant.user_id != :uid_other
                  AND (
                      other_user.status != 'active'
                      OR other_user.deleted_at IS NOT NULL
                      OR COALESCE(other_settings.is_blocked, 0) = 1
                      OR COALESCE(other_settings.allow_messages, 1) = 0
                  )
            ) AS blocked_by_other
        FROM conversation_participants self_participant
        LEFT JOIN conversation_user_settings self_settings
          ON self_settings.conversation_id = self_participant.conversation_id
         AND self_settings.user_id = self_participant.user_id
        WHERE self_participant.conversation_id = :cid_self AND self_participant.user_id = :uid_self
        LIMIT 1
    ");
    $stmt->execute([
        ':cid_other' => $conversationId,
        ':uid_other' => $userId,
        ':cid_self' => $conversationId,
        ':uid_self' => $userId,
    ]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['allowed' => false, 'message' => 'Conversation inaccessible.'];
    if ((int)$row['blocked_by_me'] === 1) {
        return ['allowed' => false, 'message' => 'Vous avez bloqué cette conversation. Débloquez-la pour envoyer un message.'];
    }
    if ((int)$row['blocked_by_other'] === 1) {
        return ['allowed' => false, 'message' => 'L’envoi de messages n’est pas autorisé dans cette conversation.'];
    }
    return ['allowed' => true, 'message' => null];
}

function getConversationDetails($db, $conversationId) {
    $userId = (int)$_SESSION['user_id'];
    if (!isParticipant($db, $conversationId, $userId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Vous ne participez pas à cette conversation.']);
        return;
    }

    $stmt = $db->prepare("
        SELECT
            settings.muted_until,
            COALESCE(settings.read_receipts_enabled, 1) AS read_receipts_enabled,
            COALESCE(settings.allow_messages, 1) AS allow_messages,
            COALESCE(settings.is_restricted, 0) AS is_restricted,
            COALESCE(settings.is_blocked, 0) AS is_blocked,
            conversation_settings.ephemeral_seconds,
            (SELECT COUNT(*) FROM conversation_participants participant_count WHERE participant_count.conversation_id = :cid_count) AS participant_count,
            EXISTS(
                SELECT 1
                FROM conversation_participants other_participant
                INNER JOIN conversation_user_settings other_settings
                  ON other_settings.conversation_id = other_participant.conversation_id
                 AND other_settings.user_id = other_participant.user_id
                WHERE other_participant.conversation_id = :cid_block
                  AND other_participant.user_id != :uid_block
                  AND other_settings.is_blocked = 1
            ) AS blocked_by_other,
            EXISTS(
                SELECT 1
                FROM conversation_participants other_participant
                INNER JOIN users other_user ON other_user.id = other_participant.user_id
                LEFT JOIN conversation_user_settings other_settings
                  ON other_settings.conversation_id = other_participant.conversation_id
                 AND other_settings.user_id = other_participant.user_id
                WHERE other_participant.conversation_id = :cid_permission
                  AND other_participant.user_id != :uid_permission
                  AND (
                      other_user.status != 'active'
                      OR other_user.deleted_at IS NOT NULL
                      OR COALESCE(other_settings.allow_messages, 1) = 0
                  )
            ) AS messages_refused_by_other
        FROM conversation_participants participant
        LEFT JOIN conversation_user_settings settings
          ON settings.conversation_id = participant.conversation_id
         AND settings.user_id = participant.user_id
        LEFT JOIN conversation_settings ON conversation_settings.conversation_id = participant.conversation_id
        WHERE participant.conversation_id = :cid AND participant.user_id = :uid
        LIMIT 1
    ");
    $stmt->execute([
        ':cid_count' => $conversationId,
        ':cid_block' => $conversationId,
        ':uid_block' => $userId,
        ':cid_permission' => $conversationId,
        ':uid_permission' => $userId,
        ':cid' => $conversationId,
        ':uid' => $userId,
    ]);
    $details = $stmt->fetch(PDO::FETCH_ASSOC);
    $details['is_muted'] = !empty($details['muted_until']) && strtotime($details['muted_until'] . ' UTC') > time();
    foreach (['read_receipts_enabled', 'allow_messages', 'is_restricted', 'is_blocked', 'blocked_by_other', 'messages_refused_by_other'] as $key) {
        $details[$key] = (bool)$details[$key];
    }
    $details['participant_count'] = (int)$details['participant_count'];
    $details['ephemeral_seconds'] = $details['ephemeral_seconds'] !== null ? (int)$details['ephemeral_seconds'] : null;
    $details['can_send'] = !$details['is_blocked'] && !$details['blocked_by_other'] && !$details['messages_refused_by_other'];

    echo json_encode(['success' => true, 'data' => $details]);
}

function ensureConversationUserSettings($db, $conversationId, $userId) {
    $stmt = $db->prepare("
        INSERT INTO conversation_user_settings (conversation_id, user_id)
        VALUES (:cid, :uid)
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
    ");
    $stmt->execute([':cid' => $conversationId, ':uid' => $userId]);
}

function updateConversationSetting($db, $conversationId, $input) {
    $userId = (int)$_SESSION['user_id'];
    if (!isParticipant($db, $conversationId, $userId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Vous ne participez pas à cette conversation.']);
        return;
    }

    $setting = $input['setting'] ?? '';
    $value = $input['value'] ?? null;

    if ($setting === 'ephemeral_seconds') {
        $seconds = $value === null || $value === '' || (int)$value === 0 ? null : (int)$value;
        if ($seconds !== null && !in_array($seconds, [3600, 86400, 604800], true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Durée de messages éphémères invalide.']);
            return;
        }
        $stmt = $db->prepare("
            INSERT INTO conversation_settings (conversation_id, ephemeral_seconds, updated_by)
            VALUES (:cid, :seconds, :uid)
            ON DUPLICATE KEY UPDATE ephemeral_seconds = VALUES(ephemeral_seconds), updated_by = VALUES(updated_by)
        ");
        $stmt->bindValue(':cid', $conversationId, PDO::PARAM_INT);
        $stmt->bindValue(':seconds', $seconds, $seconds === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->execute();
    } else {
        ensureConversationUserSettings($db, $conversationId, $userId);
        if ($setting === 'mute_duration') {
            $durations = ['off' => null, '1h' => 3600, '8h' => 28800, '1d' => 86400, 'forever' => 2305843000];
            if (!array_key_exists((string)$value, $durations)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Durée de sourdine invalide.']);
                return;
            }
            $mutedUntil = $durations[$value] === null ? null : gmdate('Y-m-d H:i:s', time() + $durations[$value]);
            $stmt = $db->prepare("UPDATE conversation_user_settings SET muted_until = :muted_until WHERE conversation_id = :cid AND user_id = :uid");
            $stmt->bindValue(':muted_until', $mutedUntil, $mutedUntil === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $stmt->bindValue(':cid', $conversationId, PDO::PARAM_INT);
            $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
            $stmt->execute();
        } elseif (in_array($setting, ['read_receipts_enabled', 'allow_messages', 'is_restricted', 'is_blocked'], true)) {
            $boolean = filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
            $allowedColumns = [
                'read_receipts_enabled' => 'read_receipts_enabled',
                'allow_messages' => 'allow_messages',
                'is_restricted' => 'is_restricted',
                'is_blocked' => 'is_blocked',
            ];
            $column = $allowedColumns[$setting];
            $stmt = $db->prepare("UPDATE conversation_user_settings SET {$column} = :value WHERE conversation_id = :cid AND user_id = :uid");
            $stmt->execute([':value' => $boolean, ':cid' => $conversationId, ':uid' => $userId]);
            if (($setting === 'is_restricted' || $setting === 'is_blocked') && $boolean === 1) {
                $mutedUntil = gmdate('Y-m-d H:i:s', time() + 2305843000);
                $mute = $db->prepare("UPDATE conversation_user_settings SET muted_until = :until WHERE conversation_id = :cid AND user_id = :uid");
                $mute->execute([':until' => $mutedUntil, ':cid' => $conversationId, ':uid' => $userId]);
            }
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Réglage inconnu.']);
            return;
        }
    }

    getConversationDetails($db, $conversationId);
}

function listPinnedMessages($db, $conversationId) {
    if (!isParticipant($db, $conversationId, $_SESSION['user_id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Vous ne participez pas à cette conversation.']);
        return;
    }
    $stmt = $db->prepare("
        SELECT m.id, m.sender_id, sender.name AS sender_name, m.body, m.created_at,
               pin.pinned_at, pinned_by.name AS pinned_by_name
        FROM message_pins pin
        INNER JOIN messages m ON m.id = pin.message_id AND m.conversation_id = pin.conversation_id
        INNER JOIN users sender ON sender.id = m.sender_id
        INNER JOIN users pinned_by ON pinned_by.id = pin.pinned_by
        LEFT JOIN message_expirations expiration ON expiration.message_id = m.id
        WHERE pin.conversation_id = :cid
          AND (expiration.expires_at IS NULL OR expiration.expires_at > UTC_TIMESTAMP())
        ORDER BY pin.pinned_at DESC
    ");
    $stmt->execute([':cid' => $conversationId]);
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function pinMessage($db, $conversationId, $input) {
    $messageId = (int)($input['message_id'] ?? 0);
    if (!isParticipant($db, $conversationId, $_SESSION['user_id']) || $messageId <= 0) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Action non autorisée.']);
        return;
    }
    $valid = $db->prepare("
        SELECT 1 FROM messages m
        LEFT JOIN message_expirations expiration ON expiration.message_id = m.id
        WHERE m.id = :mid AND m.conversation_id = :cid
          AND (expiration.expires_at IS NULL OR expiration.expires_at > UTC_TIMESTAMP())
    ");
    $valid->execute([':mid' => $messageId, ':cid' => $conversationId]);
    if (!$valid->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Message introuvable ou expiré.']);
        return;
    }
    $stmt = $db->prepare("
        INSERT INTO message_pins (conversation_id, message_id, pinned_by)
        VALUES (:cid, :mid, :uid)
        ON DUPLICATE KEY UPDATE pinned_by = VALUES(pinned_by), pinned_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([':cid' => $conversationId, ':mid' => $messageId, ':uid' => $_SESSION['user_id']]);
    echo json_encode(['success' => true]);
}

function unpinMessage($db, $conversationId, $input) {
    $messageId = (int)($input['message_id'] ?? 0);
    if (!isParticipant($db, $conversationId, $_SESSION['user_id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Action non autorisée.']);
        return;
    }
    $stmt = $db->prepare("DELETE FROM message_pins WHERE conversation_id = :cid AND message_id = :mid");
    $stmt->execute([':cid' => $conversationId, ':mid' => $messageId]);
    echo json_encode(['success' => true]);
}

function downloadMessageAttachment($db, $attachmentId) {
    $stmt = $db->prepare("
        SELECT attachment.original_name, attachment.stored_name, attachment.mime_type, attachment.size_bytes,
               message.conversation_id
        FROM message_attachments attachment
        INNER JOIN messages message ON message.id = attachment.message_id
        LEFT JOIN message_expirations expiration ON expiration.message_id = message.id
        WHERE attachment.id = :id
          AND (expiration.expires_at IS NULL OR expiration.expires_at > UTC_TIMESTAMP())
    ");
    $stmt->execute([':id' => $attachmentId]);
    $attachment = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$attachment || !isParticipant($db, (int)$attachment['conversation_id'], $_SESSION['user_id'])) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Fichier introuvable.']);
        return;
    }
    $path = resolveSecureUploadPath('messages', $attachment['stored_name']);
    if (!$path || !is_file($path)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Fichier introuvable sur le serveur.']);
        return;
    }
    $safeName = str_replace(["\r", "\n", '"'], ['', '', "'"], basename($attachment['original_name']));
    header_remove('Content-Type');
    header('Content-Type: ' . $attachment['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $safeName . '"; filename*=UTF-8\'\'' . rawurlencode($safeName));
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

function reportConversation($db, $conversationId, $input) {
    if (!isParticipant($db, $conversationId, $_SESSION['user_id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Action non autorisée.']);
        return;
    }
    $allowedCategories = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'];
    $category = $input['category'] ?? 'other';
    $details = trim((string)($input['details'] ?? ''));
    if (!in_array($category, $allowedCategories, true) || mb_strlen($details) > 1500) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Signalement invalide.']);
        return;
    }
    $stmt = $db->prepare("
        INSERT INTO conversation_reports (conversation_id, reported_by, category, details)
        VALUES (:cid, :uid, :category, :details)
    ");
    $stmt->execute([':cid' => $conversationId, ':uid' => $_SESSION['user_id'], ':category' => $category, ':details' => $details ?: null]);
    echo json_encode(['success' => true, 'message' => 'Signalement transmis à l’administration.']);
}

function listConversationCalls($db, $conversationId) {
    $userId = (int)$_SESSION['user_id'];
    if (!isParticipant($db, $conversationId, $userId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Vous ne participez pas à cette conversation.']);
        return;
    }

    // Un onglet fermé brutalement ne peut pas toujours envoyer l'événement
    // final. Sans ce rattrapage, l'historique affiche indéfiniment « appel en
    // cours ». Après deux minutes sans réponse, un appel encore en sonnerie
    // est donc classé comme manqué.
    $stale = $db->prepare("
        UPDATE conversation_calls
        SET status = 'missed', ended_at = COALESCE(ended_at, UTC_TIMESTAMP())
        WHERE conversation_id = :cid
          AND status = 'ringing'
          AND started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)
    ");
    $stale->execute([':cid' => $conversationId]);

    $stmt = $db->prepare("
        SELECT call_log.id, call_log.client_call_id, call_log.conversation_id,
               call_log.caller_id, caller.name AS caller_name,
               call_log.recipient_id, recipient.name AS recipient_name,
               call_log.call_kind, call_log.status, call_log.started_at,
               call_log.answered_at, call_log.ended_at, call_log.duration_seconds
        FROM conversation_calls call_log
        INNER JOIN users caller ON caller.id = call_log.caller_id
        INNER JOIN users recipient ON recipient.id = call_log.recipient_id
        WHERE call_log.conversation_id = :cid
        ORDER BY call_log.started_at ASC, call_log.id ASC
    ");
    $stmt->execute([':cid' => $conversationId]);
    $calls = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($calls as &$call) {
        $call['id'] = (int)$call['id'];
        $call['conversation_id'] = (int)$call['conversation_id'];
        $call['caller_id'] = (int)$call['caller_id'];
        $call['recipient_id'] = (int)$call['recipient_id'];
        $call['duration_seconds'] = (int)$call['duration_seconds'];
        $call['is_outgoing'] = $call['caller_id'] === $userId;
    }
    unset($call);
    echo json_encode(['success' => true, 'data' => $calls]);
}

function recordConversationCallEvent($db, $conversationId, $input) {
    $userId = (int)$_SESSION['user_id'];
    if (!isParticipant($db, $conversationId, $userId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Action non autorisée.']);
        return;
    }

    $event = (string)($input['event'] ?? '');
    $clientCallId = substr(trim((string)($input['client_call_id'] ?? '')), 0, 100);
    if ($clientCallId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Identifiant d’appel manquant.']);
        return;
    }

    if ($event === 'start') {
        $permission = getConversationSendPermission($db, $conversationId, $userId);
        if (!$permission['allowed']) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => $permission['message']]);
            return;
        }
        $recipientId = (int)($input['recipient_id'] ?? 0);
        $callKind = ($input['call_kind'] ?? 'audio') === 'video' ? 'video' : 'audio';
        if ($recipientId <= 0 || $recipientId === $userId || !isParticipant($db, $conversationId, $recipientId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Destinataire d’appel invalide.']);
            return;
        }
        $stmt = $db->prepare("
            INSERT INTO conversation_calls
                (client_call_id, conversation_id, caller_id, recipient_id, call_kind, status, started_at)
            VALUES (:client_id, :cid, :caller, :recipient, :kind, 'ringing', UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        ");
        $stmt->execute([
            ':client_id' => $clientCallId,
            ':cid' => $conversationId,
            ':caller' => $userId,
            ':recipient' => $recipientId,
            ':kind' => $callKind,
        ]);
    } else {
        $allowedEvents = ['answer', 'end', 'missed', 'decline', 'cancel', 'failed'];
        if (!in_array($event, $allowedEvents, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Événement d’appel invalide.']);
            return;
        }
        $lookup = $db->prepare("
            SELECT id, caller_id, recipient_id, status, answered_at
            FROM conversation_calls
            WHERE client_call_id = :client_id AND conversation_id = :cid
            LIMIT 1
        ");
        $lookup->execute([':client_id' => $clientCallId, ':cid' => $conversationId]);
        $call = $lookup->fetch(PDO::FETCH_ASSOC);
        if (!$call || ($userId !== (int)$call['caller_id'] && $userId !== (int)$call['recipient_id'])) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Appel introuvable.']);
            return;
        }

        if ($event === 'answer') {
            $permission = getConversationSendPermission($db, $conversationId, $userId);
            if (!$permission['allowed']) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => $permission['message']]);
                return;
            }
            if ($userId !== (int)$call['recipient_id']) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Seul le destinataire peut accepter cet appel.']);
                return;
            }
            $stmt = $db->prepare("
                UPDATE conversation_calls
                SET status = 'answered', answered_at = COALESCE(answered_at, UTC_TIMESTAMP())
                WHERE id = :id AND status = 'ringing'
            ");
        } else {
            $statusMap = [
                'end' => !empty($call['answered_at']) || $call['status'] === 'answered' ? 'ended' : 'cancelled',
                'missed' => 'missed',
                'decline' => 'declined',
                'cancel' => 'cancelled',
                'failed' => 'failed',
            ];
            $nextStatus = $statusMap[$event];
            $stmt = $db->prepare("
                UPDATE conversation_calls
                SET status = :status,
                    ended_at = COALESCE(ended_at, UTC_TIMESTAMP()),
                    duration_seconds = CASE
                        WHEN answered_at IS NOT NULL THEN GREATEST(0, TIMESTAMPDIFF(SECOND, answered_at, UTC_TIMESTAMP()))
                        ELSE 0
                    END
                WHERE id = :id AND status NOT IN ('ended', 'missed', 'declined', 'cancelled', 'failed')
            ");
            $stmt->bindValue(':status', $nextStatus, PDO::PARAM_STR);
        }
        $stmt->bindValue(':id', (int)$call['id'], PDO::PARAM_INT);
        $stmt->execute();
    }

    $result = $db->prepare("
        SELECT id, client_call_id, conversation_id, caller_id, recipient_id, call_kind,
               status, started_at, answered_at, ended_at, duration_seconds
        FROM conversation_calls
        WHERE client_call_id = :client_id AND conversation_id = :cid
        LIMIT 1
    ");
    $result->execute([':client_id' => $clientCallId, ':cid' => $conversationId]);
    echo json_encode(['success' => true, 'data' => $result->fetch(PDO::FETCH_ASSOC)]);
}

/**
 * Génère un ticket court (60s, usage unique) que le front échange contre
 * une connexion WebSocket authentifiée, plutôt que de faire transiter le
 * token Bearer long-terme dans l'URL wss://.
 */
function issueWsTicket($db) {
    $db->exec('DELETE FROM ws_tickets WHERE expires_at <= UTC_TIMESTAMP()');
    $ticket = bin2hex(random_bytes(32));
    // IMPORTANT : gmdate() force le calcul en UTC, indépendamment du
    // fuseau horaire configuré dans php.ini (date.timezone). MySQL stocke
    // DATETIME sans fuseau, et le serveur Node relit cette valeur avec
    // new Date(...) qui l'interprète en UTC (comportement standard de
    // mysql2 pour les chaînes DATETIME) : écrire en UTC évite ainsi tout
    // décalage entre PHP, MariaDB et le serveur WebSocket.
    $expiresAt = gmdate('Y-m-d H:i:s', time() + 60);

    $stmt = $db->prepare("INSERT INTO ws_tickets (ticket, user_id, expires_at) VALUES (:ticket, :user_id, :expires_at)");
    $stmt->bindParam(':ticket', $ticket);
    $stmt->bindParam(':user_id', $_SESSION['user_id']);
    $stmt->bindParam(':expires_at', $expiresAt);
    $stmt->execute();

    echo json_encode(['success' => true, 'ticket' => $ticket, 'expires_in' => 60]);
}
?>
