// src/context/UiContext.jsx
import { createContext, useContext, useMemo, useState } from 'react';

const UiContext = createContext(null);

export const UiProvider = ({ children }) => {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [intent, setIntent] = useState(null); 
  // intent: { target: 'students'|'planning'|'evaluations'|'grades', action: 'add'|'view', payload?: any }

  const value = useMemo(() => ({
    activeMenu,
    setActiveMenu,
    intent,
    setIntent,
    goTo: (menuId, nextIntent = null) => {
      setActiveMenu(menuId);
      setIntent(nextIntent);
    },
    clearIntent: () => setIntent(null),
  }), [activeMenu, intent]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
};

export const useUi = () => {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
};