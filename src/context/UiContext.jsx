// src/context/UiContext.jsx
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const UiContext = createContext(null);

export const UiProvider = ({ children }) => {
  const [activeMenu, setActiveMenuState] = useState('dashboard');
  const [menuHistory, setMenuHistory] = useState([]);
  const activeMenuRef = useRef('dashboard');
  const menuHistoryRef = useRef([]);
  const [intent, setIntent] = useState(null); 
  const [messengerConversationId, setMessengerConversationId] = useState(null);
  const [messengerComposeRequest, setMessengerComposeRequest] = useState(null);
  // intent: { target: 'students'|'planning'|'evaluations'|'grades', action: 'add'|'view', payload?: any }

  const setActiveMenu = useCallback((nextMenuOrUpdater) => {
    const currentMenu = activeMenuRef.current;
    const nextMenu = typeof nextMenuOrUpdater === 'function'
      ? nextMenuOrUpdater(currentMenu)
      : nextMenuOrUpdater;
    if (!nextMenu || nextMenu === currentMenu) return;
    const nextHistory = [...menuHistoryRef.current, currentMenu].slice(-30);
    menuHistoryRef.current = nextHistory;
    activeMenuRef.current = nextMenu;
    setMenuHistory(nextHistory);
    setActiveMenuState(nextMenu);
  }, []);

  const replaceActiveMenu = useCallback((menuId) => {
    activeMenuRef.current = menuId;
    menuHistoryRef.current = [];
    setActiveMenuState(menuId);
    setMenuHistory([]);
    setIntent(null);
  }, []);

  const goBack = useCallback(() => {
    const history = menuHistoryRef.current;
    if (history.length === 0) return;
    const previousMenu = history[history.length - 1];
    const nextHistory = history.slice(0, -1);
    activeMenuRef.current = previousMenu;
    menuHistoryRef.current = nextHistory;
    setActiveMenuState(previousMenu);
    setMenuHistory(nextHistory);
    setIntent(null);
  }, []);

  const goTo = useCallback((menuId, nextIntent = null) => {
    setActiveMenu(menuId);
    setIntent(nextIntent);
  }, [setActiveMenu]);

  const openMessenger = useCallback((conversationId = null, composeRequest = null) => {
    setMessengerConversationId(conversationId ? Number(conversationId) : null);
    setMessengerComposeRequest(composeRequest);
    setActiveMenu('messaging');
  }, [setActiveMenu]);

  const value = useMemo(() => ({
    activeMenu,
    setActiveMenu,
    replaceActiveMenu,
    canGoBack: menuHistory.length > 0,
    previousMenu: menuHistory[menuHistory.length - 1] ?? null,
    goBack,
    intent,
    setIntent,
    messengerConversationId,
    setMessengerConversationId,
    messengerComposeRequest,
    setMessengerComposeRequest,
    goTo,
    openMessenger,
    clearMessengerComposeRequest: () => setMessengerComposeRequest(null),
    clearIntent: () => setIntent(null),
  }), [activeMenu, goBack, goTo, intent, menuHistory, messengerComposeRequest, messengerConversationId, openMessenger, replaceActiveMenu, setActiveMenu]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
};

export const useUi = () => {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
};
