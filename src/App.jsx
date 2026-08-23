import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import { useNotifications } from './hooks/useNotifications';
import NotificationsContainer from './components/NotificationsContainer';
import { useUi } from './context/UiContext';
import './App.css';
import { useApp } from './context/AppContext';
import TopBar from './components/TopBar/TopBar';
import { installMessageSoundUnlock } from './utils/messageSound';
import { canViewFeature } from './utils/permissions';
import apiService from './services/api';

const Students = lazy(() => import('./components/Students/Students'));
const Teachers = lazy(() => import('./components/Teachers/Teachers'));
const Courses = lazy(() => import('./components/Courses/Courses'));
const Rooms = lazy(() => import('./components/Rooms/Rooms'));
const Planning = lazy(() => import('./components/Planning/Planning'));
const Evaluations = lazy(() => import('./components/Evaluations/Evaluations'));
const Grades = lazy(() => import('./components/Grades/Grades'));
const Absences = lazy(() => import('./components/Absences/Absences'));
const SchoolOperations = lazy(() => import('./components/SchoolOperations/SchoolOperations'));
const Payroll = lazy(() => import('./components/Payroll/Payroll'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard'));
const DirectorDashboard = lazy(() => import('./components/Director/DirectorDashboard'));
const TeacherDashboard = lazy(() => import('./components/Teacher/TeacherDashboard'));
const StudentDashboard = lazy(() => import('./components/Student/StudentDashboard'));
const UserManagement = lazy(() => import('./components/Admin/UserManagement'));
const Trash = lazy(() => import('./components/Admin/Trash'));
const ReferenceDashboard = lazy(() => import('./components/Admin/References/ReferenceDashboard'));
const Messaging = lazy(() => import('./components/Messaging/Messaging'));
const ChatManager = lazy(() => import('./components/Messaging/ChatManager'));
const Landing = lazy(() => import('./components/Landing/Landing'));
const Auth = lazy(() => import('./components/Auth/Auth'));

const ROLE_DEFAULT_MENU = {
  admin: 'admin-dashboard',
  directeur: 'director-dashboard',
  teacher: 'teacher-dashboard',
  student: 'student-dashboard',
};

const AppLoading = () => (
  <div className="min-h-[20rem] grid place-items-center" role="status" aria-live="polite">
    <span className="h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" aria-hidden="true" />
    <span className="sr-only">Chargement…</span>
  </div>
);

function App() {
  const { activeMenu, setActiveMenu, replaceActiveMenu } = useUi();
  const { user, sessionChecked, setUser } = useApp();
  const [appState, setAppState] = useState('landing');
  const [systemDarkMode, setSystemDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [themeMode, setThemeMode] = useState(() => {
    const savedMode = localStorage.getItem('school_theme_mode');
    if (['light', 'dark', 'system'].includes(savedMode)) return savedMode;
    const legacyTheme = localStorage.getItem('theme');
    return legacyTheme === 'dark' || legacyTheme === 'light' ? legacyTheme : 'system';
  });
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('school_compact_mode') === 'true');
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('school_reduce_motion') === 'true');
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('school_high_contrast') === 'true');
  const [fontScale, setFontScale] = useState(() => {
    const saved = Number(localStorage.getItem('school_font_scale'));
    return [1, 1.1, 1.2, 1.3].includes(saved) ? saved : 1.1;
  });
  const [fontWeight, setFontWeight] = useState(() => {
    const saved = Number(localStorage.getItem('school_font_weight'));
    return [400, 500, 600, 700].includes(saved) ? saved : 500;
  });
  const { notifications, removeNotification } = useNotifications();

  const darkMode = themeMode === 'system' ? systemDarkMode : themeMode === 'dark';

  const demoAutoLoginStarted = useRef(false);

  useEffect(() => installMessageSoundUnlock(), []);

  useEffect(() => {
    if (!sessionChecked || user || demoAutoLoginStarted.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') !== '1') return;

    demoAutoLoginStarted.current = true;
    apiService.loginDemo()
      .then((response) => {
        if (!response?.success || !response?.data) {
          throw new Error(response?.message || 'Démo indisponible');
        }
        const userData = { ...response.data };
        delete userData.token;
        delete userData.csrf_token;
        setUser(userData);
      })
      .catch((error) => {
        console.error('Connexion démo automatique impossible:', error);
        setAppState('auth');
      });
  }, [sessionChecked, user, setUser]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemTheme = (event) => setSystemDarkMode(event.matches);
    setSystemDarkMode(media.matches);
    media.addEventListener?.('change', handleSystemTheme);
    return () => media.removeEventListener?.('change', handleSystemTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem('school_theme_mode', themeMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode, themeMode]);

  useEffect(() => {
    localStorage.setItem('school_compact_mode', String(compactMode));
    document.documentElement.classList.toggle('compact', compactMode);
  }, [compactMode]);

  useEffect(() => {
    localStorage.setItem('school_reduce_motion', String(reduceMotion));
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    localStorage.setItem('school_high_contrast', String(highContrast));
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);

  useEffect(() => {
    localStorage.setItem('school_font_scale', String(fontScale));
    document.documentElement.dataset.fontScale = String(Math.round(fontScale * 100));

    // Tailwind exprime ses tailles de texte en rem en supposant une racine à
    // 16 px, alors que l'application historique utilise 10 px pour ses
    // dimensions. On agrandit donc uniquement la typographie Tailwind : la
    // sidebar, ses icônes et les autres dimensions restent parfaitement fixes.
    const textSizes = {
      xs: 1.2,
      sm: 1.4,
      base: 1.6,
      lg: 1.8,
      xl: 2,
      '2xl': 2.4,
      '3xl': 3,
      '4xl': 3.6,
    };

    Object.entries(textSizes).forEach(([name, size]) => {
      document.documentElement.style.setProperty(`--app-text-${name}`, `${size * fontScale}rem`);
    });

    // Les éléments flottants doivent grandir avec leur contenu. Sans cette
    // échelle géométrique, le texte accessible déborde d'une fenêtre restée
    // à sa petite taille initiale.
    document.documentElement.style.setProperty('--app-topbar-title-size', `${2 * fontScale}rem`);
    document.documentElement.style.setProperty('--app-topbar-subtitle-size', `${1.5 * fontScale}rem`);
    document.documentElement.style.setProperty('--floating-chat-width', `${42 * fontScale}rem`);
    document.documentElement.style.setProperty('--floating-compose-height', `${52 * fontScale}rem`);
    document.documentElement.style.setProperty('--floating-conversation-height', `${55 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-text-xs', `${1.4 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-text-sm', `${1.7 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-text-base', `${1.9 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-text-lg', `${2.2 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-text-xl', `${2.7 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-text-title', `${3.2 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-avatar-size', `${6 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-avatar-compact-size', `${5.2 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-avatar-large-size', `${11 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-contact-avatar-size', `${5.6 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-control-size', `${4.8 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-list-column', `${38 * fontScale}rem`);
    document.documentElement.style.setProperty('--messenger-details-column', `${42 * fontScale}rem`);
  }, [fontScale]);

  useEffect(() => {
    localStorage.setItem('school_font_weight', String(fontWeight));
    document.documentElement.dataset.fontWeight = String(fontWeight);
    document.documentElement.style.setProperty('--app-base-font-weight', String(fontWeight));
  }, [fontWeight]);

  const hasSetDefaultMenu = useRef(false);
  useEffect(() => {
    if (user) {
      setAppState('dashboard');
      if (!hasSetDefaultMenu.current) {
        hasSetDefaultMenu.current = true;
        replaceActiveMenu(user?.is_demo ? 'dashboard' : (ROLE_DEFAULT_MENU[user.role] ?? 'dashboard'));
      }
    } else if (appState === 'dashboard') {
      setAppState('auth');
      hasSetDefaultMenu.current = false;
    }
  }, [user, appState, replaceActiveMenu]);

  const renderActiveComponent = () => {
    const protectedFeature = ['students', 'teachers', 'courses', 'rooms', 'planning', 'evaluations', 'grades', 'absences', 'school-operations', 'messaging', 'payroll', 'admin-users', 'admin-references'].includes(activeMenu)
      ? activeMenu
      : null;
    if (protectedFeature && !canViewFeature(user, protectedFeature)) {
      return <section className="p-8 max-w-3xl"><div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-6"><h1 className="text-3xl font-bold mb-2">Accès non autorisé</h1><p>Cette fonctionnalité a été désactivée pour votre compte. Contactez la direction si cet accès est nécessaire.</p></div></section>;
    }
    switch (activeMenu) {
      case 'dashboard':
        if (user?.is_demo) return <Dashboard />;
        if (user?.role === 'teacher') return <TeacherDashboard />;
        if (user?.role === 'student') return <StudentDashboard />;
        return <Dashboard />;
      case 'students': return <Students />;
      case 'teachers': return <Teachers />;
      case 'courses': return <Courses />;
      case 'rooms': return <Rooms />;
      case 'planning': return <Planning />;
      case 'evaluations': return <Evaluations />;
      case 'grades': return <Grades />;
      case 'absences': return <Absences />;
      case 'school-operations': return <SchoolOperations />;
      case 'payroll': return <Payroll />;
      case 'admin-dashboard': return (
        <AdminDashboard
          onNavigateToUsers={() => setActiveMenu('admin-users')}
          fontScale={fontScale}
          onFontScaleChange={setFontScale}
          fontWeight={fontWeight}
          onFontWeightChange={setFontWeight}
        />
      );
      case 'admin-users': return <UserManagement />;
      case 'trash': return ['admin', 'directeur'].includes(user?.role) ? <Trash /> : <section className="p-8"><h1 className="text-3xl font-bold">Accès non autorisé</h1></section>;
      case 'admin-references': return <ReferenceDashboard />;
      case 'messaging': return <Messaging />;
      case 'director-dashboard': return <DirectorDashboard />;
      case 'teacher-dashboard': return <TeacherDashboard />;
      case 'student-dashboard': return <StudentDashboard />;
      default: return <Dashboard />;
    }
  };

  if (!sessionChecked) return null;

  if (user) {
    return (
      <div className={`app ${darkMode ? 'dark' : ''}`}>
        {user?.is_demo && (
          <div className="public-demo-badge" role="status">
            Mode démo publique · lecture seule
          </div>
        )}
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
        <TopBar
          darkMode={darkMode}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          compactMode={compactMode}
          onCompactModeChange={setCompactMode}
          reduceMotion={reduceMotion}
          onReduceMotionChange={setReduceMotion}
          highContrast={highContrast}
          onHighContrastChange={setHighContrast}
        />
        <main className={`main-content ${activeMenu === 'messaging' ? 'messaging-main-content' : ''}`}>
          <Suspense fallback={<AppLoading />}>{renderActiveComponent()}</Suspense>
        </main>

        {/* La page Messenger complète remplace les mini-fenêtres pendant sa consultation. */}
        {activeMenu !== 'messaging' && canViewFeature(user, 'messaging') && <Suspense fallback={null}><ChatManager /></Suspense>}

        <NotificationsContainer
          notifications={notifications}
          removeNotification={removeNotification}
        />
      </div>
    );
  }

  if (appState === 'auth') return <Suspense fallback={<AppLoading />}><Auth onBack={() => setAppState('landing')} /></Suspense>;
  return <Suspense fallback={<AppLoading />}><Landing onStart={() => setAppState('auth')} /></Suspense>;
}

export default App;
