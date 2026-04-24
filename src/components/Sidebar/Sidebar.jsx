import { useState, useRef, useEffect } from 'react';
import {
  Home, Users, UserCheck, Book, Building, Calendar,
  ClipboardList, GraduationCap, UserX, ChevronRight, LogOut
} from 'lucide-react';
import './Sidebar.css';
import Grid3X3 from "../Grid3X3";
import { useApp } from '../../context/AppContext'; // AJOUT

const Sidebar = ({ activeMenu, setActiveMenu }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRefs = useRef({});
  const indicatorRef = useRef(null);
  const { logout } = useApp(); // AJOUT

  const menuItems = [
    { id: 'dashboard', icon: Home, label: 'Tableau de bord' },
    { id: 'students', icon: Users, label: 'Ã‰tudiants' },
    { id: 'teachers', icon: UserCheck, label: 'Enseignants' },
    { id: 'courses', icon: Book, label: 'Cours / MatiÃ¨res' },
    { id: 'rooms', icon: Building, label: 'Salles' },
    { id: 'planning', icon: Calendar, label: 'Planification' },
    { id: 'evaluations', icon: ClipboardList, label: 'Ã‰valuations' },
    { id: 'grades', icon: GraduationCap, label: 'Notes' },
    { id: 'absences', icon: UserX, label: 'Absences' },
  ];

  useEffect(() => {
    const activeMenuItem = menuRefs.current[activeMenu];
    const indicator = indicatorRef.current;
    
    if (activeMenuItem && indicator) {
      const offsetTop = activeMenuItem.offsetTop;
      indicator.style.transform = `translateY(${offsetTop}px)`;
    }
  }, [activeMenu]);

  const handleMenuClick = (menuId) => {
    setActiveMenu(menuId);
  };

  const handleLogout = () => {
    if (window.confirm('ÃŠtes-vous sÃ»r de vouloir vous dÃ©connecter ?')) {
      logout();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'active' : ''}`}>
      <button
        className="toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'RÃ©duire la barre latÃ©rale' : 'Ouvrir la barre latÃ©rale'}
      >
        <ChevronRight size={20} />
      </button>
      
      <div className="sidebar-content">
        <ul className="list">
          <li className="item logo" aria-hidden>
            <a href="#" onClick={(e) => e.preventDefault()}>
              <div className="icon"><Grid3X3 size={28} /></div>
              <p className="text">Tableau de bord</p>
            </a>
          </li>
          
          <div className="menu-list">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.id;
              return (
                <li
                  key={item.id}
                  ref={(el) => menuRefs.current[item.id] = el}
                  className={`item ${isActive ? 'active' : ''}`}
                  onClick={() => handleMenuClick(item.id)}
                >
                  <a href="#" onClick={(e) => e.preventDefault()}>
                    <div className="icon"><Icon size={24} /></div>
                    <p className="text">{item.label}</p>
                  </a>
                </li>
              );
            })}
            <div className="indicator" ref={indicatorRef}></div>
          </div>
        </ul>
      </div>

      <button className="deconnexion" onClick={handleLogout}>
        <div className="sign"><LogOut size={17} /></div>
        <div className="text">DÃ©connexion</div>
      </button>
    </aside>
  );
};

export default Sidebar;
