// src/components/Messaging/ChatManager.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Edit } from 'lucide-react';
import { getConversations, createConversation, requestWsTicket } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import NewMessagePanel from './NewMessagePanel';
import ChatWindow from './ChatWindow';
import ChatBubble from './ChatBubble';
import { playMessageSound } from '../../utils/messageSound';
import { getWebSocketUrl } from '../../utils/websocket';
import './Messaging.css';

const RECONNECT_DELAY_MS = 3000;

const titleForConversation = (conversation, currentUserId) => {
  const others = (conversation.participants || []).filter((p) => Number(p.id) !== Number(currentUserId));
  return others.map((p) => p.name).join(', ') || 'Conversation';
};

const presenceForConversation = (conversation, currentUserId, presenceByUser) => {
  const others = (conversation.participants || [])
    .filter((participant) => Number(participant.id) !== Number(currentUserId));

  const states = others.map((participant) => {
    const realtime = presenceByUser[Number(participant.id)] || {};
    return {
      isOnline: Boolean(realtime.isOnline),
      lastSeenAt: realtime.lastSeenAt ?? participant.last_seen_at ?? null,
    };
  });

  if (states.some((state) => state.isOnline)) {
    return { isOnline: true, lastSeenAt: null };
  }

  const lastSeenAt = states
    .map((state) => state.lastSeenAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
  return { isOnline: false, lastSeenAt };
};

/**
 * Système de messagerie flottante façon Messenger :
 *  - une bulle "crayon" séparée, toujours visible, ouvre le panneau
 *    "Nouveau message" (recherche + filtre par rôle)
 *  - chaque conversation existe dans l'un de deux états, jamais les
 *    deux à la fois : 'window' (mini-fenêtre ouverte) ou 'bubble'
 *    (réduite, avatar + badge non-lu + aperçu au survol)
 *  - quand un message arrive pour une conversation qui n'est ni en
 *    fenêtre ni en bulle, une fenêtre apparaît automatiquement
 *  - une seule connexion WebSocket est partagée entre toutes les
 *    conversations ; ChatManager la possède et redistribue les
 *    messages entrants par conversation_id
 */
const ChatManager = () => {
  const { user } = useApp();
  const { openMessenger } = useUi();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // Map conversationId -> { conversation, view: 'window' | 'bubble', unread, lastMessagePreview }
  const [entries, setEntries] = useState({});
  const [conversations, setConversations] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isCompactViewport, setIsCompactViewport] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [presenceByUser, setPresenceByUser] = useState({});

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const connectingRef = useRef(false);
  const isClosingIntentionallyRef = useRef(false);
  const conversationsRef = useRef(conversations);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const updateViewport = (event) => setIsCompactViewport(event.matches);
    setIsCompactViewport(media.matches);
    media.addEventListener?.('change', updateViewport);
    return () => media.removeEventListener?.('change', updateViewport);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const list = await getConversations();
      setConversations(list || []);
      setEntries((prev) => {
        const next = { ...prev };
        for (const conversation of list || []) {
          const id = Number(conversation.id);
          if (next[id]) {
            next[id] = { ...next[id], conversation };
          }
        }
        return next;
      });
      return list || [];
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // --- Connexion WebSocket partagée ---
  const connectWebSocket = useCallback(async () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (connectingRef.current) {
      return;
    }
    connectingRef.current = true;
    isClosingIntentionallyRef.current = false;

    setConnectionStatus('connecting');
    let ticket;
    try {
      ticket = await requestWsTicket();
      if (!ticket || typeof ticket !== 'string' || ticket.trim() === '') {
        throw new Error('Invalid WS ticket received');
      }
    } catch (err) {
      console.error('Failed to obtain WS ticket:', err);
      setConnectionStatus('disconnected');
      connectingRef.current = false;
      return;
    }

    const wsUrl = getWebSocketUrl();
    const ws = new WebSocket(`${wsUrl}?ticket=${encodeURIComponent(ticket)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      connectingRef.current = false;
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'presence_snapshot') {
          const snapshot = {};
          for (const item of payload.users || []) {
            snapshot[Number(item.user_id)] = {
              isOnline: Boolean(item.is_online),
              lastSeenAt: item.last_seen_at ?? null,
            };
          }
          setPresenceByUser(snapshot);
        } else if (payload.type === 'presence_update') {
          const presenceUserId = Number(payload.user_id);
          setPresenceByUser((previous) => ({
            ...previous,
            [presenceUserId]: {
              isOnline: Boolean(payload.is_online),
              lastSeenAt: payload.last_seen_at ?? previous[presenceUserId]?.lastSeenAt ?? null,
            },
          }));
        } else if (payload.type === 'new_message') {
          const conversationId = Number(payload.conversation_id);
          const { message } = payload;
          const knownConversation = conversationsRef.current.find((conversation) => Number(conversation.id) === conversationId);
          if (Number(message?.sender_id) !== Number(user?.id) && !knownConversation?.is_muted) {
            playMessageSound({ eventKey: `message-${message?.id || conversationId}` });
          }

          setEntries((prev) => {
            const existing = prev[conversationId];
            const preview = message.body || (message.attachments?.length ? '📎 Pièce jointe' : '');

            if (existing && existing.view === 'window') {
              // Fenêtre déjà ouverte : le message y sera ajouté directement
              // par ChatWindow via incomingMessage, pas de compteur non-lu.
              return {
                ...prev,
                [conversationId]: {
                  ...existing,
                  lastMessagePreview: preview,
                  pendingMessages: [...(existing.pendingMessages || []), message],
                },
              };
            }

            if (existing && existing.view === 'bubble') {
              // Déjà réduite en bulle : elle reste en bulle, on incrémente
              // juste le badge non-lu (l'utilisateur l'a déjà mise de côté
              // volontairement, on ne la rouvre pas de force en fenêtre).
              return {
                ...prev,
                [conversationId]: {
                  ...existing,
                  unread: existing.unread + 1,
                  lastMessagePreview: preview,
                },
              };
            }

            // Ni fenêtre ni bulle : première apparition de cette
            // conversation pour l'utilisateur pendant cette session ->
            // s'ouvre directement en fenêtre, comme sur Messenger.
            const conversation =
              conversationsRef.current.find((c) => Number(c.id) === conversationId) || {
                id: conversationId,
                participants: [],
              };
            const autoOpen = !conversation.is_muted && localStorage.getItem('messenger_auto_open') !== 'false';
            return {
              ...prev,
              [conversationId]: {
                conversation,
                view: autoOpen ? 'window' : 'bubble',
                unread: autoOpen ? 0 : 1,
                lastMessagePreview: preview,
                pendingMessages: [message],
              },
            };
          });

          loadConversations();
          window.dispatchEvent(new CustomEvent('school:messaging-updated'));
        } else if (payload.type === 'call_offer') {
          sessionStorage.setItem('messenger_pending_call', JSON.stringify(payload));
          openMessenger(Number(payload.conversation_id));
        }
      } catch (err) {
        console.error('Invalid WS payload:', err);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      connectingRef.current = false;
      if (!isClosingIntentionallyRef.current) {
        scheduleReconnect();
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConversations, openMessenger, user?.id]);

  const scheduleReconnect = () => {
    if (reconnectTimeoutRef.current) return;
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectWebSocket();
    }, RECONNECT_DELAY_MS);
  };

  // La connexion WS est établie une fois au montage et maintenue tant que
  // l'utilisateur est connecté à l'appli (pas seulement quand une fenêtre
  // de chat est ouverte), pour recevoir les notifications de nouveaux
  // messages même sans conversation ouverte — et faire apparaître les
  // bulles automatiquement.
  useEffect(() => {
    connectWebSocket();
    return () => {
      isClosingIntentionallyRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Transitions d'état par conversation ---
  const openAsWindow = (conversation) => {
    setEntries((prev) => ({
      ...prev,
      [conversation.id]: {
        conversation,
        view: 'window',
        unread: 0,
        lastMessagePreview: prev[conversation.id]?.lastMessagePreview,
        pendingMessages: prev[conversation.id]?.pendingMessages || [],
      },
    }));
  };

  const minimizeToBubble = (conversationId) => {
    setEntries((prev) => {
      const existing = prev[conversationId];
      if (!existing) return prev;
      return { ...prev, [conversationId]: { ...existing, view: 'bubble', unread: 0 } };
    });
  };

  const closeEntirely = (conversationId) => {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  };

  const markRead = (conversationId) => {
    setEntries((prev) => {
      const existing = prev[conversationId];
      if (!existing) return prev;
      return { ...prev, [conversationId]: { ...existing, unread: 0 } };
    });
  };

  const consumeIncomingMessages = useCallback((conversationId, messageIds) => {
    const consumed = new Set(messageIds.map(Number));
    setEntries((prev) => {
      const existing = prev[conversationId];
      if (!existing?.pendingMessages?.length) return prev;
      return {
        ...prev,
        [conversationId]: {
          ...existing,
          pendingMessages: existing.pendingMessages.filter((message) => !consumed.has(Number(message.id))),
        },
      };
    });
  }, []);

  // --- Sélection d'un contact dans le panneau "Nouveau message" ---
  const handleSelectContact = async (contact) => {
    setIsPanelOpen(false);

    // Cherche si une conversation existe déjà avec exactement ce contact
    // (conversation à 2 participants, sans cours associé).
    const existing = conversations.find((c) => {
      const others = (c.participants || []).map((p) => p.id);
      return others.length === 1 && others[0] === contact.id;
    });

    if (existing) {
      openAsWindow(existing);
      return;
    }

    try {
      const res = await createConversation({ participantIds: [contact.id] });
      const newConversation = {
        id: res.conversation_id,
        participants: [{
          id: contact.id,
          name: contact.name,
          role: contact.role,
          last_seen_at: contact.last_seen_at ?? null,
        }],
      };
      setConversations((prev) => [newConversation, ...prev]);
      openAsWindow(newConversation);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const entryList = Object.values(entries);
  const windowEntries = entryList.filter((e) => e.view === 'window');
  const bubbleEntries = entryList.filter((e) => e.view === 'bubble');
  const bubbleStepRem = isCompactViewport ? 5.2 : 7.2;
  const bubbleBaseBottomRem = isCompactViewport ? 4.0 : 3;
  // Mobile : l'espace entre les bulles et le bouton crayon est volontairement
  // compact pour éviter le grand vide observé au-dessus du dock.
  const composeLauncherBottom = bubbleBaseBottomRem + (Math.min(bubbleEntries.length, 5) * bubbleStepRem);

  return (
    <>
      {/* Fenêtres de conversation ouvertes, empilées horizontalement */}
      <div className="floating-chat-window-stack fixed z-40 flex items-end gap-3 overflow-x-auto max-w-[calc(100vw-8rem)] px-2">
        {windowEntries.map(({ conversation, pendingMessages }) => (
          <ChatWindow
            key={conversation.id}
            conversation={conversation}
            currentUserId={user?.id}
            presence={presenceForConversation(conversation, user?.id, presenceByUser)}
            incomingMessages={pendingMessages || []}
            onClose={() => closeEntirely(conversation.id)}
            onMinimize={() => minimizeToBubble(conversation.id)}
            onConversationRead={markRead}
            onIncomingMessagesConsumed={consumeIncomingMessages}
            onOpenFull={() => openMessenger(conversation.id)}
          />
        ))}
      </div>

      {/* Les conversations réduites restent en dessous. La bulle de composition
          est positionnée dynamiquement juste au-dessus de toute cette pile. */}
      <div className="floating-conversation-bubbles fixed z-40 flex flex-col-reverse gap-3 items-end">
        {bubbleEntries.map(({ conversation, unread, lastMessagePreview }) => (
          <ChatBubble
            key={conversation.id}
            title={titleForConversation(conversation, user?.id)}
            avatarId={conversation.id}
            presence={presenceForConversation(conversation, user?.id, presenceByUser)}
            unreadCount={unread}
            lastMessagePreview={lastMessagePreview}
            onOpen={() => openAsWindow(conversation)}
            onClose={() => closeEntirely(conversation.id)}
          />
        ))}
      </div>

      {/* Panneau "Nouveau message" (s'ouvre juste au-dessus de la bulle crayon) */}
      {isPanelOpen && (
        <div className="floating-chat-panel floating-chat-panel-position fixed z-50 rounded-xl shadow-2xl border dark:border-gray-700 overflow-hidden">
          <NewMessagePanel
            onClose={() => setIsPanelOpen(false)}
            onSelectContact={handleSelectContact}
            presenceByUser={presenceByUser}
          />
        </div>
      )}

      {/* Bulle flottante "crayon" — toujours visible, indépendante des conversations */}
      <div
        className="floating-compose-launcher-wrap fixed z-50 group"
        style={{ bottom: `${composeLauncherBottom}rem` }}
      >
        <button
          onClick={() => setIsPanelOpen((v) => !v)}
          className="floating-compose-launcher relative bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-105"
          aria-label="Nouveau message"
        >
          <Edit size={14} strokeWidth={2.05} />
          {connectionStatus === 'connected' && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white dark:border-gray-900 rounded-full" />
          )}
        </button>
        {/* Info-bulle simple au survol, comme pour les bulles de conversation */}
        <div className="absolute bottom-1 right-16 whitespace-nowrap bg-gray-800 text-white text-sm rounded-full px-3 py-1.5 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
          Nouveau message
        </div>
      </div>
    </>
  );
};

export default ChatManager;
