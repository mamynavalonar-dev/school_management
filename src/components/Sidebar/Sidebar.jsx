import { useLayoutEffect, useRef, useState } from 'react';
import {
  Home, Users, UserCheck, Book, Building, Calendar,
  ClipboardList, GraduationCap, UserX, ChevronRight, LogOut,
  LayoutDashboard, UserCog, Database, School, WalletCards, Trash2
} from 'lucide-react';
import './Sidebar.css';
import Grid3X3 from "../Grid3X3";
import { useApp } from '../../context/AppContext';
import { canViewFeature } from '../../utils/permissions';
import LogoutConfirmModal from '../shared/LogoutConfirmModal';

const Sidebar = ({ activeMenu, setActiveMenu }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const menuListRef = useRef(null);
  const menuRefs = useRef({});
  const indicatorRef = useRef(null);
  const { logout, user } = useApp();

  // Menu items for regular users
  const userMenuItems = [
    { id: 'dashboard', icon: Home, label: 'Tableau de bord' },
    { id: 'students', icon: Users, label: 'Étudiants' },
    { id: 'teachers', icon: UserCheck, label: 'Enseignants' },
    { id: 'courses', icon: Book, label: 'Cours / Matières' },
    { id: 'rooms', icon: Building, label: 'Salles' },
    { id: 'planning', icon: Calendar, label: 'Planification' },
    { id: 'evaluations', icon: ClipboardList, label: 'Évaluations' },
    { id: 'grades', icon: GraduationCap, label: 'Notes' },
    { id: 'absences', icon: UserX, label: 'Absences' },
    { id: 'school-operations', icon: School, label: 'Scolarité' },
  ];

  // Additional menu items for admins only (gestion technique)
  const adminMenuItems = [
    { id: 'admin-dashboard', icon: LayoutDashboard, label: 'Administration' },
    { id: 'payroll', icon: WalletCards, label: 'Paie du personnel' },
    { id: 'admin-users', icon: UserCog, label: 'Utilisateurs' },
    { id: 'admin-references', icon: Database, label: 'Référentiels' },
    { id: 'trash', icon: Trash2, label: 'Corbeille' },
  ];

  // Additional menu items for directeurs only (vue stratégique)
  const directorMenuItems = [
    { id: 'director-dashboard', icon: LayoutDashboard, label: 'Direction' },
  ];

  // Tableau de bord personnel pour les enseignants (vue du jour, alertes)
  const teacherMenuItems = [
    { id: 'teacher-dashboard', icon: LayoutDashboard, label: 'Mon tableau de bord' },
  ];

  // Tableau de bord personnel pour les étudiants (emploi du temps, notes)
  const studentMenuItems = [
    { id: 'student-dashboard', icon: LayoutDashboard, label: 'Mon tableau de bord' },
  ];

  // Combine menus selon le rôle : admin voit le menu technique, directeur et
  // enseignant/étudiant voient en plus leur propre tableau de bord (en tête
  // de liste pour l'enseignant/étudiant puisque c'est leur écran d'accueil).
  let menuItems = [];
  if (user?.is_demo) {
    const demoAccessibleIds = [
      'dashboard', 'students', 'teachers', 'courses', 'rooms',
      'planning', 'evaluations', 'grades', 'absences', 'school-operations',
    ];
    menuItems = userMenuItems.filter(
      (item) => demoAccessibleIds.includes(item.id) && (item.id === 'dashboard' || canViewFeature(user, item.id))
    );
  } else if (user?.role === 'admin') {
    menuItems = [...userMenuItems, ...adminMenuItems];
  } else if (user?.role === 'directeur') {
    // La direction crée et administre également les comptes utilisateurs.
    menuItems = [...userMenuItems, ...directorMenuItems, ...adminMenuItems.filter(item => ['payroll', 'admin-users', 'admin-references', 'trash'].includes(item.id))];
  } else if (user?.role === 'teacher') {
    const teacherAccessibleIds = ['students', 'teachers', 'courses', 'rooms', 'planning', 'evaluations', 'grades', 'absences', 'school-operations'];
    menuItems = [...teacherMenuItems, ...userMenuItems.filter(item => teacherAccessibleIds.includes(item.id) && canViewFeature(user, item.id))];
  } else if (user?.role === 'student') {
    const studentAccessibleIds = ['courses', 'rooms', 'planning', 'evaluations', 'grades', 'absences'];
    menuItems = [...studentMenuItems, ...userMenuItems.filter(item => studentAccessibleIds.includes(item.id) && canViewFeature(user, item.id))];
  }

  useLayoutEffect(() => {
    const list = menuListRef.current;
    const indicator = indicatorRef.current;
    const activeItem = menuRefs.current[activeMenu];
    if (!list || !indicator || !activeItem) {
      indicator?.classList.remove('visible');
      return undefined;
    }

    let animationFrame = 0;
    const syncIndicator = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const isMobileNav = window.matchMedia('(max-width: 760px)').matches;

        if (isMobileNav) {
          // Le CSS possède la taille de l'indicateur. Ne jamais recalculer ici
          // une autre taille en rem : c'était la cause du décentrage mobile.
          indicator.style.removeProperty('width');
          indicator.style.removeProperty('height');

          const listRect = list.getBoundingClientRect();
          const itemRect = activeItem.getBoundingClientRect();
          const indicatorRect = indicator.getBoundingClientRect();
          const indicatorSize = indicatorRect.width || itemRect.width;
          const centeredOffset = (itemRect.left - listRect.left)
            + ((itemRect.width - indicatorSize) / 2);

          indicator.style.transform = `translate3d(${centeredOffset}px, 0, 0)`;
        } else {
          indicator.style.transform = `translate3d(0, ${activeItem.offsetTop}px, 0)`;
          indicator.style.width = '100%';
          indicator.style.height = `${activeItem.offsetHeight}px`;
        }

        indicator.classList.add('visible');
        requestAnimationFrame(() => indicator.classList.add('ready'));
      });
    };

    syncIndicator();
    const resizeObserver = new ResizeObserver(syncIndicator);
    resizeObserver.observe(list);
    resizeObserver.observe(activeItem);
    window.addEventListener('resize', syncIndicator);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncIndicator);
    };
  }, [activeMenu, isOpen, menuItems.length]);

  const handleMenuClick = (menuId) => {
    setActiveMenu(menuId);
  };

  const handleLogout = () => {
    setLogoutConfirmOpen(true);
  };

  const confirmLogout = () => {
    setLogoutConfirmOpen(false);
    logout();
  };

  return (
    <aside className={`sidebar ${isOpen ? 'active' : ''}`}>
      <button
        className="toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Réduire la barre latérale' : 'Ouvrir la barre latérale'}
      >
        <ChevronRight size={20} />
      </button>

      {/* Logo "Tableau de bord" : reste TOUJOURS fixe en haut, ne scrolle jamais */}
      <ul className="list list-fixed-top">
        <li className="item logo" aria-hidden>
          <a href="#" onClick={(e) => e.preventDefault()}>
            <div className="icon"><Grid3X3 size={28} /></div>
            <p className="text">Tableau de bord</p>
          </a>
        </li>
      </ul>

      {/* Seule cette zone scrolle, avec une scrollbar invisible */}
      <div className="sidebar-content">
        <ul className="list menu-list" ref={menuListRef}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;
            return (
              <li
                key={item.id}
                ref={(element) => {
                  if (element) menuRefs.current[item.id] = element;
                  else delete menuRefs.current[item.id];
                }}
                className={`item ${isActive ? 'active' : ''}`}
              >
                <a
                  href={`#${item.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    handleMenuClick(item.id);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={!isOpen ? item.label : undefined}
                >
                  <div className="icon"><Icon size={24} /></div>
                  <p className="text">{item.label}</p>
                </a>
              </li>
            );
          })}
          <li className="sidebar-indicator" ref={indicatorRef} aria-hidden="true" />
        </ul>
      </div>

      <button className="deconnexion" onClick={handleLogout}>
        <div className="sign"><LogOut size={17} /></div>
        <div className="text">Déconnexion</div>
      </button>
          <LogoutConfirmModal
        open={logoutConfirmOpen}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={confirmLogout}
      />
</aside>
  );
};

export default Sidebar;
