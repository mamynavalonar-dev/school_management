// src/components/Messaging/ChatWindow.jsx
import React, { useState, useEffect, useRef } from 'react';
import { X, Minimize2, Send, Paperclip, Phone, Video, Maximize2 } from 'lucide-react';
import { downloadMessageAttachment, getConversationCalls, getMessages, sendMessage, sendMessageWithAttachment } from '../../services/api';
import UserPresenceBadge from './UserPresenceBadge';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const parseServerDate = (value) => {
  if (!value) return null;
  const text = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatCallDuration = (seconds) => {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return remaining ? `${minutes} min ${remaining} s` : `${minutes} min`;
};

/**
 * Une mini-fenêtre de conversation individuelle (comme une fenêtre de
 * chat Messenger). Plusieurs instances peuvent être ouvertes en même
 * temps côte à côte (gérées par ChatManager) ; chacune charge son
 * propre historique de messages, mais toutes partagent la même
 * connexion WebSocket (passée en prop par le parent) pour la
 * réception en temps réel.
 *
 * Ce composant n'a plus d'état "minimisé" interne : quand une
 * conversation est réduite, ChatManager démonte ChatWindow et affiche
 * ChatBubble à la place (les deux sont deux représentations du même
 * état de conversation, jamais montées en même temps).
 *
 * Props :
 * - conversation : { id, participants: [{id, name, role}] }
 * - currentUserId : id de l'utilisateur connecté (pour distinguer mes
 *   messages de ceux des autres)
 * - incomingMessages : file des messages reçus via WS pour CETTE conversation
 * - onClose : ferme complètement la conversation (retire aussi la bulle)
 * - onMinimize : réduit la fenêtre en bulle flottante
 * - onConversationRead : callback pour signaler que cette conversation a
 *   été consultée (remise à zéro du compteur non-lu côté parent)
 */
const ChatWindow = ({
  conversation,
  currentUserId,
  presence,
  incomingMessages,
  onClose,
  onMinimize,
  onConversationRead,
  onIncomingMessagesConsumed,
  onOpenFull,
}) => {
  const [messages, setMessages] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const otherParticipants = (conversation.participants || []).filter((p) => p.id !== currentUserId);
  const title = otherParticipants.map((p) => p.name).join(', ') || 'Conversation';

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const mergeMessages = (current, incoming) => {
    const merged = new Map();
    [...current, ...incoming].forEach((message) => merged.set(Number(message.id), message));
    return [...merged.values()].sort((a, b) => Number(a.id) - Number(b.id));
  };

  const loadCallHistory = async () => {
    const list = await getConversationCalls(conversation.id);
    setCalls(list || []);
    return list || [];
  };

  // Chargement initial de toute la chronologie : messages ET appels.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoadingMessages(true);
        const [messageList, callList] = await Promise.all([
          getMessages(conversation.id),
          getConversationCalls(conversation.id),
        ]);
        if (!cancelled) {
          setMessages((current) => mergeMessages(messageList || [], current));
          setCalls(callList || []);
          scrollToBottom();
          onConversationRead?.(conversation.id);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
        if (!cancelled) setError('Impossible de charger les messages.');
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Un appel peut être ajouté depuis la page Messenger complète. À son retour
  // vers le tableau de bord, ou lors d'une mise à jour globale, la mini-fenêtre
  // relit le journal persistant afin de rester strictement identique.
  useEffect(() => {
    const refreshCalls = () => {
      loadCallHistory().catch((refreshError) => {
        console.error('Failed to refresh call history:', refreshError);
      });
    };
    window.addEventListener('school:messaging-updated', refreshCalls);
    return () => window.removeEventListener('school:messaging-updated', refreshCalls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Réception d'un nouveau message en temps réel pour cette conversation.
  // La fenêtre est toujours visible quand ce composant est monté, donc le
  // message reçu est immédiatement considéré comme lu.
  useEffect(() => {
    if (!incomingMessages?.length) return;
    setMessages((prev) => mergeMessages(prev, incomingMessages));
    scrollToBottom();
    onConversationRead?.(conversation.id);
    onIncomingMessagesConsumed?.(conversation.id, incomingMessages.map((message) => message.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingMessages, conversation.id, onIncomingMessagesConsumed]);

  const handleSend = async () => {
    if (!text.trim() && !file) return;
    setSending(true);
    setError(null);
    try {
      if (file) {
        await sendMessageWithAttachment(conversation.id, { body: text.trim() || null, file });
      } else {
        await sendMessage(conversation.id, text.trim());
      }
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // Recharge l'historique pour récupérer le message tel que persisté
      // (id, horodatage serveur, pièce jointe traitée).
      const list = await getMessages(conversation.id);
      setMessages(list || []);
      scrollToBottom();
    } catch (err) {
      setError(err.message || "Échec de l'envoi du message.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const timeline = [
    ...messages.map((message) => ({
      type: 'message',
      id: `message-${message.id}`,
      occurredAt: message.created_at,
      data: message,
    })),
    ...calls.map((call) => ({
      type: 'call',
      id: `call-${call.id}`,
      occurredAt: call.started_at,
      data: call,
    })),
  ].sort((first, second) => (
    (parseServerDate(first.occurredAt)?.getTime() || 0)
    - (parseServerDate(second.occurredAt)?.getTime() || 0)
  ));

  return (
    <div
      className="floating-chat-window bg-white dark:bg-gray-800 rounded-t-xl shadow-2xl border dark:border-gray-700 flex flex-col overflow-hidden flex-shrink-0"
    >
      {/* En-tête */}
      <div
        className="floating-chat-header flex items-center justify-between px-3 py-2 bg-blue-600 text-white cursor-pointer flex-shrink-0"
        onClick={onMinimize}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="floating-chat-avatar relative rounded-full bg-blue-400 flex items-center justify-center font-bold flex-shrink-0">
            {getInitials(title)}
            <UserPresenceBadge presence={presence} compact />
          </div>
          <span className="floating-chat-title font-medium text-sm truncate">{title}</span>
        </div>
        <div className="floating-chat-header-actions flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onMinimize(); }}
            className="hover:bg-blue-700 rounded p-1"
            aria-label="Réduire"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="hover:bg-blue-700 rounded p-1"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Fil de discussion */}
      <div className="floating-chat-messages flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 dark:bg-gray-900">
        {loadingMessages ? (
          <div className="text-sm text-gray-400">Chargement des messages...</div>
        ) : timeline.length === 0 ? (
          <div className="floating-chat-empty text-sm text-gray-400 text-center">Aucun message. Commencez la conversation !</div>
        ) : (
          timeline.map((item) => {
            if (item.type === 'call') {
              return <FloatingCallHistoryCard key={item.id} call={item.data} onOpenFull={onOpenFull} />;
            }
            const m = item.data;
            const isMine = Number(m.sender_id) === Number(currentUserId);
            return (
              <div key={item.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`floating-chat-message max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                    isMine
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                  }`}
                >
                  {!isMine && <p className="text-xs text-gray-500 dark:text-gray-300 mb-0.5">{m.sender_name}</p>}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mt-1">
                      {m.attachments.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => downloadMessageAttachment(a.id, a.original_name).catch((downloadError) => setError(downloadError.message))}
                          className="block text-left text-xs underline text-blue-200 dark:text-blue-300 hover:text-white"
                          title={`Télécharger ${a.original_name}`}
                        >
                          📎 {a.original_name}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5 text-right">
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de saisie */}
      <div className="floating-chat-composer border-t dark:border-gray-700 p-2 bg-white dark:bg-gray-800 flex items-center gap-2 flex-shrink-0">
        <label className="floating-chat-attachment cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <Paperclip size={16} />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        {file && <span className="text-xs text-gray-500 truncate max-w-[50px]">{file.name}</span>}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écrire un message..."
          className="floating-chat-input flex-1 border rounded-full px-3 py-1.5 text-sm dark:bg-gray-900 dark:text-white dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
        />
        <button
          onClick={handleSend}
          disabled={sending || (!text.trim() && !file)}
          className="floating-chat-send bg-blue-600 text-white rounded-full p-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
          aria-label="Envoyer"
        >
          <Send size={16} />
        </button>
      </div>
      {error && (
        <div className="text-xs text-red-600 px-3 py-1 bg-red-50 dark:bg-red-900/30 border-t dark:border-red-800 flex-shrink-0">
          {error}
        </div>
      )}
    </div>
  );
};

const FloatingCallHistoryCard = ({ call, onOpenFull }) => {
  const isVideo = call.call_kind === 'video';
  const Icon = isVideo ? Video : Phone;
  const failed = ['missed', 'declined', 'cancelled', 'failed'].includes(call.status);
  const statusText = {
    ringing: 'Appel sans réponse',
    answered: 'Appel accepté',
    ended: formatCallDuration(call.duration_seconds),
    missed: call.is_outgoing ? 'Pas de réponse' : 'Appel manqué',
    declined: call.is_outgoing ? 'Appel refusé' : 'Vous avez refusé l’appel',
    cancelled: 'Appel annulé',
    failed: 'Échec de l’appel',
  }[call.status] || 'Appel terminé';

  return (
    <article className={`floating-call-history ${failed ? 'unsuccessful' : ''}`}>
      <span className="floating-call-history-icon"><Icon /></span>
      <span className="floating-call-history-copy">
        <strong>Appel {isVideo ? 'vidéo' : 'vocal'}</strong>
        <small>{statusText} · {call.is_outgoing ? 'sortant' : 'entrant'}</small>
      </span>
      <time>{parseServerDate(call.started_at)?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || ''}</time>
      <button type="button" onClick={onOpenFull} title="Ouvrir dans Messenger">
        <Maximize2 /> <span>Voir dans Messenger</span>
      </button>
    </article>
  );
};

export default ChatWindow;
