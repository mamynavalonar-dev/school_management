import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accessibility, AlertTriangle, ArrowLeft, Bell, BookOpen, Bug, CalendarDays,
  Check, CheckCheck, ChevronDown, ChevronRight, Globe2, HelpCircle,
  History, ClipboardList, Edit3, Eye, GraduationCap, Grid, Keyboard, LayoutDashboard,
  LifeBuoy, Lock, LogOut, Maximize2, MessageCircle, Monitor, Moon, Search, Settings,
  Shield, SlidersHorizontal, Trash2, User, UserCheck, Users, Volume2, X, School,
} from 'lucide-react';
import apiService, { getAppNotifications, getConversations, searchGlobal } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import { getMessageSoundVolume, playMessageSound, setMessageSoundVolume } from '../../utils/messageSound';
import { canViewFeature } from '../../utils/permissions';
import './TopBar.css';
import LogoutConfirmModal from '../shared/LogoutConfirmModal';

const roleLabel = {
  admin: 'Administrateur',
  directeur: 'Directeur',
  teacher: 'Enseignant',
  student: 'Étudiant',
};

const getInitials = (name) => (name || '?')
  .split(' ')
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .toUpperCase()
  .slice(0, 2);

const parseServerDate = (value) => {
  if (!value) return null;
  const text = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const timeAgo = (value) => {
  const date = parseServerDate(value);
  if (!date) return '';
  const signedSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const isFuture = signedSeconds < -59;
  const seconds = Math.abs(signedSeconds);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return isFuture ? `dans ${minutes} min` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isFuture ? `dans ${hours} h` : `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return isFuture ? `dans ${days} j` : `${days} j`;
  const weeks = Math.floor(days / 7);
  return isFuture ? `dans ${weeks} sem.` : `${weeks} sem.`;
};

const conversationTitle = (conversation) => (
  (conversation.participants || []).map((participant) => participant.name).join(', ') || 'Conversation'
);

const notificationIcon = {
  message: MessageCircle,
  evaluation: ClipboardList,
  grade: GraduationCap,
  absence: CalendarDays,
  user: User,
  academic: AlertTriangle,
};

const menuLabels = {
  dashboard: 'Tableau de bord',
  'admin-dashboard': 'Tableau de bord administrateur',
  'director-dashboard': 'Tableau de bord direction',
  'teacher-dashboard': 'Tableau de bord enseignant',
  'student-dashboard': 'Tableau de bord étudiant',
  students: 'Étudiants', teachers: 'Enseignants', courses: 'Cours', rooms: 'Salles',
  planning: 'Planning', evaluations: 'Évaluations', grades: 'Notes', absences: 'Absences',
  'school-operations': 'Gestion de la scolarité', payroll: 'Paie du personnel',
  messaging: 'Messenger', 'admin-users': 'Gestion des utilisateurs',
  'admin-references': 'Référentiels',
  trash: 'Corbeille',
};

const ProfilePanelHeader = ({ title, onBack }) => (
  <div className="profile-panel-heading">
    <button type="button" onClick={onBack} aria-label="Retour"><ArrowLeft size={23} /></button>
    <h2>{title}</h2>
  </div>
);

const ProfileMenuRow = ({ icon: Icon, label, description, onClick, arrow = true, danger = false }) => (
  <button type="button" className={`profile-menu-row ${danger ? 'danger' : ''}`} onClick={onClick}>
    <span className="profile-menu-icon"><Icon size={20} /></span>
    <span className="profile-menu-copy">
      <strong>{label}</strong>
      {description && <small>{description}</small>}
    </span>
    {arrow && <ChevronRight size={20} className="profile-menu-chevron" />}
  </button>
);

const RadioChoice = ({ name, value, currentValue, onChange, label, description }) => (
  <label className="profile-radio-choice">
    <span>
      <strong>{label}</strong>
      {description && <small>{description}</small>}
    </span>
    <input
      type="radio"
      name={name}
      value={value}
      checked={currentValue === value}
      onChange={() => onChange(value)}
    />
    <i aria-hidden="true"><Check size={13} /></i>
  </label>
);

const ToggleChoice = ({ checked, onChange, label, description }) => (
  <label className="profile-toggle-choice">
    <span>
      <strong>{label}</strong>
      {description && <small>{description}</small>}
    </span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <i aria-hidden="true" />
  </label>
);

const TopBar = ({
  darkMode,
  themeMode,
  onThemeModeChange,
  compactMode,
  onCompactModeChange,
  reduceMotion,
  onReduceMotionChange,
  highContrast,
  onHighContrastChange,
}) => {
  const { user, logout } = useApp();
  const { activeMenu, setActiveMenu, openMessenger, canGoBack, previousMenu, goBack } = useUi();
  const [openPanel, setOpenPanel] = useState(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const [conversationFilter, setConversationFilter] = useState('all');
  const [conversations, setConversations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationFilter, setNotificationFilter] = useState('all');
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState(() => new Set());
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [profileSection, setProfileSection] = useState('home');
  const [singleKeyShortcuts, setSingleKeyShortcuts] = useState(() => localStorage.getItem('school_single_key_shortcuts') === 'true');
  const [interfaceLanguage, setInterfaceLanguage] = useState(() => localStorage.getItem('school_interface_language') || 'fr-FR');
  const [activityHistory, setActivityHistory] = useState([]);
  const [messageSounds, setMessageSounds] = useState(() => localStorage.getItem('messenger_message_sounds') !== 'false');
  const [autoOpenMessages, setAutoOpenMessages] = useState(() => localStorage.getItem('messenger_auto_open') !== 'false');
  const [soundVolume, setSoundVolume] = useState(() => getMessageSoundVolume());
  const [soundTestStatus, setSoundTestStatus] = useState(null);
  const [reportCategory, setReportCategory] = useState('Erreur technique');
  const [reportDescription, setReportDescription] = useState('');
  const [accountStatusBack, setAccountStatusBack] = useState('help');
  const [accountProfile, setAccountProfile] = useState({ first_name: '', last_name: '', phone: '', address: '', city: '', nationality: '', title: '', bio: '', avatar_url: '' });
  const [accountProfileLoading, setAccountProfileLoading] = useState(false);
  const [accountProfileSaving, setAccountProfileSaving] = useState(false);
  const [accountProfileMessage, setAccountProfileMessage] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const topbarRef = useRef(null);

  const readStorageKey = `school_notification_reads_${user?.id || 'guest'}`;
  const activityStorageKey = `school_activity_history_${user?.id || 'guest'}`;
  const dashboardMenuId = {
    admin: 'admin-dashboard', directeur: 'director-dashboard',
    teacher: 'teacher-dashboard', student: 'student-dashboard',
  }[user?.role] || 'dashboard';
  const canUseMessaging = canViewFeature(user, 'messaging');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const query = globalSearch.trim();
    if (query.length < 2) {
      setGlobalResults([]);
      setGlobalSearchLoading(false);
      return undefined;
    }

    const normalizedQuery = query.toLocaleLowerCase('fr');
    const staffOnlyMenus = new Set(['admin-users', 'admin-references', 'trash', 'payroll']);
    const localMenus = Object.entries(menuLabels)
      .filter(([id]) => {
        if (id === dashboardMenuId) return true;
        if (id.endsWith('-dashboard') || id === 'dashboard') return false;
        if (staffOnlyMenus.has(id) && !['admin', 'directeur'].includes(user?.role)) return false;
        return canViewFeature(user, id);
      })
      .filter(([, label]) => label.toLocaleLowerCase('fr').includes(normalizedQuery))
      .map(([id, label]) => ({ type: 'rubrique', id: `menu-${id}`, title: label, subtitle: 'Ouvrir cette rubrique', target: id }));

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setGlobalSearchLoading(true);
        const results = await searchGlobal(query);
        if (!cancelled) {
          const remote = Array.isArray(results) ? results : [];
          setGlobalResults([...localMenus, ...remote].slice(0, 35));
        }
      } catch (error) {
        if (!cancelled) setGlobalResults(localMenus);
        console.error('Global search error:', error);
      } finally {
        if (!cancelled) setGlobalSearchLoading(false);
      }
    }, 260);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [dashboardMenuId, globalSearch, user]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(readStorageKey) || '[]');
      setReadNotificationIds(new Set(Array.isArray(saved) ? saved : []));
    } catch {
      setReadNotificationIds(new Set());
    }
  }, [readStorageKey]);

  const persistReadIds = useCallback((next) => {
    setReadNotificationIds(next);
    try {
      localStorage.setItem(readStorageKey, JSON.stringify([...next].slice(-300)));
    } catch {
      // Le flux reste utilisable même si le stockage local est indisponible.
    }
  }, [readStorageKey]);

  const loadConversations = useCallback(async () => {
    if (!canUseMessaging) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }
    try {
      const list = await getConversations();
      setConversations(list || []);
    } catch (error) {
      console.error('Topbar conversations error:', error);
    } finally {
      setLoadingConversations(false);
    }
  }, [canUseMessaging]);

  const loadNotifications = useCallback(async () => {
    try {
      const list = await getAppNotifications();
      setNotifications(list || []);
    } catch (error) {
      console.error('Topbar notifications error:', error);
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadNotifications();
    const refresh = () => {
      loadConversations();
      loadNotifications();
    };
    window.addEventListener('school:messaging-updated', refresh);
    const interval = window.setInterval(refresh, 45000);
    return () => {
      window.removeEventListener('school:messaging-updated', refresh);
      window.clearInterval(interval);
    };
  }, [loadConversations, loadNotifications]);

  useEffect(() => {
    localStorage.setItem('school_single_key_shortcuts', String(singleKeyShortcuts));
  }, [singleKeyShortcuts]);

  useEffect(() => {
    localStorage.setItem('school_interface_language', interfaceLanguage);
    document.documentElement.lang = interfaceLanguage;
  }, [interfaceLanguage]);

  useEffect(() => {
    let previous = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(activityStorageKey) || '[]');
      previous = Array.isArray(parsed) ? parsed : [];
    } catch {
      previous = [];
    }
    const entry = { menu: activeMenu, label: menuLabels[activeMenu] || activeMenu, visitedAt: new Date().toISOString() };
    const next = previous[0]?.menu === activeMenu ? [entry, ...previous.slice(1)] : [entry, ...previous];
    const limited = next.slice(0, 20);
    localStorage.setItem(activityStorageKey, JSON.stringify(limited));
    setActivityHistory(limited);
  }, [activeMenu, activityStorageKey]);

  useEffect(() => {
    const syncMessengerPreferences = () => {
      setMessageSounds(localStorage.getItem('messenger_message_sounds') !== 'false');
      setAutoOpenMessages(localStorage.getItem('messenger_auto_open') !== 'false');
      setSoundVolume(getMessageSoundVolume());
    };
    window.addEventListener('school:messenger-preferences', syncMessengerPreferences);
    return () => window.removeEventListener('school:messenger-preferences', syncMessengerPreferences);
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (topbarRef.current && !topbarRef.current.contains(event.target)) { setOpenPanel(null); setGlobalSearch(''); setGlobalResults([]); }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') { setOpenPanel(null); setGlobalSearch(''); setGlobalResults([]); }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const isTyping = target instanceof Element
        && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
      const key = event.key.toLocaleLowerCase('fr');

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (key === 'k') {
          event.preventDefault();
          setOpenPanel('profile');
          setProfileSection('keyboard');
        } else if (key === 'm') {
          event.preventDefault();
          openMessenger();
        } else if (key === 'p') {
          event.preventDefault();
          setActiveMenu('planning');
        } else if (key === 'a') {
          event.preventDefault();
          setActiveMenu(dashboardMenuId);
        }
        return;
      }

      if (!singleKeyShortcuts || isTyping || event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === 'm') {
        event.preventDefault();
        openMessenger();
      } else if (key === 'p') {
        event.preventDefault();
        setActiveMenu('planning');
      } else if (key === 'a') {
        event.preventDefault();
        setActiveMenu(dashboardMenuId);
      } else if (key === 'n') {
        event.preventDefault();
        setOpenPanel('notifications');
        loadNotifications();
      } else if (key === '?') {
        event.preventDefault();
        setOpenPanel('profile');
        setProfileSection('shortcuts');
      }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [dashboardMenuId, loadNotifications, openMessenger, setActiveMenu, singleKeyShortcuts]);

  const openGlobalResult = (result) => {
    if (result?.target) setActiveMenu(result.target);
    setGlobalSearch('');
    setGlobalResults([]);
  };

  const topbarDate = now.toLocaleDateString(interfaceLanguage === 'fr-MG' ? 'fr-MG' : 'fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
  const topbarTime = now.toLocaleTimeString(interfaceLanguage === 'fr-MG' ? 'fr-MG' : 'fr-FR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const togglePanel = (panel) => {
    const opening = openPanel !== panel;
    setOpenPanel(opening ? panel : null);
    if (opening && panel === 'profile') setProfileSection('home');
    if (panel === 'messages') loadConversations();
    if (panel === 'notifications') loadNotifications();
  };

  const unreadMessageCount = conversations.reduce((total, conversation) => (
    total + Number(conversation.unread_count || 0)
  ), 0);

  const isNotificationUnread = useCallback((notification) => (
    notification.is_unread !== false && !readNotificationIds.has(String(notification.id))
  ), [readNotificationIds]);

  const unreadNotificationCount = notifications.filter(isNotificationUnread).length;

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase('fr');
    return conversations.filter((conversation) => {
      const matchesSearch = !query || conversationTitle(conversation).toLocaleLowerCase('fr').includes(query)
        || String(conversation.last_message || '').toLocaleLowerCase('fr').includes(query);
      const matchesFilter = conversationFilter === 'all' || Number(conversation.unread_count || 0) > 0;
      return matchesSearch && matchesFilter;
    });
  }, [conversationFilter, conversationSearch, conversations]);

  const filteredNotifications = notifications.filter((notification) => (
    notificationFilter === 'all' || isNotificationUnread(notification)
  ));
  const visibleNotifications = showAllNotifications
    ? filteredNotifications
    : filteredNotifications.slice(0, 7);

  const markNotificationRead = (notificationId) => {
    const next = new Set(readNotificationIds);
    next.add(String(notificationId));
    persistReadIds(next);
  };

  const markAllNotificationsRead = () => {
    const next = new Set(readNotificationIds);
    notifications.forEach((notification) => next.add(String(notification.id)));
    persistReadIds(next);
  };

  const openConversation = (conversationId) => {
    setOpenPanel(null);
    openMessenger(conversationId);
  };

  const startConversation = (request = null) => {
    const details = request?.kind ? request : { kind: 'new', title: 'Nouveau message' };
    setOpenPanel(null);
    openMessenger(null, details);
  };

  const startSupportConversation = () => startConversation({
    kind: 'support',
    title: 'Contacter l’assistance',
    helperText: 'Choisissez un administrateur ou un membre de la direction.',
    allowedRoles: ['admin', 'directeur'],
    prefill: `Bonjour,\n\nJ’ai besoin d’aide concernant la rubrique « ${menuLabels[activeMenu] || activeMenu} ».\n\nMa demande : `,
  });

  const openProblemReport = () => {
    setReportCategory('Erreur technique');
    setReportDescription('');
    setProfileSection('report');
  };

  const submitProblemReport = (event) => {
    event.preventDefault();
    const description = reportDescription.trim();
    if (description.length < 10) return;
    startConversation({
      kind: 'report',
      title: 'Signaler un problème',
      helperText: 'Choisissez la personne qui recevra ce signalement.',
      allowedRoles: ['admin', 'directeur'],
      prefill: [
        'Bonjour,',
        '',
        'Je souhaite signaler un problème dans l’application.',
        `Catégorie : ${reportCategory}`,
        `Rubrique : ${menuLabels[activeMenu] || activeMenu}`,
        `Description : ${description}`,
        '',
        'Étapes pour reproduire le problème : ',
      ].join('\n'),
    });
  };

  const handleNotification = (notification) => {
    markNotificationRead(notification.id);
    setOpenPanel(null);
    if (notification.conversation_id) {
      openMessenger(notification.conversation_id);
    } else if (notification.target) {
      setActiveMenu(notification.target);
    }
  };

  const handleLogout = () => {
    setOpenPanel(null);
    setLogoutConfirmOpen(true);
  };

  const confirmLogout = () => {
    setLogoutConfirmOpen(false);
    logout();
  };

  const updateMessengerPreference = (key, value, setter) => {
    localStorage.setItem(key, String(value));
    setter(value);
    window.dispatchEvent(new CustomEvent('school:messenger-preferences'));
  };

  const updateSoundVolume = (value) => {
    const normalized = setMessageSoundVolume(value);
    setSoundVolume(normalized);
  };

  const testSound = async () => {
    if (!messageSounds) return;
    setSoundTestStatus('testing');
    const result = await playMessageSound({ force: true });
    setSoundTestStatus(result.played ? 'success' : 'blocked');
    window.setTimeout(() => setSoundTestStatus(null), 3500);
  };

  const clearActivityHistory = () => {
    localStorage.removeItem(activityStorageKey);
    setActivityHistory([]);
  };

  const navigateFromHistory = (menuId) => {
    setActiveMenu(menuId);
    setOpenPanel(null);
  };

  const roleApps = useMemo(() => {
    const apps = [
      { id: dashboardMenuId, label: 'Accueil', icon: LayoutDashboard },
      { id: 'courses', label: 'Cours', icon: BookOpen },
      { id: 'planning', label: 'Planning', icon: CalendarDays },
      { id: 'evaluations', label: 'Évaluations', icon: ClipboardList },
      { id: 'grades', label: 'Notes', icon: GraduationCap },
      { id: 'messaging', label: 'Messenger', icon: MessageCircle },
    ];
    if (user?.role !== 'student') apps.splice(1, 0, { id: 'students', label: 'Étudiants', icon: Users });
    if (user?.role !== 'student') apps.splice(2, 0, { id: 'school-operations', label: 'Scolarité', icon: School });
    return apps.filter((app) => app.id === dashboardMenuId || canViewFeature(user, app.id));
  }, [dashboardMenuId, user]);

  const openAccountProfile = async () => {
    setProfileSection('account-profile');
    setAccountProfileMessage('');
    setAccountProfileLoading(true);
    try {
      const response = await apiService.getSchoolResource('profile');
      setAccountProfile((current) => ({ ...current, ...(response?.data || {}) }));
    } catch (error) {
      setAccountProfileMessage(error.message || 'Impossible de charger le profil.');
    } finally {
      setAccountProfileLoading(false);
    }
  };

  const saveAccountProfile = async (event) => {
    event.preventDefault();
    setAccountProfileSaving(true);
    setAccountProfileMessage('');
    try {
      await apiService.createSchoolResource('profile', accountProfile);
      setAccountProfileMessage('Profil enregistré.');
    } catch (error) {
      setAccountProfileMessage(error.message || 'Impossible d’enregistrer le profil.');
    } finally {
      setAccountProfileSaving(false);
    }
  };

  const renderProfileContent = () => {
    switch (profileSection) {
      case 'settings':
        return (
          <>
            <ProfilePanelHeader title="Paramètres et confidentialité" onBack={() => setProfileSection('home')} />
            <div className="profile-panel-list">
              <ProfileMenuRow icon={Settings} label="Paramètres" onClick={() => setProfileSection('general-settings')} />
              <ProfileMenuRow icon={Globe2} label="Langue" description={interfaceLanguage === 'fr-MG' ? 'Français (Madagascar)' : 'Français (France)'} onClick={() => setProfileSection('language')} />
              <ProfileMenuRow icon={Lock} label="Assistance confidentialité" onClick={() => setProfileSection('privacy-assistance')} />
              <ProfileMenuRow icon={Shield} label="Centre de confidentialité" onClick={() => setProfileSection('privacy-center')} />
              <ProfileMenuRow icon={History} label="Historique d’activité" onClick={() => setProfileSection('activity')} />
              <ProfileMenuRow icon={SlidersHorizontal} label="Préférences de contenu" onClick={() => setProfileSection('content')} />
            </div>
          </>
        );

      case 'general-settings':
        return (
          <>
            <ProfilePanelHeader title="Paramètres" onBack={() => setProfileSection('settings')} />
            <div className="profile-info-card">
              <span className="profile-card-avatar">{getInitials(user?.name)}</span>
              <div><strong>{user?.name}</strong><small>{user?.email || 'Adresse non renseignée'}</small><small>{roleLabel[user?.role] || user?.role}</small></div>
            </div>
            <div className="profile-panel-list">
              <ProfileMenuRow icon={Edit3} label="Modifier mon profil" description="Coordonnées, fonction et présentation" onClick={openAccountProfile} />
              <ProfileMenuRow icon={Monitor} label="Affichage et accessibilité" description={darkMode ? 'Mode sombre actif' : 'Mode clair actif'} onClick={() => setProfileSection('display')} />
              <ProfileMenuRow icon={SlidersHorizontal} label="Préférences Messenger" description="Sons et ouverture des discussions" onClick={() => setProfileSection('content')} />
              <ProfileMenuRow icon={Keyboard} label="Raccourcis clavier" onClick={() => setProfileSection('keyboard')} />
            </div>
          </>
        );

      case 'account-profile':
        return (
          <>
            <ProfilePanelHeader title="Modifier mon profil" onBack={() => setProfileSection('general-settings')} />
            {accountProfileLoading ? <p className="profile-empty-state">Chargement du profil…</p> : (
              <form className="problem-report-form profile-edit-form" onSubmit={saveAccountProfile}>
                <div className="profile-edit-grid">
                  <label><span>Prénom</span><input value={accountProfile.first_name || ''} onChange={(event) => setAccountProfile({ ...accountProfile, first_name: event.target.value })} /></label>
                  <label><span>Nom</span><input value={accountProfile.last_name || ''} onChange={(event) => setAccountProfile({ ...accountProfile, last_name: event.target.value })} /></label>
                  <label><span>Téléphone</span><input value={accountProfile.phone || ''} onChange={(event) => setAccountProfile({ ...accountProfile, phone: event.target.value })} /></label>
                  <label><span>Ville</span><input value={accountProfile.city || ''} onChange={(event) => setAccountProfile({ ...accountProfile, city: event.target.value })} /></label>
                  <label><span>Nationalité</span><input value={accountProfile.nationality || ''} onChange={(event) => setAccountProfile({ ...accountProfile, nationality: event.target.value })} /></label>
                  <label><span>Fonction / titre</span><input value={accountProfile.title || ''} onChange={(event) => setAccountProfile({ ...accountProfile, title: event.target.value })} /></label>
                </div>
                <label><span>Adresse</span><input value={accountProfile.address || ''} onChange={(event) => setAccountProfile({ ...accountProfile, address: event.target.value })} /></label>
                <label><span>À propos de moi</span><textarea rows="5" value={accountProfile.bio || ''} onChange={(event) => setAccountProfile({ ...accountProfile, bio: event.target.value })} placeholder="Présentez brièvement votre fonction dans l’établissement…" /></label>
                <label><span>URL de la photo</span><input type="url" value={accountProfile.avatar_url || ''} onChange={(event) => setAccountProfile({ ...accountProfile, avatar_url: event.target.value })} placeholder="https://…" /></label>
                {accountProfileMessage && <p className={accountProfileMessage === 'Profil enregistré.' ? 'success' : 'error'}>{accountProfileMessage}</p>}
                <button type="submit" disabled={accountProfileSaving}>{accountProfileSaving ? 'Enregistrement…' : 'Mettre à jour mon profil'}</button>
              </form>
            )}
          </>
        );

      case 'language':
        return (
          <>
            <ProfilePanelHeader title="Langue" onBack={() => setProfileSection('settings')} />
            <h3 className="profile-section-title">Langue et région</h3>
            <div className="profile-panel-list">
              <ProfileMenuRow icon={Globe2} label="Langue de l’application" description={interfaceLanguage === 'fr-MG' ? 'Français (Madagascar)' : 'Français (France)'} onClick={() => setProfileSection('language-choice')} />
              <ProfileMenuRow icon={Settings} label="Voir tous les paramètres" onClick={() => setProfileSection('language-choice')} />
            </div>
          </>
        );

      case 'language-choice':
        return (
          <>
            <ProfilePanelHeader title="Langue de l’application" onBack={() => setProfileSection('language')} />
            <p className="profile-panel-description">Choisissez la variante française utilisée pour la langue et les formats régionaux.</p>
            <div className="profile-radio-group">
              <RadioChoice name="interface-language" value="fr-FR" currentValue={interfaceLanguage} onChange={setInterfaceLanguage} label="Français (France)" />
              <RadioChoice name="interface-language" value="fr-MG" currentValue={interfaceLanguage} onChange={setInterfaceLanguage} label="Français (Madagascar)" />
            </div>
          </>
        );

      case 'display':
        return (
          <>
            <ProfilePanelHeader title="Affichage et accessibilité" onBack={() => setProfileSection('home')} />
            <div className="profile-setting-block">
              <div className="profile-setting-heading"><span><Moon size={21} /></span><div><h3>Mode sombre</h3><p>Ajustez l’apparence de l’application pour réduire les reflets et reposer vos yeux.</p></div></div>
              <div className="profile-radio-group indented">
                <RadioChoice name="theme-mode" value="light" currentValue={themeMode} onChange={onThemeModeChange} label="Désactivé" />
                <RadioChoice name="theme-mode" value="dark" currentValue={themeMode} onChange={onThemeModeChange} label="Activé" />
                <RadioChoice name="theme-mode" value="system" currentValue={themeMode} onChange={onThemeModeChange} label="Automatique" description="Suit les paramètres de votre appareil." />
              </div>
            </div>
            <div className="profile-setting-block">
              <div className="profile-setting-heading"><span><Accessibility size={21} /></span><div><h3>Mode compact</h3><p>Réduit la taille du texte et des espacements pour afficher plus d’éléments.</p></div></div>
              <div className="profile-radio-group indented">
                <RadioChoice name="compact-mode" value="off" currentValue={compactMode ? 'on' : 'off'} onChange={(value) => onCompactModeChange(value === 'on')} label="Désactivé" />
                <RadioChoice name="compact-mode" value="on" currentValue={compactMode ? 'on' : 'off'} onChange={(value) => onCompactModeChange(value === 'on')} label="Activé" />
              </div>
            </div>
            <div className="profile-panel-list divided">
              <ProfileMenuRow icon={Keyboard} label="Clavier" onClick={() => setProfileSection('keyboard')} />
              <ProfileMenuRow icon={Accessibility} label="Paramètres d’accessibilité" onClick={() => setProfileSection('accessibility')} />
            </div>
          </>
        );

      case 'keyboard':
        return (
          <>
            <ProfilePanelHeader title="Clavier" onBack={() => setProfileSection('display')} />
            <div className="profile-panel-list">
              <ProfileMenuRow icon={Keyboard} label="Voir tous les raccourcis clavier" onClick={() => setProfileSection('shortcuts')} />
            </div>
            <div className="profile-setting-block">
              <div className="profile-setting-heading"><span><Keyboard size={21} /></span><div><h3>Raccourcis à un seul caractère</h3><p>Utilisez une touche pour accéder rapidement aux principales rubriques.</p></div></div>
              <div className="profile-radio-group indented">
                <RadioChoice name="single-shortcuts" value="off" currentValue={singleKeyShortcuts ? 'on' : 'off'} onChange={(value) => setSingleKeyShortcuts(value === 'on')} label="Désactivé" />
                <RadioChoice name="single-shortcuts" value="on" currentValue={singleKeyShortcuts ? 'on' : 'off'} onChange={(value) => setSingleKeyShortcuts(value === 'on')} label="Activé" />
              </div>
            </div>
          </>
        );

      case 'shortcuts':
        return (
          <>
            <ProfilePanelHeader title="Raccourcis clavier" onBack={() => setProfileSection('keyboard')} />
            <div className="shortcut-list">
              <div><span>Ouvrir ce panneau</span><kbd>Alt</kbd><b>+</b><kbd>K</kbd></div>
              <div><span>Ouvrir Messenger</span><kbd>Alt</kbd><b>+</b><kbd>M</kbd></div>
              <div><span>Ouvrir le planning</span><kbd>Alt</kbd><b>+</b><kbd>P</kbd></div>
              <div><span>Aller à l’accueil</span><kbd>Alt</kbd><b>+</b><kbd>A</kbd></div>
            </div>
            <p className="profile-panel-description">Si les raccourcis à une touche sont activés : <kbd>M</kbd> Messenger, <kbd>P</kbd> planning, <kbd>N</kbd> notifications, <kbd>A</kbd> accueil et <kbd>?</kbd> cette liste. Ils sont désactivés pendant la saisie dans un champ.</p>
          </>
        );

      case 'accessibility':
        return (
          <>
            <ProfilePanelHeader title="Paramètres d’accessibilité" onBack={() => setProfileSection('display')} />
            <div className="profile-toggle-list">
              <ToggleChoice checked={reduceMotion} onChange={onReduceMotionChange} label="Réduire les animations" description="Limite les mouvements et transitions dans l’interface." />
              <ToggleChoice checked={highContrast} onChange={onHighContrastChange} label="Contraste renforcé" description="Renforce les textes, bordures et indicateurs de focus." />
            </div>
          </>
        );

      case 'privacy-assistance':
        return (
          <>
            <ProfilePanelHeader title="Assistance confidentialité" onBack={() => setProfileSection('settings')} />
            <div className="profile-notice"><Lock size={24} /><div><strong>Vos informations sont limitées selon votre rôle</strong><p>Les étudiants, enseignants, administrateurs et membres de la direction n’accèdent qu’aux données autorisées par leur compte.</p></div></div>
            <div className="profile-panel-list">
              <ProfileMenuRow icon={UserCheck} label="Vérifier mon compte" description={`${user?.email || 'Compte actif'} · ${roleLabel[user?.role] || user?.role}`} onClick={() => { setAccountStatusBack('privacy-assistance'); setProfileSection('account-status'); }} />
              <ProfileMenuRow icon={LifeBuoy} label="Demander de l’aide" onClick={startSupportConversation} />
            </div>
          </>
        );

      case 'privacy-center':
        return (
          <>
            <ProfilePanelHeader title="Centre de confidentialité" onBack={() => setProfileSection('settings')} />
            <div className="profile-notice"><Shield size={24} /><div><strong>Protection des données universitaires</strong><p>La session est authentifiée, les accès sont contrôlés par rôle et les erreurs techniques détaillées restent dans les journaux du serveur.</p></div></div>
            <div className="profile-info-list">
              <p><strong>Messagerie</strong><span>Seuls les participants d’une conversation peuvent lire ses messages.</span></p>
              <p><strong>Présence</strong><span>Le statut en ligne et la dernière déconnexion sont visibles dans la messagerie.</span></p>
              <p><strong>Notifications</strong><span>Elles affichent uniquement les événements accessibles à votre compte.</span></p>
            </div>
          </>
        );

      case 'activity':
        return (
          <>
            <ProfilePanelHeader title="Historique d’activité" onBack={() => setProfileSection('settings')} />
            <div className="activity-heading"><span>Rubriques récemment consultées</span>{activityHistory.length > 0 && <button type="button" onClick={clearActivityHistory}><Trash2 size={16} /> Effacer</button>}</div>
            <div className="activity-list">
              {activityHistory.length === 0 ? <p className="profile-empty-state">Aucune activité enregistrée sur cet appareil.</p> : activityHistory.map((entry, index) => (
                <button type="button" key={`${entry.visitedAt}-${index}`} onClick={() => navigateFromHistory(entry.menu)}>
                  <span><History size={18} /></span><strong>{entry.label}</strong><time>{timeAgo(entry.visitedAt)}</time>
                </button>
              ))}
            </div>
          </>
        );

      case 'content':
        return (
          <>
            <ProfilePanelHeader title="Préférences de contenu" onBack={() => setProfileSection('settings')} />
            <div className="profile-toggle-list">
              <ToggleChoice checked={messageSounds} onChange={(value) => updateMessengerPreference('messenger_message_sounds', value, setMessageSounds)} label="Sons des messages" description="Joue un son lors de la réception d’un nouveau message." />
              <ToggleChoice checked={autoOpenMessages} onChange={(value) => updateMessengerPreference('messenger_auto_open', value, setAutoOpenMessages)} label="Ouvrir les nouvelles discussions" description="Sinon, les nouvelles discussions restent réduites en bulle avec un badge." />
            </div>
            <div className="profile-sound-controls">
              <label>
                <span><strong>Volume du son</strong><small>{Math.round(soundVolume * 100)} %</small></span>
                <input type="range" min="0.1" max="1" step="0.05" value={soundVolume} onChange={(event) => updateSoundVolume(event.target.value)} disabled={!messageSounds} />
              </label>
              <button type="button" onClick={testSound} disabled={!messageSounds || soundTestStatus === 'testing'}>
                <Volume2 size={17} /> {soundTestStatus === 'testing' ? 'Test en cours…' : 'Tester le son'}
              </button>
              {!messageSounds && <p>Activez « Sons des messages » pour effectuer le test.</p>}
              {soundTestStatus === 'success' && <p className="success">Le son a été joué. Si vous ne l’avez pas entendu, vérifiez le volume de Windows et le mélangeur de volume.</p>}
              {soundTestStatus === 'blocked' && <p className="error">Le navigateur a bloqué l’audio ou votre appareil ne prend pas en charge Web Audio.</p>}
            </div>
          </>
        );

      case 'help':
        return (
          <>
            <ProfilePanelHeader title="Aide et assistance" onBack={() => setProfileSection('home')} />
            <div className="profile-panel-list">
              <ProfileMenuRow icon={HelpCircle} label="Pages d’aide" onClick={() => setProfileSection('help-pages')} />
              <ProfileMenuRow icon={Shield} label="Protection contre les arnaques" onClick={() => setProfileSection('fraud')} />
              <ProfileMenuRow icon={UserCheck} label="Statut du compte" onClick={() => { setAccountStatusBack('help'); setProfileSection('account-status'); }} />
              <ProfileMenuRow icon={LifeBuoy} label="Espace Assistance" description="Contacter un responsable dans Messenger" onClick={startSupportConversation} />
              <ProfileMenuRow icon={AlertTriangle} label="Signaler un problème" description="Décrire le problème avant de contacter un responsable" onClick={openProblemReport} />
            </div>
          </>
        );

      case 'report':
        return (
          <>
            <ProfilePanelHeader title="Signaler un problème" onBack={() => setProfileSection('home')} />
            <p className="profile-panel-description">Expliquez précisément le problème. L’application préparera ensuite un message destiné à un administrateur ou à la direction ; vous choisirez le destinataire avant l’envoi.</p>
            <form className="problem-report-form" onSubmit={submitProblemReport}>
              <label>
                <span>Catégorie</span>
                <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}>
                  <option>Erreur technique</option>
                  <option>Donnée incorrecte</option>
                  <option>Messagerie</option>
                  <option>Accès ou autorisation</option>
                  <option>Autre</option>
                </select>
              </label>
              <label>
                <span>Description</span>
                <textarea value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} rows="6" maxLength="1200" placeholder="Décrivez ce qui s’est passé, ce que vous faisiez et le résultat attendu…" />
                <small>{reportDescription.trim().length}/1200 caractères · 10 minimum</small>
              </label>
              <div className="problem-report-context"><strong>Contexte ajouté automatiquement</strong><span>Rubrique : {menuLabels[activeMenu] || activeMenu}</span><span>Compte : {roleLabel[user?.role] || user?.role}</span></div>
              <button type="submit" disabled={reportDescription.trim().length < 10}>Choisir le destinataire dans Messenger</button>
            </form>
          </>
        );

      case 'help-pages':
        return (
          <>
            <ProfilePanelHeader title="Pages d’aide" onBack={() => setProfileSection('help')} />
            <div className="profile-info-list faq-list">
              <p><strong>Pourquoi une donnée n’apparaît-elle pas ?</strong><span>Vérifiez votre rôle, votre inscription au cours et actualisez la page.</span></p>
              <p><strong>La messagerie ne se connecte pas ?</strong><span>Vérifiez que le projet a été lancé depuis la racine avec <code>npm run dev</code>.</span></p>
              <p><strong>Besoin d’une intervention ?</strong><span>Utilisez « Espace Assistance » pour écrire à un administrateur ou à la direction.</span></p>
            </div>
          </>
        );

      case 'fraud':
        return (
          <>
            <ProfilePanelHeader title="Protection contre les arnaques" onBack={() => setProfileSection('help')} />
            <div className="profile-notice warning"><AlertTriangle size={24} /><div><strong>Ne partagez jamais votre mot de passe</strong><p>L’administration ne doit jamais vous demander votre mot de passe, votre token de session ou le secret WebSocket.</p></div></div>
            <div className="profile-info-list"><p><strong>Message suspect</strong><span>Ne téléchargez pas la pièce jointe et signalez immédiatement la conversation.</span></p><p><strong>Compte compromis</strong><span>Déconnectez-vous puis contactez un administrateur pour révoquer les sessions actives.</span></p></div>
          </>
        );

      case 'account-status':
        return (
          <>
            <ProfilePanelHeader title="Statut du compte" onBack={() => setProfileSection(accountStatusBack)} />
            <div className="account-status-card"><span><UserCheck size={25} /></span><div><strong>Compte actif</strong><p>{user?.name}</p><small>{user?.email || 'Adresse non renseignée'} · {roleLabel[user?.role] || user?.role}</small></div></div>
            <p className="profile-panel-description">Votre session est authentifiée et votre rôle détermine les rubriques auxquelles vous avez accès.</p>
          </>
        );

      default:
        return (
          <>
            <button type="button" className="profile-card" onClick={() => setProfileSection('general-settings')}>
              <span className="profile-card-avatar">{getInitials(user?.name)}</span>
              <span><strong>{user?.name}</strong><small>{roleLabel[user?.role] || user?.role}</small></span>
            </button>
            <div className="profile-panel-list profile-home-list">
              <ProfileMenuRow icon={Settings} label="Paramètres et confidentialité" onClick={() => setProfileSection('settings')} />
              <ProfileMenuRow icon={HelpCircle} label="Aide et assistance" onClick={() => setProfileSection('help')} />
              <ProfileMenuRow icon={Bug} label="Signaler un problème" onClick={openProblemReport} />
              <ProfileMenuRow icon={Eye} label="Affichage et accessibilité" description={darkMode ? 'Mode sombre' : 'Mode clair'} onClick={() => setProfileSection('display')} />
              <ProfileMenuRow icon={LogOut} label="Se déconnecter" onClick={handleLogout} arrow={false} danger />
            </div>
            <p className="profile-legal">Confidentialité · Conditions générales · Sécurité du compte</p>
          </>
        );
    }
  };

  return (
    <header className="topbar app-topbar" ref={topbarRef}>
      {canGoBack && (
        <button
          type="button"
          className="topbar-back-button"
          onClick={goBack}
          aria-label={`Retour à ${menuLabels[previousMenu] || 'la page précédente'}`}
          title={`Retour à ${menuLabels[previousMenu] || 'la page précédente'}`}
        >
          <ArrowLeft size={22} aria-hidden="true" />
          <span>Retour</span>
        </button>
      )}
      <div className="topbar-welcome" title={`${user?.name || 'Utilisateur'} — ${roleLabel[user?.role] || user?.role}`}>
        <strong>Bonjour et bienvenue</strong>
        <span><b>{user?.name || 'Utilisateur'}</b><i aria-hidden="true">•</i> Compte {roleLabel[user?.role] || user?.role}</span>
      </div>
      <div className="topbar-global-tools">
        <div className="topbar-global-search">
          <Search size={18} aria-hidden="true" />
          <input
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            placeholder="Rechercher dans toute l’application…"
            aria-label="Recherche globale"
          />
          {(globalSearchLoading || globalSearch.trim().length >= 2) && (
            <div className="topbar-global-results">
              {globalSearchLoading ? <p>Recherche…</p> : globalResults.length === 0 ? <p>Aucun résultat.</p> : globalResults.map((result) => (
                <button type="button" key={`${result.type}-${result.id}`} onClick={() => openGlobalResult(result)}>
                  <span><strong>{result.title}</strong><small>{result.subtitle}</small></span>
                  <i>{result.type}</i>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="topbar-date-time" title={now.toLocaleString('fr-FR')}>
          <strong>{topbarDate}</strong>
          <span>{topbarTime}</span>
        </div>
      </div>
      <nav className="topbar-actions" aria-label="Raccourcis utilisateur">
        <button
          type="button"
          className={`topbar-icon-button ${openPanel === 'apps' ? 'active' : ''}`}
          onClick={() => togglePanel('apps')}
          aria-label="Applications"
          aria-expanded={openPanel === 'apps'}
          title="Applications"
        >
          <Grid size={22} />
        </button>
        {canUseMessaging && (
          <button
            type="button"
            className={`topbar-icon-button ${openPanel === 'messages' ? 'active' : ''}`}
            onClick={() => togglePanel('messages')}
            aria-label="Discussions"
            aria-expanded={openPanel === 'messages'}
            title="Discussions"
          >
            <MessageCircle size={21} />
            {unreadMessageCount > 0 && <span className="topbar-count">{unreadMessageCount > 99 ? '99+' : unreadMessageCount}</span>}
          </button>
        )}
        <button
          type="button"
          className={`topbar-icon-button ${openPanel === 'notifications' ? 'active' : ''}`}
          onClick={() => togglePanel('notifications')}
          aria-label="Notifications"
          aria-expanded={openPanel === 'notifications'}
          title="Notifications"
        >
          <Bell size={21} />
          {unreadNotificationCount > 0 && <span className="topbar-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
        </button>
        <button
          type="button"
          className={`topbar-profile-button ${openPanel === 'profile' ? 'active' : ''}`}
          onClick={() => togglePanel('profile')}
          aria-label="Menu du compte"
          aria-expanded={openPanel === 'profile'}
          title="Compte"
        >
          <span className="topbar-avatar">{getInitials(user?.name)}</span>
          <span className="topbar-profile-chevron"><ChevronDown size={12} /></span>
        </button>
      </nav>

      {openPanel === 'apps' && (
        <section className="topbar-popover apps-popover" aria-label="Applications">
          <div className="popover-heading">
            <h2>Applications</h2>
            <button type="button" onClick={() => setOpenPanel(null)} aria-label="Fermer"><X size={18} /></button>
          </div>
          <div className="apps-grid">
            {roleApps.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => { setActiveMenu(id); setOpenPanel(null); }}>
                <span><Icon size={22} /></span>
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {canUseMessaging && openPanel === 'messages' && (
        <section className="topbar-popover messenger-popover" aria-label="Aperçu des discussions">
          <div className="popover-heading messenger-heading">
            <h2>Discussions</h2>
            <div>
              <button type="button" onClick={() => openConversation(null)} aria-label="Tout voir dans Messenger" title="Tout voir dans Messenger"><Maximize2 size={19} /></button>
              <button type="button" onClick={startConversation} aria-label="Nouveau message" title="Nouveau message"><Edit3 size={19} /></button>
            </div>
          </div>
          <label className="popover-search">
            <Search size={18} />
            <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Rechercher dans Messenger" />
          </label>
          <div className="popover-tabs">
            <button type="button" className={conversationFilter === 'all' ? 'active' : ''} onClick={() => setConversationFilter('all')}>Tout</button>
            <button type="button" className={conversationFilter === 'unread' ? 'active' : ''} onClick={() => setConversationFilter('unread')}>Non lu</button>
          </div>
          <div className="conversation-preview-list">
            {loadingConversations ? (
              <p className="popover-empty">Chargement...</p>
            ) : filteredConversations.length === 0 ? (
              <p className="popover-empty">Aucune discussion trouvée.</p>
            ) : filteredConversations.map((conversation) => (
              <button type="button" className="conversation-preview" key={conversation.id} onClick={() => openConversation(conversation.id)}>
                <span className="conversation-avatar">{getInitials(conversationTitle(conversation))}</span>
                <span className="conversation-copy">
                  <strong>{conversationTitle(conversation)}</strong>
                  <span>{Number(conversation.last_sender_id) === Number(user?.id) ? 'Vous : ' : ''}{conversation.last_message || 'Aucun message'}</span>
                </span>
                <span className="conversation-meta">
                  <time>{timeAgo(conversation.last_message_at)}</time>
                  {Number(conversation.unread_count || 0) > 0 && <i />}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="popover-footer-action" onClick={() => openConversation(null)}>Tout voir dans Messenger</button>
        </section>
      )}

      {openPanel === 'notifications' && (
        <section className="topbar-popover notification-popover" aria-label="Notifications">
          <div className="popover-heading">
            <h2>Notifications</h2>
            <button type="button" onClick={markAllNotificationsRead} aria-label="Tout marquer comme lu" title="Tout marquer comme lu"><CheckCheck size={20} /></button>
          </div>
          <div className="popover-tabs">
            <button type="button" className={notificationFilter === 'all' ? 'active' : ''} onClick={() => setNotificationFilter('all')}>Tout</button>
            <button type="button" className={notificationFilter === 'unread' ? 'active' : ''} onClick={() => setNotificationFilter('unread')}>Non lu</button>
          </div>
          <div className="notification-section-title">
            <strong>Plus tôt</strong>
            {filteredNotifications.length > 7 && <button type="button" onClick={() => setShowAllNotifications((current) => !current)}>{showAllNotifications ? 'Réduire' : 'Voir tout'}</button>}
          </div>
          <div className="notification-preview-list">
            {loadingNotifications ? (
              <p className="popover-empty">Chargement...</p>
            ) : visibleNotifications.length === 0 ? (
              <p className="popover-empty">Aucune notification.</p>
            ) : visibleNotifications.map((notification) => {
              const Icon = notificationIcon[notification.type] || Bell;
              const unread = isNotificationUnread(notification);
              return (
                <button type="button" className={`notification-preview ${unread ? 'unread' : ''}`} key={notification.id} onClick={() => handleNotification(notification)}>
                  <span className={`notification-symbol ${notification.type}`}><Icon size={19} /></span>
                  <span className="notification-copy">
                    <span><strong>{notification.title}</strong> {notification.message}</span>
                    <time>{timeAgo(notification.created_at)}</time>
                  </span>
                  {unread && <i />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {openPanel === 'profile' && (
        <section className={`topbar-popover profile-popover ${profileSection === 'home' ? '' : 'profile-detail-popover'}`} aria-label="Menu du compte">
          <div className="profile-panel-scroll">{renderProfileContent()}</div>
        </section>
      )}
          <LogoutConfirmModal
        open={logoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={confirmLogout}
      />
</header>
  );
};

export default TopBar;
