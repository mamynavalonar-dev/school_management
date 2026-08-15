/**
 * backend-ws/server.js
 * Serveur WebSocket pour la messagerie (réécriture pour stabilité)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Compatibilité : backend-ws/.env garde la priorité s'il existe, puis le
// .env racine complète les variables manquantes. Les variables système ne
// sont jamais écrasées.
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WS_PORT = process.env.WS_PORT || 3001;
const INTERNAL_SECRET = String(process.env.REALTIME_INTERNAL_SECRET || '').trim();
const WS_DEBUG = /^(1|true|yes|on)$/i.test(String(process.env.WS_DEBUG || ''));
const HEARTBEAT_INTERVAL_MS = 30000;
const LAST_SEEN_REFRESH_MS = 60000;
if (INTERNAL_SECRET.length < 32 || /REPLACE|CHANGE[_-]?ME/i.test(INTERNAL_SECRET)) {
  throw new Error('REALTIME_INTERNAL_SECRET doit être remplacé par un secret aléatoire d’au moins 32 caractères.');
}

const debugLog = (...args) => {
  if (WS_DEBUG) console.log(...args);
};

const DB_SSL_CA = String(process.env.DB_SSL_CA || '').trim();
const DB_SSL_VERIFY = !/^(0|false|no|off)$/i.test(String(process.env.DB_SSL_VERIFY || 'true').trim());
let dbSsl;
if (DB_SSL_CA) {
  if (!fs.existsSync(DB_SSL_CA)) throw new Error(`Certificat CA MySQL introuvable : ${DB_SSL_CA}`);
  dbSsl = { ca: fs.readFileSync(DB_SSL_CA, 'utf8'), rejectUnauthorized: DB_SSL_VERIFY };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'school_management',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  ...(dbSsl ? { ssl: dbSsl } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  // IMPORTANT : force mysql2 à traiter les colonnes DATETIME/TIMESTAMP
  // comme de l'UTC plutôt que comme l'heure locale du process Node.
  // Sans ça, expires_at (écrit en UTC côté PHP via gmdate()) se fait
  // réinterpréter avec le fuseau local du serveur Node, ce qui décale
  // artificiellement la comparaison dans consumeTicket() et fait
  // apparaître des tickets tout juste créés comme déjà expirés.
  timezone: 'Z',
});

// Map userId -> Set de WebSocket
const connectionsByUser = new Map();

function addConnection(userId, ws) {
  const wasOffline = !connectionsByUser.has(userId);
  if (!connectionsByUser.has(userId)) {
    connectionsByUser.set(userId, new Set());
  }
  connectionsByUser.get(userId).add(ws);
  return wasOffline;
}

function removeConnection(userId, ws) {
  const set = connectionsByUser.get(userId);
  if (!set || !set.delete(ws)) return false;
  if (set.size > 0) return false;
  connectionsByUser.delete(userId);
  return true;
}

function sendToUser(userId, payload) {
  const set = connectionsByUser.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const sockets of connectionsByUser.values()) {
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    }
  }
}

async function touchUser(userId) {
  await pool.execute(
    "UPDATE users SET last_seen_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'active' AND deleted_at IS NULL",
    [userId]
  );
}

async function touchOnlineUsers() {
  const userIds = [...connectionsByUser.keys()];
  if (userIds.length === 0) return;
  const placeholders = userIds.map(() => '?').join(',');

  const [activeRows] = await pool.execute(
    `SELECT id FROM users
     WHERE id IN (${placeholders}) AND status = 'active' AND deleted_at IS NULL`,
    userIds
  );
  const activeIds = new Set(activeRows.map((row) => Number(row.id)));
  for (const userId of userIds) {
    if (activeIds.has(Number(userId))) continue;
    for (const socket of connectionsByUser.get(userId) || []) {
      socket.close(4004, 'Compte inactif ou supprimé');
    }
  }

  if (activeIds.size === 0) return;
  const onlineIds = [...activeIds];
  const activePlaceholders = onlineIds.map(() => '?').join(',');
  await pool.execute(
    `UPDATE users SET last_seen_at = UTC_TIMESTAMP() WHERE id IN (${activePlaceholders})`,
    onlineIds
  );
}

async function getPresenceSnapshot() {
  const [rows] = await pool.execute(
    "SELECT id AS user_id, last_seen_at FROM users WHERE status = 'active' AND deleted_at IS NULL"
  );
  return rows.map((row) => ({
    user_id: Number(row.user_id),
    is_online: connectionsByUser.has(Number(row.user_id)),
    last_seen_at: row.last_seen_at,
  }));
}

async function markUserOffline(userId) {
  const lastSeenAt = new Date().toISOString();
  try {
    await touchUser(userId);
  } catch (err) {
    console.error('[presence] Impossible d\'enregistrer la déconnexion de userId:', userId, err);
  }
  broadcast({
    type: 'presence_update',
    user_id: Number(userId),
    is_online: false,
    last_seen_at: lastSeenAt,
  });
}

async function handleDisconnect(userId, ws) {
  if (ws.presenceRemoved) return;
  ws.presenceRemoved = true;
  if (removeConnection(userId, ws)) {
    await markUserOffline(userId);
  }
}

async function consumeTicket(ticket) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT ticket_log.user_id
       FROM ws_tickets ticket_log
       INNER JOIN users u ON u.id = ticket_log.user_id
       WHERE ticket_log.ticket = ?
         AND ticket_log.expires_at > UTC_TIMESTAMP()
         AND u.status = 'active'
         AND u.deleted_at IS NULL
       FOR UPDATE`,
      [ticket]
    );
    // Le ticket est supprimé dans la même transaction, valide ou expiré :
    // deux connexions concurrentes ne peuvent donc jamais le consommer.
    await conn.execute('DELETE FROM ws_tickets WHERE ticket = ?', [ticket]);
    await conn.commit();
    return rows.length === 1 ? rows[0].user_id : null;
  } catch (err) {
    try { await conn.rollback(); } catch (rollbackError) {
      console.error('Erreur rollback consumeTicket:', rollbackError);
    }
    console.error('Erreur consumeTicket:', err);
    return null;
  } finally {
    conn.release();
  }
}

async function getConversationParticipants(conversationId) {
  const [rows] = await pool.execute(
    `SELECT cp.user_id
     FROM conversation_participants cp
     INNER JOIN users u ON u.id = cp.user_id
       AND u.status = 'active' AND u.deleted_at IS NULL
     WHERE cp.conversation_id = ?`,
    [conversationId]
  );
  return rows.map(r => r.user_id);
}

async function canRelayCall(conversationId, senderUserId, targetUserId) {
  const [rows] = await pool.execute(
    `SELECT cp.user_id,
            COALESCE(settings.is_blocked, 0) AS is_blocked,
            COALESCE(settings.allow_messages, 1) AS allow_messages
     FROM conversation_participants cp
     INNER JOIN users u ON u.id = cp.user_id AND u.status = 'active' AND u.deleted_at IS NULL
     LEFT JOIN conversation_user_settings settings
       ON settings.conversation_id = cp.conversation_id
      AND settings.user_id = cp.user_id
     WHERE cp.conversation_id = ? AND cp.user_id IN (?, ?)`,
    [conversationId, senderUserId, targetUserId]
  );
  if (rows.length !== 2) return false;
  const sender = rows.find((row) => Number(row.user_id) === Number(senderUserId));
  const target = rows.find((row) => Number(row.user_id) === Number(targetUserId));
  return Boolean(sender && target)
    && Number(sender.is_blocked) === 0
    && Number(target.is_blocked) === 0
    && Number(target.allow_messages) === 1;
}

async function relayCallSignal(senderUserId, payload) {
  const allowedTypes = new Set(['call_offer', 'call_answer', 'call_reject', 'call_end']);
  if (!allowedTypes.has(payload?.type)) return;
  const conversationId = Number(payload.conversation_id);
  const targetUserId = Number(payload.target_user_id);
  if (!Number.isInteger(conversationId) || !Number.isInteger(targetUserId) || targetUserId === Number(senderUserId)) return;

  const participantIds = (await getConversationParticipants(conversationId)).map(Number);
  if (!participantIds.includes(Number(senderUserId)) || !participantIds.includes(targetUserId)) {
    console.warn('[call] Signal rejeté : participants invalides.', { senderUserId, targetUserId, conversationId });
    return;
  }
  if (['call_offer', 'call_answer'].includes(payload.type)
      && !(await canRelayCall(conversationId, Number(senderUserId), targetUserId))) {
    console.warn('[call] Signal rejeté : appels non autorisés dans cette conversation.');
    return;
  }
  const sdp = typeof payload.sdp === 'string' && payload.sdp.length <= 200000 ? payload.sdp : null;
  sendToUser(targetUserId, {
    type: payload.type,
    conversation_id: conversationId,
    from_user_id: Number(senderUserId),
    call_id: String(payload.call_id || '').slice(0, 100),
    call_kind: payload.call_kind === 'video' ? 'video' : 'audio',
    ...(sdp ? { sdp } : {}),
  });
}

async function getMessageWithAttachments(messageId) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.conversation_id, m.sender_id, u.name AS sender_name, m.body, m.created_at
     FROM messages m
     INNER JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [messageId]
  );
  if (rows.length === 0) return null;
  const message = rows[0];
  const [attachments] = await pool.execute(
    'SELECT id, original_name, mime_type, size_bytes FROM message_attachments WHERE message_id = ?',
    [messageId]
  );
  message.attachments = attachments;
  return message;
}

// Serveur HTTP pour l'endpoint /internal/notify
const httpServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/internal/notify') {
    if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
      console.warn('[notify] Requête interne rejetée : authentification invalide.');
      res.writeHead(403);
      res.end();
      return;
    }
    let body = '';
    let bodyTooLarge = false;
    req.on('data', chunk => {
      if (bodyTooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) {
        bodyTooLarge = true;
        res.writeHead(413);
        res.end();
      }
    });
    req.on('end', async () => {
      if (bodyTooLarge) return;
      try {
        const { conversation_id, message_id } = JSON.parse(body);
        debugLog('[notify] Reçu pour conversation_id:', conversation_id, 'message_id:', message_id);
        const message = await getMessageWithAttachments(message_id);
        if (!message) {
          debugLog('[notify] Message introuvable en base pour message_id:', message_id);
          res.writeHead(404);
          res.end();
          return;
        }
        if (Number(message.conversation_id) !== Number(conversation_id)) {
          console.warn('[notify] Conversation incohérente pour le message:', message_id);
          res.writeHead(400);
          res.end();
          return;
        }
        const participantIds = await getConversationParticipants(conversation_id);
        debugLog('[notify] Participants de la conversation:', participantIds, '- connectés actuellement:', participantIds.filter(id => connectionsByUser.has(id)));
        for (const userId of participantIds) {
          sendToUser(userId, { type: 'new_message', conversation_id, message });
        }
        res.writeHead(200);
        res.end('ok');
      } catch (err) {
        console.error('Erreur /internal/notify:', err);
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 256 * 1024 });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const ticket = url.searchParams.get('ticket');
  debugLog('[WS] Nouvelle tentative de connexion.');

  if (!ticket) {
    debugLog('[WS] Fermeture 4001: ticket manquant');
    ws.close(4001, 'Ticket manquant');
    return;
  }

  let userId;
  try {
    userId = await consumeTicket(ticket);
  } catch (err) {
    console.error('[WS] Fermeture 4002 - Erreur validation ticket:', err);
    ws.close(4002, 'Erreur de validation');
    return;
  }

  if (!userId) {
    debugLog('[WS] Fermeture 4003: ticket invalide, expiré, ou déjà consommé');
    ws.close(4003, 'Ticket invalide ou expiré');
    return;
  }

  debugLog('[WS] Ticket validé pour userId:', userId, '- connexion établie');

  // Ajouter la connexion
  ws.isAlive = true;
  ws.presenceRemoved = false;
  const becameOnline = addConnection(userId, ws);
  try {
    await touchUser(userId);
  } catch (err) {
    console.error('[presence] Impossible d\'enregistrer la connexion de userId:', userId, err);
  }
  ws.send(JSON.stringify({ type: 'connected' }));
  if (becameOnline) {
    broadcast({
      type: 'presence_update',
      user_id: Number(userId),
      is_online: true,
      last_seen_at: null,
    });
  }
  try {
    ws.send(JSON.stringify({
      type: 'presence_snapshot',
      users: await getPresenceSnapshot(),
    }));
  } catch (err) {
    console.error('[presence] Impossible d\'envoyer l\'instantané de présence:', err);
  }

  // Événements
  ws.on('message', async (rawMessage) => {
    try {
      const payload = JSON.parse(rawMessage.toString());
      await relayCallSignal(userId, payload);
    } catch (err) {
      console.error('[WS] Signal client invalide pour userId:', userId, err);
    }
  });
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('close', async (code, reason) => {
    debugLog('[WS] Connexion fermée pour userId:', userId, 'code:', code, 'reason:', reason?.toString() || '(aucune)');
    await handleDisconnect(userId, ws);
  });
  ws.on('error', async (err) => {
    console.error('[WS] Erreur WebSocket pour userId:', userId, '-', err);
    await handleDisconnect(userId, ws);
  });
});

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

const lastSeenInterval = setInterval(() => {
  touchOnlineUsers().catch((err) => {
    console.error('[presence] Impossible d\'actualiser last_seen_at:', err);
  });
}, LAST_SEEN_REFRESH_MS);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
  clearInterval(lastSeenInterval);
});

httpServer.listen(WS_PORT, () => {
  console.log(`Serveur WebSocket démarré sur le port ${WS_PORT}`);
});
