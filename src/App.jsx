import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import Students from './components/Students/Students';
import Teachers from './components/Teachers/Teachers';
import Courses from './components/Courses/Courses';
import Rooms from './components/Rooms/Rooms';
import Planning from './components/Planning/Planning';
import Evaluations from './components/Evaluations/Evaluations';
import Grades from './components/Grades/Grades';
import Absences from './components/Absences/Absences';
import Dashboard from './components/Dashboard/Dashboard';
import { useNotifications } from './hooks/useNotifications';
import NotificationsContainer from './components/NotificationsContainer';
import { useUi } from './context/UiContext';
import './App.css';
import { Moon, Sun } from 'lucide-react';
import { useApp } from './context/AppContext';
import Landing from './components/Landing/Landing';
import Auth from './components/Auth/Auth';

function App() {
  const { activeMenu, setActiveMenu } = useUi();
  const { user } = useApp();
  const [appState, setAppState] = useState('landing');

  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const { notifications, removeNotification } = useNotifications();

  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    document.documentElement.className = darkMode ? 'dark' : '';
  }, [darkMode]);

  useEffect(() => {
    if (user) {
      setAppState('dashboard');
    } else if (appState === 'dashboard') {
      setAppState('auth');
    }
  }, [user, appState]);

  const renderActiveComponent = () => {
    switch (activeMenu) {
      case 'dashboard': return <Dashboard />;
      case 'students': return <Students />;
      case 'teachers': return <Teachers />;
      case 'courses': return <Courses />;
      case 'rooms': return <Rooms />;
      case 'planning': return <Planning />;
      case 'evaluations': return <Evaluations />;
      case 'grades': return <Grades />;
      case 'absences': return <Absences />;
      default: return <Dashboard />;
    }
  };

  if (appState === 'landing') {
    return <Landing onStart={() => setAppState('auth')} />;
  }
  
  if (appState === 'auth' && !user) {
    return <Auth />;
  }

  if (appState !== 'dashboard' || !user) {
    return null; 
  }

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />

      <div className="topbar">
        <button
          className="theme-toggle-btn"
          onClick={() => setDarkMode(!darkMode)}
          aria-label="Basculer le thème"
          title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      <main className="main-content">
        {renderActiveComponent()}
      </main>

      <NotificationsContainer
        notifications={notifications}
        removeNotification={removeNotification}
      />
    </div>
  );
}

export default App;

