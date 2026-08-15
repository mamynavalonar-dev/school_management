// src/components/Messaging/NewMessagePanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { getContacts } from '../../services/api';
import UserPresenceBadge from './UserPresenceBadge';

const ROLE_LABELS = {
  admin: 'Administrateurs',
  directeur: 'Direction',
  teacher: 'Enseignants',
  student: 'Étudiants',
};

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

/**
 * Panneau "Nouveau message" (style Messenger) : recherche par nom +
 * filtre par rôle, affiche les contacts groupés par rôle. Au clic sur
 * un contact, appelle onSelectContact(contact) et laisse le parent
 * décider (créer/ouvrir la conversation).
 */
const NewMessagePanel = ({
  onClose,
  onSelectContact,
  presenceByUser = {},
  title = 'Nouveau message',
  helperText = '',
  allowedRoles = null,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [grouped, setGrouped] = useState({});
  const [availableRoles, setAvailableRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus automatique sur la recherche à l'ouverture (comme Messenger)
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const loadContacts = async (filters) => {
    try {
      setLoading(true);
      setError(null);
      const { grouped: groupedData } = await getContacts(filters);
      const roleLimitedData = Array.isArray(allowedRoles) && allowedRoles.length > 0
        ? Object.fromEntries(Object.entries(groupedData || {}).filter(([role]) => allowedRoles.includes(role)))
        : (groupedData || {});
      setGrouped(roleLimitedData);
      // Ne recalculer la liste des rôles disponibles (pour les boutons de
      // filtre) que lors du premier chargement sans filtre, sinon les
      // onglets disparaîtraient dès qu'on filtre sur un seul rôle.
      if (!filters.role && !filters.search) {
        setAvailableRoles(Object.keys(roleLimitedData));
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
      setError('Impossible de charger les contacts.');
    } finally {
      setLoading(false);
    }
  };

  // Chargement initial
  useEffect(() => {
    loadContacts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recherche avec anti-rebond (évite un appel réseau à chaque frappe)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadContacts({ search: search.trim() || undefined, role: roleFilter || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter]);

  const roleEntries = Object.entries(grouped);
  const hasAnyContact = roleEntries.some(([, list]) => list.length > 0);

  return (
    <div className="new-message-panel flex flex-col h-full bg-white dark:bg-gray-800">
      {/* En-tête */}
      <div className="new-message-header flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="new-message-title font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
          {helperText && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-5">{helperText}</p>}
        </div>
        <button
          onClick={onClose}
          className="new-message-close text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded p-1"
          aria-label="Fermer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Recherche */}
      <div className="new-message-search-row px-4 py-2 border-b dark:border-gray-700 flex items-center gap-2">
        <span className="new-message-recipient-label text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">À :</span>
        <div className="new-message-search-box relative flex-1">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un contact..."
            className="new-message-search-input w-full border rounded-full pl-7 pr-3 py-1.5 text-sm dark:bg-gray-900 dark:text-white dark:border-gray-600 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filtre par rôle */}
      {availableRoles.length > 1 && (
        <div className="new-message-role-filters px-4 py-2 border-b dark:border-gray-700 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setRoleFilter('')}
            className={`new-message-role-filter text-xs px-2.5 py-1 rounded-full transition-colors ${
              roleFilter === ''
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Tous
          </button>
          {availableRoles.map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`new-message-role-filter text-xs px-2.5 py-1 rounded-full transition-colors ${
                roleFilter === role
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {ROLE_LABELS[role] || role}
            </button>
          ))}
        </div>
      )}

      {/* Liste des contacts */}
      <div className="new-message-contact-list flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 text-sm text-gray-400">Chargement...</div>
        ) : error ? (
          <div className="p-3 text-sm text-red-500">{error}</div>
        ) : !hasAnyContact ? (
          <div className="p-3 text-sm text-gray-400 text-center">Aucun contact trouvé</div>
        ) : (
          roleEntries.map(([role, contacts]) => {
            if (contacts.length === 0) return null;
            return (
              <div key={role}>
                {roleFilter === '' && (
                  <div className="new-message-role-heading px-4 pt-2 pb-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">
                    {ROLE_LABELS[role] || role}
                  </div>
                )}
                {contacts.map((contact) => {
                  const realtimePresence = presenceByUser[Number(contact.id)] || {};
                  const presence = {
                    isOnline: Boolean(realtimePresence.isOnline),
                    lastSeenAt: realtimePresence.lastSeenAt ?? contact.last_seen_at ?? null,
                  };
                  return (
                    <button
                      key={contact.id}
                      onClick={() => onSelectContact(contact)}
                      className="new-message-contact w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3"
                    >
                      <div className="new-message-contact-avatar relative rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {getInitials(contact.name)}
                        <UserPresenceBadge presence={presence} />
                      </div>
                      <span className="new-message-contact-name text-sm text-gray-900 dark:text-white truncate">{contact.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NewMessagePanel;
