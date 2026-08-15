// src/components/Messaging/ChatBubble.jsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import UserPresenceBadge from './UserPresenceBadge';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

// Palette stable par id pour que chaque contact garde toujours la même
// couleur d'avatar d'une session à l'autre.
const AVATAR_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
const colorForId = (id) => AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];

/**
 * Bulle flottante représentant une conversation réduite (style Messenger).
 * Au survol, affiche une info-bulle avec le dernier message échangé.
 * Un badge indique le nombre de messages non lus. Clic = rouvre la
 * fenêtre de conversation ; clic sur le petit "x" = ferme complètement.
 */
const ChatBubble = ({ title, lastMessagePreview, unreadCount, onOpen, onClose, avatarId, presence }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex items-center justify-end"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Info-bulle au survol : aperçu du dernier message */}
      {hovered && lastMessagePreview && (
        <div className="absolute right-16 bottom-1 max-w-[220px] bg-gray-800 text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 shadow-lg">
          <p className="line-clamp-3 break-words">{lastMessagePreview}</p>
        </div>
      )}

      <button
        onClick={onOpen}
        className="floating-chat-bubble relative rounded-full shadow-lg hover:scale-105 transition-transform flex-shrink-0"
        aria-label={`Ouvrir la conversation avec ${title}`}
      >
        <div className={`floating-chat-bubble-avatar rounded-full ${colorForId(avatarId)} text-white flex items-center justify-center font-bold text-lg`}>
          {getInitials(title)}
        </div>
        <UserPresenceBadge presence={presence} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center border-2 border-white dark:border-gray-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {hovered && (
          <span
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            role="button"
            aria-label="Fermer"
            className="absolute -top-1 -left-1 bg-gray-700 hover:bg-gray-900 text-white rounded-full w-5 h-5 flex items-center justify-center"
          >
            <X size={12} />
          </span>
        )}
      </button>
    </div>
  );
};

export default ChatBubble;
