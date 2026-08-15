import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban, Bell, BellOff, CheckCheck, ChevronDown, ChevronLeft,
  Clock3, Download, Eye, FileText, Flag, Info, Image, Lock,
  XCircle, Maximize2, Mic, MicOff, Minimize2, MoreHorizontal, Paperclip, Phone, Pin, PinOff, Search,
  PhoneOff, Send, ShieldAlert, ShieldCheck, Smile, UserCircle, UserX, Video, VideoOff, Volume2, X,
  Edit3,
} from 'lucide-react';
import {
  createConversation, downloadMessageAttachment, getConversationCalls, getConversationDetails,
  getConversations, getMessages, getPinnedMessages, pinConversationMessage,
  recordConversationCallEvent, reportConversation, requestWsTicket, sendMessage, sendMessageWithAttachment,
  unpinConversationMessage, updateConversationSetting,
} from '../../services/api';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import NewMessagePanel from './NewMessagePanel';
import UserPresenceBadge from './UserPresenceBadge';
import { formatLastSeen } from '../../utils/presence';
import { playMessageSound } from '../../utils/messageSound';
import { getWebSocketUrl } from '../../utils/websocket';
import './Messaging.css';

const RECONNECT_DELAY_MS = 3000;
const ICE_GATHERING_TIMEOUT_MS = 5000;
const WEBRTC_ICE_SERVERS = [
  { urls: import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL ? [{
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME || '',
    credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
  }] : []),
];

const DEFAULT_CONVERSATION_DETAILS = {
  is_muted: false,
  read_receipts_enabled: true,
  allow_messages: true,
  ephemeral_seconds: null,
  is_restricted: false,
  is_blocked: false,
  blocked_by_other: false,
  messages_refused_by_other: false,
  can_send: true,
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
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} j` : `${Math.floor(days / 7)} sem.`;
};

const formatCallDuration = (secondsValue) => {
  const seconds = Math.max(0, Number(secondsValue) || 0);
  if (seconds < 60) return `${seconds || 1} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};

const formatCallTimer = (secondsValue) => {
  const total = Math.max(0, Number(secondsValue) || 0);
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const seconds = Math.floor(total % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const titleForConversation = (conversation) => (
  (conversation?.participants || []).map((participant) => participant.name).join(', ') || 'Conversation'
);

const mergeMessages = (current, incoming) => {
  const byId = new Map();
  [...current, ...incoming].forEach((message) => byId.set(Number(message.id), message));
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
};

const waitForIceGathering = (peerConnection) => new Promise((resolve) => {
  if (peerConnection.iceGatheringState === 'complete') {
    resolve();
    return;
  }
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    peerConnection.removeEventListener('icegatheringstatechange', handleChange);
    resolve();
  };
  const handleChange = () => {
    if (peerConnection.iceGatheringState === 'complete') finish();
  };
  peerConnection.addEventListener('icegatheringstatechange', handleChange);
  window.setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
});

const presenceForConversation = (conversation, presenceByUser) => {
  const participants = conversation?.participants || [];
  const states = participants.map((participant) => {
    const realtime = presenceByUser[Number(participant.id)] || {};
    return {
      isOnline: Boolean(realtime.isOnline),
      lastSeenAt: realtime.lastSeenAt ?? participant.last_seen_at ?? null,
    };
  });
  if (states.some((state) => state.isOnline)) return { isOnline: true, lastSeenAt: null };
  const latest = states.map((state) => state.lastSeenAt).filter(Boolean)
    .sort((a, b) => (parseServerDate(b)?.getTime() || 0) - (parseServerDate(a)?.getTime() || 0))[0] || null;
  return { isOnline: false, lastSeenAt: latest };
};

const Messaging = () => {
  const { user } = useApp();
  const {
    messengerConversationId,
    setMessengerConversationId,
    messengerComposeRequest,
    clearMessengerComposeRequest,
  } = useUi();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(messengerConversationId || null);
  const [messages, setMessages] = useState([]);
  const [conversationCalls, setConversationCalls] = useState([]);
  const [presenceByUser, setPresenceByUser] = useState({});
  const [conversationSearch, setConversationSearch] = useState('');
  const [conversationFilter, setConversationFilter] = useState('all');
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [showConversationDetails, setShowConversationDetails] = useState(true);
  const [isNarrowLayout, setIsNarrowLayout] = useState(() => window.matchMedia('(max-width: 1120px)').matches);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messageSounds, setMessageSounds] = useState(() => localStorage.getItem('messenger_message_sounds') !== 'false');
  const [autoOpenMessages, setAutoOpenMessages] = useState(() => localStorage.getItem('messenger_auto_open') !== 'false');
  const [soundTestStatus, setSoundTestStatus] = useState(null);
  const [composeRequest, setComposeRequest] = useState(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [newMessageText, setNewMessageText] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState({ info: true, customize: false, files: true, privacy: true });
  const [conversationDetails, setConversationDetails] = useState(DEFAULT_CONVERSATION_DETAILS);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportStatus, setReportStatus] = useState(null);
  const [callState, setCallState] = useState(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [cameraDisabled, setCameraDisabled] = useState(false);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const activeConversationIdRef = useRef(activeConversationId);
  const conversationsRef = useRef(conversations);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageRefs = useRef(new Map());
  const wsRef = useRef(null);
  const callStateRef = useRef(null);
  const callSignalHandlerRef = useRef(() => {});
  const endCallRef = useRef(() => {});
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteMediaRef = useRef(null);

  const activeConversation = conversations.find((conversation) => Number(conversation.id) === Number(activeConversationId)) || null;
  const activeTitle = titleForConversation(activeConversation);
  const activePresence = presenceForConversation(activeConversation, presenceByUser);
  const detailsExpanded = isNarrowLayout ? showMobileDetails : showConversationDetails;

  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1120px)');
    const updateLayout = (event) => setIsNarrowLayout(event.matches);
    setIsNarrowLayout(media.matches);
    media.addEventListener?.('change', updateLayout);
    return () => media.removeEventListener?.('change', updateLayout);
  }, []);

  useEffect(() => {
    const syncPreferences = () => {
      setMessageSounds(localStorage.getItem('messenger_message_sounds') !== 'false');
      setAutoOpenMessages(localStorage.getItem('messenger_auto_open') !== 'false');
    };
    window.addEventListener('school:messenger-preferences', syncPreferences);
    return () => window.removeEventListener('school:messenger-preferences', syncPreferences);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const list = await getConversations();
      setConversations(list || []);
      setError(null);
      return list || [];
    } catch (loadError) {
      console.error('Failed to load conversations:', loadError);
      setError('Impossible de charger les conversations.');
      return [];
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      setLoadingMessages(true);
      const list = await getMessages(conversationId);
      setMessages(list || []);
      setConversations((current) => current.map((conversation) => (
        Number(conversation.id) === Number(conversationId)
          ? { ...conversation, unread_count: 0 }
          : conversation
      )));
      setError(null);
      window.dispatchEvent(new CustomEvent('school:messaging-updated'));
    } catch (loadError) {
      console.error('Failed to load messages:', loadError);
      setError('Impossible de charger les messages.');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const loadConversationDetails = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const details = await getConversationDetails(conversationId);
      setConversationDetails({ ...DEFAULT_CONVERSATION_DETAILS, ...(details || {}) });
    } catch (loadError) {
      console.error('Failed to load conversation details:', loadError);
      setConversationDetails(DEFAULT_CONVERSATION_DETAILS);
    }
  }, []);

  const loadPins = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      setPinnedMessages(await getPinnedMessages(conversationId) || []);
    } catch (loadError) {
      console.error('Failed to load pinned messages:', loadError);
      setPinnedMessages([]);
    }
  }, []);

  const loadCalls = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      setConversationCalls(await getConversationCalls(conversationId) || []);
    } catch (loadError) {
      console.error('Failed to load conversation calls:', loadError);
      setConversationCalls([]);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!messengerConversationId) return;
    setActiveConversationId(Number(messengerConversationId));
  }, [messengerConversationId]);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
      loadConversationDetails(activeConversationId);
      loadPins(activeConversationId);
      loadCalls(activeConversationId);
      setReportOpen(false);
      setReportStatus(null);
    } else {
      setMessages([]);
      setPinnedMessages([]);
      setConversationCalls([]);
      setConversationDetails(DEFAULT_CONVERSATION_DETAILS);
    }
  }, [activeConversationId, loadCalls, loadConversationDetails, loadMessages, loadPins]);

  useEffect(() => {
    const openComposer = (event) => {
      setComposeRequest(event.detail || null);
      setIsComposerOpen(true);
    };
    window.addEventListener('school:messenger-compose', openComposer);
    return () => window.removeEventListener('school:messenger-compose', openComposer);
  }, []);

  useEffect(() => {
    if (!messengerComposeRequest) return;
    setComposeRequest(messengerComposeRequest);
    setIsComposerOpen(true);
    clearMessengerComposeRequest();
  }, [clearMessengerComposeRequest, messengerComposeRequest]);

  useEffect(() => {
    let cancelled = false;
    let ws = null;
    let reconnectTimer = null;

    const connect = async () => {
      if (cancelled) return;
      setConnectionStatus('connecting');
      try {
        const ticket = await requestWsTicket();
        if (cancelled) return;
        ws = new WebSocket(`${getWebSocketUrl()}?ticket=${encodeURIComponent(ticket)}`);
        wsRef.current = ws;
        ws.onopen = () => !cancelled && setConnectionStatus('connected');
        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'presence_snapshot') {
              const snapshot = {};
              for (const item of payload.users || []) {
                snapshot[Number(item.user_id)] = {
                  isOnline: Boolean(item.is_online),
                  lastSeenAt: item.last_seen_at ?? null,
                };
              }
              setPresenceByUser(snapshot);
            } else if (payload.type === 'presence_update') {
              const presenceUserId = Number(payload.user_id);
              setPresenceByUser((current) => ({
                ...current,
                [presenceUserId]: {
                  isOnline: Boolean(payload.is_online),
                  lastSeenAt: payload.last_seen_at ?? current[presenceUserId]?.lastSeenAt ?? null,
                },
              }));
            } else if (payload.type === 'new_message') {
              const conversationId = Number(payload.conversation_id);
              const conversation = conversationsRef.current.find((item) => Number(item.id) === conversationId);
              if (Number(payload.message?.sender_id) !== Number(user?.id) && !conversation?.is_muted) {
                playMessageSound({ eventKey: `message-${payload.message?.id || conversationId}` });
              }
              if (conversationId === Number(activeConversationIdRef.current)) {
                setMessages((current) => mergeMessages(current, [payload.message]));
                getMessages(conversationId)
                  .then((list) => setMessages((current) => mergeMessages(current, list || [])))
                  .catch((readError) => console.error('Failed to mark active conversation as read:', readError));
              }
              loadConversations();
              window.dispatchEvent(new CustomEvent('school:messaging-updated'));
            } else if (String(payload.type || '').startsWith('call_')) {
              callSignalHandlerRef.current(payload);
            }
          } catch (payloadError) {
            console.error('Invalid WS payload:', payloadError);
          }
        };
        ws.onclose = () => {
          if (cancelled) return;
          if (wsRef.current === ws) wsRef.current = null;
          setConnectionStatus('disconnected');
          reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
        };
        ws.onerror = () => ws?.close();
      } catch (connectionError) {
        console.error('Messenger websocket error:', connectionError);
        if (!cancelled) {
          setConnectionStatus('disconnected');
          reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
        }
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [loadConversations, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationCalls, messages]);

  const selectConversation = (conversationId) => {
    const id = Number(conversationId);
    setActiveConversationId(id);
    setMessengerConversationId(id);
    setMessageSearch('');
    setShowMessageSearch(false);
    setShowMobileDetails(false);
    setShowConversationDetails(true);
  };

  const toggleConversationDetails = () => {
    if (isNarrowLayout) {
      setShowMobileDetails((current) => !current);
    } else {
      setShowConversationDetails((current) => !current);
    }
  };

  const sendCallSignal = (payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('La connexion temps réel n’est pas prête. Réessayez dans quelques secondes.');
    }
    wsRef.current.send(JSON.stringify(payload));
  };

  const persistCallEvent = async (currentCall, event, extra = {}) => {
    if (!currentCall?.conversationId || !currentCall?.callId) return null;
    try {
      const result = await recordConversationCallEvent(currentCall.conversationId, {
        event,
        client_call_id: currentCall.callId,
        call_kind: currentCall.kind,
        recipient_id: currentCall.peerUserId,
        ...extra,
      });
      await loadCalls(currentCall.conversationId);
      window.dispatchEvent(new CustomEvent('school:messaging-updated'));
      return result;
    } catch (callHistoryError) {
      console.error('Failed to persist call history:', callHistoryError);
      return null;
    }
  };

  const clearCallResources = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    for (const stream of [localStreamRef.current, remoteStreamRef.current]) {
      stream?.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteMediaRef.current) remoteMediaRef.current.srcObject = null;
    callStateRef.current = null;
    setCallState(null);
    setCallMinimized(false);
    setMicrophoneMuted(false);
    setCameraDisabled(false);
    setCallElapsedSeconds(0);
  };

  const markCallActive = () => {
    setCallState((current) => {
      if (!current || current.status === 'active') return current;
      const next = { ...current, status: 'active', connectedAt: Date.now() };
      callStateRef.current = next;
      return next;
    });
  };

  const preparePeerConnection = async (kind) => {
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Ce navigateur ne prend pas en charge les appels WebRTC.');
    }
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' });
    localStreamRef.current = localStream;
    const peerConnection = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
    peerConnectionRef.current = peerConnection;
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) remoteStreamRef.current = stream;
      if (remoteMediaRef.current && stream) remoteMediaRef.current.srcObject = stream;
      markCallActive();
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        markCallActive();
      } else if (['failed', 'closed'].includes(peerConnection.connectionState) && callStateRef.current) {
        persistCallEvent(callStateRef.current, 'failed');
        setError('L’appel a été interrompu par le réseau.');
        clearCallResources();
      }
    };
    return peerConnection;
  };

  const startCall = async (kind) => {
    const participants = activeConversation?.participants || [];
    if (participants.length !== 1) {
      setError('Les appels sont disponibles uniquement dans une conversation privée à deux participants.');
      return;
    }
    if (!activePresence.isOnline) {
      setError(`${participants[0].name} doit être en ligne pour recevoir l’appel.`);
      return;
    }
    if (callStateRef.current) return;
    const nextCall = {
      callId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      conversationId: Number(activeConversationId),
      peerUserId: Number(participants[0].id),
      peerName: participants[0].name,
      kind,
      status: 'starting',
      incoming: false,
    };
    callStateRef.current = nextCall;
    setCallState(nextCall);
    try {
      const peerConnection = await preparePeerConnection(kind);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering(peerConnection);
      const persistedCall = await persistCallEvent(nextCall, 'start');
      if (!persistedCall) throw new Error('Impossible d’enregistrer cet appel.');
      sendCallSignal({
        type: 'call_offer',
        conversation_id: nextCall.conversationId,
        target_user_id: nextCall.peerUserId,
        call_id: nextCall.callId,
        call_kind: kind,
        sdp: peerConnection.localDescription?.sdp,
      });
      setCallState((current) => current ? { ...current, status: 'ringing' } : current);
    } catch (callError) {
      if (callStateRef.current?.callId === nextCall.callId) persistCallEvent(nextCall, 'failed');
      clearCallResources();
      setError(callError.name === 'NotAllowedError'
        ? 'Autorisez le microphone et la caméra dans le navigateur pour démarrer l’appel.'
        : callError.message || 'Impossible de démarrer l’appel.');
    }
  };

  const acceptIncomingCall = async () => {
    const current = callStateRef.current;
    if (!current?.incoming || !current.sdp) return;
    try {
      setCallState((state) => state ? { ...state, status: 'connecting' } : state);
      const peerConnection = await preparePeerConnection(current.kind);
      await peerConnection.setRemoteDescription({ type: 'offer', sdp: current.sdp });
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await waitForIceGathering(peerConnection);
      await persistCallEvent(current, 'answer');
      sendCallSignal({
        type: 'call_answer',
        conversation_id: current.conversationId,
        target_user_id: current.peerUserId,
        call_id: current.callId,
        call_kind: current.kind,
        sdp: peerConnection.localDescription?.sdp,
      });
      setCallState((state) => state ? { ...state, status: 'connecting' } : state);
    } catch (callError) {
      persistCallEvent(current, 'decline');
      try {
        sendCallSignal({ type: 'call_reject', conversation_id: current.conversationId, target_user_id: current.peerUserId, call_id: current.callId, call_kind: current.kind });
      } catch (signalError) {
        console.error('Failed to reject unavailable call:', signalError);
      }
      clearCallResources();
      setError(callError.name === 'NotAllowedError'
        ? 'Autorisez le microphone et la caméra pour accepter l’appel.'
        : callError.message || 'Impossible d’accepter l’appel.');
    }
  };

  const endCall = (reason = 'call_end', historyEvent = null) => {
    const current = callStateRef.current;
    if (current) {
      const event = historyEvent || (reason === 'call_reject'
        ? 'decline'
        : current.status === 'active' || current.status === 'connecting'
          ? 'end'
          : 'cancel');
      persistCallEvent(current, event);
      try {
        sendCallSignal({
          type: reason,
          conversation_id: current.conversationId,
          target_user_id: current.peerUserId,
          call_id: current.callId,
          call_kind: current.kind,
        });
      } catch (signalError) {
        console.error('Failed to send call end:', signalError);
      }
    }
    clearCallResources();
  };
  endCallRef.current = endCall;

  const handleCallSignal = async (payload) => {
    if (payload.type === 'call_offer') {
      if (callStateRef.current) {
        try {
          sendCallSignal({ type: 'call_reject', conversation_id: payload.conversation_id, target_user_id: payload.from_user_id, call_id: payload.call_id, call_kind: payload.call_kind });
        } catch (signalError) {
          console.error('Failed to reject second call:', signalError);
        }
        return;
      }
      const conversationId = Number(payload.conversation_id);
      const conversation = conversationsRef.current.find((item) => Number(item.id) === conversationId);
      const participant = conversation?.participants?.find((item) => Number(item.id) === Number(payload.from_user_id));
      setActiveConversationId(conversationId);
      setMessengerConversationId(conversationId);
      const incomingCall = {
        callId: payload.call_id,
        conversationId,
        peerUserId: Number(payload.from_user_id),
        peerName: participant?.name || 'Un participant',
        kind: payload.call_kind === 'video' ? 'video' : 'audio',
        status: 'incoming',
        incoming: true,
        sdp: payload.sdp,
      };
      callStateRef.current = incomingCall;
      setCallState(incomingCall);
      loadCalls(conversationId);
    } else if (payload.type === 'call_answer') {
      const current = callStateRef.current;
      if (!current || current.callId !== payload.call_id || !peerConnectionRef.current || !payload.sdp) return;
      try {
        await peerConnectionRef.current.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        setCallState((state) => state ? { ...state, status: 'connecting' } : state);
      } catch (answerError) {
        setError('La réponse d’appel reçue est invalide.');
        clearCallResources();
      }
    } else if (payload.type === 'call_reject') {
      if (callStateRef.current?.callId !== payload.call_id) return;
      await persistCallEvent(callStateRef.current, 'decline');
      clearCallResources();
      setError('L’appel a été refusé ou le correspondant est déjà occupé.');
    } else if (payload.type === 'call_end') {
      if (callStateRef.current?.callId !== payload.call_id) return;
      await persistCallEvent(callStateRef.current, callStateRef.current.status === 'active' ? 'end' : 'missed');
      clearCallResources();
    }
  };

  useEffect(() => {
    callSignalHandlerRef.current = handleCallSignal;
  });

  useEffect(() => {
    const rawPendingCall = sessionStorage.getItem('messenger_pending_call');
    if (!rawPendingCall) return;
    sessionStorage.removeItem('messenger_pending_call');
    try {
      const pendingCall = JSON.parse(rawPendingCall);
      window.setTimeout(() => callSignalHandlerRef.current(pendingCall), 0);
    } catch (pendingError) {
      console.error('Invalid pending call:', pendingError);
    }
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteMediaRef.current && remoteStreamRef.current) remoteMediaRef.current.srcObject = remoteStreamRef.current;
  }, [callState]);

  useEffect(() => {
    if (callState?.status !== 'ringing') return undefined;
    const timeout = window.setTimeout(() => {
      endCallRef.current('call_end', 'missed');
      setError('Le correspondant n’a pas répondu à l’appel.');
    }, 30000);
    return () => window.clearTimeout(timeout);
  }, [callState?.callId, callState?.status]);

  useEffect(() => {
    if (callState?.status !== 'active') {
      setCallElapsedSeconds(0);
      return undefined;
    }
    const connectedAt = callState.connectedAt || Date.now();
    const refresh = () => setCallElapsedSeconds(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, [callState?.callId, callState?.connectedAt, callState?.status]);

  useEffect(() => () => clearCallResources(), []);

  const toggleMicrophone = () => {
    const nextMuted = !microphoneMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMicrophoneMuted(nextMuted);
  };

  const toggleCamera = () => {
    const nextDisabled = !cameraDisabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !nextDisabled; });
    setCameraDisabled(nextDisabled);
  };

  const openBlankComposer = () => {
    setComposeRequest(null);
    setIsComposerOpen(true);
  };

  const handleSelectContact = async (contact) => {
    setIsComposerOpen(false);
    const requestedDraft = composeRequest?.prefill || '';
    setComposeRequest(null);
    const existing = conversationsRef.current.find((conversation) => {
      const participants = conversation.participants || [];
      return participants.length === 1 && Number(participants[0].id) === Number(contact.id) && !conversation.course_id;
    });
    if (existing) {
      selectConversation(existing.id);
      if (requestedDraft) setNewMessageText(requestedDraft);
      return;
    }
    try {
      const response = await createConversation({ participantIds: [contact.id] });
      const conversation = {
        id: Number(response.conversation_id),
        participants: [{ ...contact }],
        last_message: null,
        last_message_at: null,
        unread_count: 0,
      };
      setConversations((current) => [conversation, ...current]);
      selectConversation(conversation.id);
      if (requestedDraft) setNewMessageText(requestedDraft);
    } catch (createError) {
      console.error('Failed to create conversation:', createError);
      setError('Impossible de créer cette conversation.');
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (!activeConversationId || (!newMessageText.trim() && !file)) return;
    try {
      setSending(true);
      if (file) {
        await sendMessageWithAttachment(activeConversationId, { body: newMessageText.trim() || null, file });
      } else {
        await sendMessage(activeConversationId, newMessageText.trim());
      }
      setNewMessageText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadMessages(activeConversationId);
      await loadConversations();
    } catch (sendError) {
      setError(sendError.message || "Échec de l'envoi du message.");
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase('fr');
    return conversations.filter((conversation) => {
      const matchesText = !query || titleForConversation(conversation).toLocaleLowerCase('fr').includes(query)
        || String(conversation.last_message || '').toLocaleLowerCase('fr').includes(query);
      const matchesFilter = conversationFilter === 'all' || Number(conversation.unread_count || 0) > 0;
      return matchesText && matchesFilter;
    });
  }, [conversationFilter, conversationSearch, conversations]);

  const timelineItems = useMemo(() => [
    ...messages.map((message) => ({ type: 'message', id: `message-${message.id}`, occurred_at: message.created_at, data: message })),
    ...conversationCalls.map((call) => ({ type: 'call', id: `call-${call.id}`, occurred_at: call.started_at, data: call })),
  ].sort((first, second) => (
    (parseServerDate(first.occurred_at)?.getTime() || 0) - (parseServerDate(second.occurred_at)?.getTime() || 0)
  )), [conversationCalls, messages]);

  const visibleTimeline = useMemo(() => {
    const query = messageSearch.trim().toLocaleLowerCase('fr');
    if (!query) return timelineItems;
    return timelineItems.filter((item) => {
      if (item.type === 'message') return String(item.data.body || '').toLocaleLowerCase('fr').includes(query);
      const callText = `appel ${item.data.call_kind === 'video' ? 'vidéo' : 'vocal'} ${item.data.status}`;
      return callText.toLocaleLowerCase('fr').includes(query);
    });
  }, [messageSearch, timelineItems]);

  const conversationAttachments = useMemo(() => messages.flatMap((message) => (
    (message.attachments || []).map((attachment) => ({
      ...attachment,
      message_id: message.id,
      sender_name: message.sender_name,
      created_at: message.created_at,
    }))
  )), [messages]);
  const mediaAttachments = useMemo(() => conversationAttachments.filter((attachment) => (
    String(attachment.mime_type || '').startsWith('image/')
  )), [conversationAttachments]);
  const fileAttachments = useMemo(() => conversationAttachments.filter((attachment) => (
    !String(attachment.mime_type || '').startsWith('image/')
  )), [conversationAttachments]);
  const muteSelection = useMemo(() => {
    if (!conversationDetails.is_muted || !conversationDetails.muted_until) return 'off';
    const remaining = (parseServerDate(conversationDetails.muted_until)?.getTime() || 0) - Date.now();
    if (remaining <= 5400000) return '1h';
    if (remaining <= 36000000) return '8h';
    if (remaining <= 129600000) return '1d';
    return 'forever';
  }, [conversationDetails.is_muted, conversationDetails.muted_until]);

  const toggleDetails = (key) => setDetailsOpen((current) => ({ ...current, [key]: !current[key] }));
  const isMuted = Boolean(conversationDetails.is_muted);

  const saveConversationSetting = async (setting, value) => {
    if (!activeConversationId || settingsSaving) return;
    try {
      setSettingsSaving(true);
      const details = await updateConversationSetting(activeConversationId, setting, value);
      setConversationDetails({ ...DEFAULT_CONVERSATION_DETAILS, ...(details || {}) });
      await loadConversations();
      setError(null);
    } catch (settingError) {
      setError(settingError.message || 'Impossible d’enregistrer ce réglage.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleMute = () => saveConversationSetting('mute_duration', isMuted ? 'off' : 'forever');

  const handlePinMessage = async (message) => {
    try {
      if (message.is_pinned) await unpinConversationMessage(activeConversationId, message.id);
      else await pinConversationMessage(activeConversationId, message.id);
      await Promise.all([loadMessages(activeConversationId), loadPins(activeConversationId)]);
    } catch (pinError) {
      setError(pinError.message || 'Impossible de modifier l’épingle.');
    }
  };

  const scrollToMessage = (messageId) => {
    const node = messageRefs.current.get(Number(messageId));
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('highlighted');
    window.setTimeout(() => node.classList.remove('highlighted'), 1800);
  };

  const handleDownload = async (attachment) => {
    try {
      await downloadMessageAttachment(attachment.id, attachment.original_name);
    } catch (downloadError) {
      setError(downloadError.message || 'Impossible de télécharger ce fichier.');
    }
  };

  const submitReport = async (event) => {
    event.preventDefault();
    try {
      setReportStatus('sending');
      await reportConversation(activeConversationId, { category: reportCategory, details: reportDetails.trim() });
      setReportStatus('success');
      setReportDetails('');
    } catch (reportError) {
      setReportStatus('error');
      setError(reportError.message || 'Impossible de transmettre le signalement.');
    }
  };

  const toggleMessageSounds = () => {
    const next = !messageSounds;
    setMessageSounds(next);
    localStorage.setItem('messenger_message_sounds', String(next));
    window.dispatchEvent(new CustomEvent('school:messenger-preferences'));
  };

  const testMessageSound = async () => {
    if (!messageSounds) return;
    setSoundTestStatus('testing');
    const result = await playMessageSound({ force: true });
    setSoundTestStatus(result.played ? 'success' : 'blocked');
    window.setTimeout(() => setSoundTestStatus(null), 3500);
  };

  const toggleAutoOpenMessages = () => {
    const next = !autoOpenMessages;
    setAutoOpenMessages(next);
    localStorage.setItem('messenger_auto_open', String(next));
    window.dispatchEvent(new CustomEvent('school:messenger-preferences'));
  };

  return (
    <section className={`messenger-page ${showConversationDetails ? '' : 'details-collapsed'}`}>
      <aside className={`messenger-conversations ${activeConversationId ? 'has-mobile-selection' : ''}`}>
        <div className="messenger-list-header">
          <div>
            <h1>Discussions</h1>
            <button type="button" onClick={() => setIsSettingsOpen((current) => !current)} title="Paramètres des discussions"><MoreHorizontal size={20} /></button>
            <button type="button" onClick={openBlankComposer} title="Nouveau message"><Edit3 size={19} /></button>
          </div>
          <label>
            <Search size={18} />
            <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Rechercher dans Messenger" />
          </label>
          <div className="messenger-list-tabs">
            <button type="button" className={conversationFilter === 'all' ? 'active' : ''} onClick={() => setConversationFilter('all')}>Tout</button>
            <button type="button" className={conversationFilter === 'unread' ? 'active' : ''} onClick={() => setConversationFilter('unread')}>Non lu</button>
          </div>
        </div>
        <div className="messenger-conversation-list">
          {loadingConversations ? (
            <p className="messenger-empty">Chargement...</p>
          ) : filteredConversations.length === 0 ? (
            <div className="messenger-empty"><MessageCircleIcon /><p>Aucune discussion trouvée.</p><button type="button" onClick={openBlankComposer}>Nouveau message</button></div>
          ) : filteredConversations.map((conversation) => {
            const title = titleForConversation(conversation);
            const presence = presenceForConversation(conversation, presenceByUser);
            return (
              <button
                type="button"
                key={conversation.id}
                className={`messenger-conversation-row ${Number(activeConversationId) === Number(conversation.id) ? 'active' : ''}`}
                onClick={() => selectConversation(conversation.id)}
              >
                <span className="messenger-avatar">
                  {getInitials(title)}
                  <UserPresenceBadge presence={presence} />
                </span>
                <span className="messenger-conversation-copy">
                  <strong>{title}</strong>
                  <span>{Number(conversation.last_sender_id) === Number(user?.id) ? 'Vous : ' : ''}{conversation.last_message || 'Aucun message'}</span>
                </span>
                <span className="messenger-conversation-meta">
                  <time>{timeAgo(conversation.last_message_at)}</time>
                  {Number(conversation.unread_count || 0) > 0 && <i>{Number(conversation.unread_count) > 9 ? '9+' : conversation.unread_count}</i>}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className={`messenger-thread ${activeConversation ? 'has-conversation' : ''}`}>
        {!activeConversation ? (
          <div className="messenger-welcome">
            <span><MessageCircleIcon /></span>
            <h2>Vos messages</h2>
            <p>Sélectionnez une discussion ou démarrez une nouvelle conversation.</p>
            <button type="button" onClick={openBlankComposer}>Nouveau message</button>
          </div>
        ) : (
          <>
            <header className="messenger-thread-header">
              <button type="button" className="messenger-mobile-back" onClick={() => { setActiveConversationId(null); setMessengerConversationId(null); }} aria-label="Retour aux discussions"><ChevronLeft size={22} /></button>
              <span className="messenger-avatar compact">
                {getInitials(activeTitle)}
                <UserPresenceBadge presence={activePresence} compact />
              </span>
              <span className="messenger-thread-title">
                <strong>{activeTitle}</strong>
                <small>{activePresence.isOnline ? 'En ligne' : activePresence.lastSeenAt ? `Hors ligne depuis ${formatLastSeen(activePresence.lastSeenAt)}` : 'Hors ligne'}</small>
              </span>
              <span className="messenger-thread-actions">
                <button type="button" onClick={() => startCall('audio')} disabled={Boolean(callState)} title="Démarrer un appel vocal"><Phone size={19} /></button>
                <button type="button" onClick={() => startCall('video')} disabled={Boolean(callState)} title="Démarrer un appel vidéo"><Video size={20} /></button>
                <button type="button" onClick={() => setShowMessageSearch((current) => !current)} className={showMessageSearch ? 'active' : ''} title="Rechercher dans la conversation"><Search size={19} /></button>
                <button
                  type="button"
                  className={`messenger-info-toggle ${detailsExpanded ? 'active' : ''}`}
                  onClick={toggleConversationDetails}
                  title={detailsExpanded ? 'Fermer les informations de la discussion' : 'Ouvrir les informations de la discussion'}
                  aria-label={detailsExpanded ? 'Fermer les informations de la discussion' : 'Ouvrir les informations de la discussion'}
                  aria-expanded={detailsExpanded}
                ><Info size={20} /></button>
              </span>
            </header>
            {showMessageSearch && (
              <label className="messenger-message-search">
                <Search size={17} />
                <input autoFocus value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Rechercher dans cette conversation" />
                <button type="button" onClick={() => { setShowMessageSearch(false); setMessageSearch(''); }}><X size={17} /></button>
              </label>
            )}
            <div className="messenger-message-list">
              {loadingMessages ? (
                <p className="messenger-empty">Chargement des messages...</p>
              ) : visibleTimeline.length === 0 ? (
                <p className="messenger-empty">{messageSearch ? 'Aucun message ne correspond à la recherche.' : 'Commencez la conversation.'}</p>
              ) : visibleTimeline.map((timelineItem) => {
                if (timelineItem.type === 'call') {
                  return <CallTimelineCard key={timelineItem.id} call={timelineItem.data} onRecall={startCall} />;
                }
                const message = timelineItem.data;
                const isMine = Number(message.sender_id) === Number(user?.id);
                return (
                  <article
                    key={timelineItem.id}
                    ref={(node) => {
                      if (node) messageRefs.current.set(Number(message.id), node);
                      else messageRefs.current.delete(Number(message.id));
                    }}
                    className={`messenger-message ${isMine ? 'mine' : 'theirs'} ${message.is_pinned ? 'pinned' : ''}`}
                  >
                    {!isMine && <span className="message-sender-avatar">{getInitials(message.sender_name)}</span>}
                    <div>
                      {!isMine && <small>{message.sender_name}</small>}
                      <button
                        type="button"
                        className="message-pin-action"
                        onClick={() => handlePinMessage(message)}
                        title={message.is_pinned ? 'Désépingler ce message' : 'Épingler ce message'}
                        aria-label={message.is_pinned ? 'Désépingler ce message' : 'Épingler ce message'}
                      >
                        {message.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      {message.body && <p>{message.body}</p>}
                      {(message.attachments || []).map((attachment) => (
                        <button type="button" className="message-attachment" key={attachment.id} onClick={() => handleDownload(attachment)} title="Télécharger">
                          {String(attachment.mime_type || '').startsWith('image/') ? <Image size={15} /> : <FileText size={15} />}
                          <span>{attachment.original_name}</span><Download size={14} />
                        </button>
                      ))}
                      <span className="message-meta">
                        {message.is_pinned && <i><Pin size={11} /> Épinglé</i>}
                        {message.expires_at && <i><Clock3 size={11} /> Éphémère</i>}
                        <time>{parseServerDate(message.created_at)?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || ''}</time>
                        {isMine && conversationDetails.read_receipts_enabled && <i title={message.is_read ? 'Lu' : 'Envoyé'}><CheckCheck size={13} /> {message.is_read ? 'Lu' : 'Envoyé'}</i>}
                      </span>
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {file && <div className="messenger-selected-file"><Paperclip size={14} /><span>{file.name}</span><button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}><X size={14} /></button></div>}
            {!conversationDetails.can_send && <div className="messenger-send-blocked"><XCircle size={15} /> L’envoi est désactivé par les paramètres de cette conversation.</div>}
            <form className="messenger-composer" onSubmit={handleSend}>
              <label title="Joindre un fichier">
                <Paperclip size={20} />
                <input disabled={!conversationDetails.can_send} ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
              <label title="Joindre une image">
                <Image size={20} />
                <input disabled={!conversationDetails.can_send} type="file" accept="image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
              <div>
                <input disabled={!conversationDetails.can_send} value={newMessageText} onChange={(event) => setNewMessageText(event.target.value)} placeholder={conversationDetails.can_send ? 'Aa' : 'Envoi non autorisé'} />
                <Smile size={20} />
              </div>
              <button type="submit" disabled={!conversationDetails.can_send || sending || (!newMessageText.trim() && !file)} aria-label="Envoyer"><Send size={20} /></button>
            </form>
          </>
        )}
      </main>

      <aside className={`messenger-details ${activeConversation ? '' : 'empty'} ${showConversationDetails ? '' : 'desktop-collapsed'} ${showMobileDetails ? 'mobile-open' : ''}`}>
        {activeConversation && (
          <>
            <button type="button" className="messenger-details-mobile-close" onClick={() => setShowMobileDetails(false)} aria-label="Fermer les informations"><X size={20} /></button>
            <div className="messenger-profile-summary">
              <span className="messenger-avatar large">
                {getInitials(activeTitle)}
                <UserPresenceBadge presence={activePresence} />
              </span>
              <h2>{activeTitle}</h2>
              <p>{activePresence.isOnline ? 'En ligne' : activePresence.lastSeenAt ? `Hors ligne depuis ${formatLastSeen(activePresence.lastSeenAt)}` : 'Hors ligne'}</p>
              <div>
                <button type="button" title="Profil"><span><UserCircle size={20} /></span><small>Profil</small></button>
                <button type="button" disabled={settingsSaving} onClick={toggleMute} title={isMuted ? 'Réactiver les notifications' : 'Mettre en sourdine'}><span>{isMuted ? <BellOff size={20} /> : <Bell size={20} />}</span><small>{isMuted ? 'Réactiver' : 'Sourdine'}</small></button>
                <button type="button" onClick={() => setShowMessageSearch(true)} title="Rechercher"><span><Search size={20} /></span><small>Rechercher</small></button>
              </div>
            </div>
            <DetailSection title="Informations sur la discussion" open={detailsOpen.info} onToggle={() => toggleDetails('info')}>
              {activeConversation.course_name ? <p>Cours associé : <strong>{activeConversation.course_name}</strong></p> : <p>Conversation privée</p>}
              <p>{conversationDetails.participant_count || (activeConversation.participants || []).length + 1} participant(s)</p>
              <h3 className="detail-subtitle"><Pin size={15} /> Messages épinglés</h3>
              {pinnedMessages.length === 0 ? (
                <p className="detail-empty">Aucun message épinglé.</p>
              ) : (
                <div className="pinned-message-list">
                  {pinnedMessages.map((message) => (
                    <button type="button" key={message.id} onClick={() => scrollToMessage(message.id)}>
                      <Pin size={14} /><span><strong>{message.sender_name}</strong><small>{message.body || 'Pièce jointe'}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </DetailSection>
            <DetailSection title="Personnaliser la discussion" open={detailsOpen.customize} onToggle={() => toggleDetails('customize')}>
              <p>Les couleurs suivent le thème clair ou sombre de l’application.</p>
            </DetailSection>
            <DetailSection title="Fichiers et contenus multimédias" open={detailsOpen.files} onToggle={() => toggleDetails('files')}>
              <AttachmentGroup title="Contenu multimédia" icon={<Image size={15} />} attachments={mediaAttachments} onDownload={handleDownload} />
              <AttachmentGroup title="Fichiers" icon={<FileText size={15} />} attachments={fileAttachments} onDownload={handleDownload} />
            </DetailSection>
            <DetailSection title="Confidentialité et assistance" open={detailsOpen.privacy} onToggle={() => toggleDetails('privacy')}>
              <ConversationControl
                icon={isMuted ? <BellOff size={18} /> : <Bell size={18} />}
                title="Mettre les notifications en sourdine"
                description={isMuted ? 'Activé pour cette conversation' : 'Les notifications sont actives'}
              >
                <select disabled={settingsSaving} value={muteSelection} onChange={(event) => saveConversationSetting('mute_duration', event.target.value)} aria-label="Durée de sourdine">
                  <option value="off">Non</option><option value="1h">1 heure</option><option value="8h">8 heures</option><option value="1d">24 heures</option><option value="forever">Jusqu’à réactivation</option>
                </select>
              </ConversationControl>
              <ConversationControl icon={<ShieldCheck size={18} />} title="Autorisations de messages" description={conversationDetails.allow_messages ? 'Vous acceptez les messages' : 'Nouveaux messages refusés'}>
                <SwitchControl disabled={settingsSaving} checked={conversationDetails.allow_messages} onChange={(value) => saveConversationSetting('allow_messages', value)} label="Autorisations de messages" />
              </ConversationControl>
              <ConversationControl icon={<Clock3 size={18} />} title="Messages éphémères" description="S’applique aux nouveaux messages envoyés">
                <select disabled={settingsSaving} value={conversationDetails.ephemeral_seconds || 0} onChange={(event) => saveConversationSetting('ephemeral_seconds', Number(event.target.value) || null)} aria-label="Durée des messages éphémères">
                  <option value="0">Désactivés</option><option value="3600">1 heure</option><option value="86400">24 heures</option><option value="604800">7 jours</option>
                </select>
              </ConversationControl>
              <ConversationControl icon={<Eye size={18} />} title="Confirmations de lecture" description={conversationDetails.read_receipts_enabled ? 'Activé — les autres peuvent voir “Lu”' : 'Désactivé'}>
                <SwitchControl disabled={settingsSaving} checked={conversationDetails.read_receipts_enabled} onChange={(value) => saveConversationSetting('read_receipts_enabled', value)} label="Confirmations de lecture" />
              </ConversationControl>
              <ConversationControl icon={<Lock size={18} />} title="Vérifier le chiffrement de bout en bout" description="Non disponible : cette version ne gère pas encore les clés E2E." unavailable />
              <ConversationControl icon={<UserX size={18} />} title="Restreindre" description={conversationDetails.is_restricted ? 'Conversation restreinte et silencieuse' : 'Réduire les interactions sans bloquer'}>
                <SwitchControl disabled={settingsSaving} checked={conversationDetails.is_restricted} onChange={(value) => saveConversationSetting('is_restricted', value)} label="Restreindre" />
              </ConversationControl>
              <ConversationControl danger icon={<Ban size={18} />} title="Bloquer" description={conversationDetails.is_blocked ? 'Vous avez bloqué cette conversation' : 'Empêcher les échanges avec ce contact'}>
                <SwitchControl disabled={settingsSaving} checked={conversationDetails.is_blocked} onChange={(value) => saveConversationSetting('is_blocked', value)} label="Bloquer" />
              </ConversationControl>
              <button type="button" className="conversation-report-trigger" onClick={() => { setReportOpen((current) => !current); setReportStatus(null); }}>
                <Flag size={18} /><span><strong>Signaler</strong><small>Donnez votre avis et signalez la conversation</small></span><ChevronDown size={16} className={reportOpen ? 'open' : ''} />
              </button>
              {reportOpen && (
                <form className="conversation-report-form" onSubmit={submitReport}>
                  <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}>
                    <option value="spam">Spam</option><option value="harassment">Harcèlement</option><option value="inappropriate">Contenu inapproprié</option><option value="impersonation">Usurpation d’identité</option><option value="other">Autre</option>
                  </select>
                  <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1500} placeholder="Précisez le problème (facultatif)" />
                  <button type="submit" disabled={reportStatus === 'sending'}>{reportStatus === 'sending' ? 'Envoi…' : 'Transmettre le signalement'}</button>
                  {reportStatus === 'success' && <small className="success">Signalement transmis à l’administration.</small>}
                </form>
              )}
              <p className="privacy-note"><ShieldAlert size={15} /> Les accès sont contrôlés côté serveur. Le chiffrement E2E sera indiqué comme disponible uniquement lorsqu’une gestion réelle des clés sera installée.</p>
            </DetailSection>
          </>
        )}
      </aside>

      {connectionStatus !== 'connected' && <div className="messenger-connection-state">Connexion temps réel {connectionStatus === 'connecting' ? 'en cours…' : 'interrompue — reconnexion…'}</div>}
      {error && <div className="messenger-error"><span>{error}</span><button type="button" onClick={() => setError(null)}><X size={16} /></button></div>}

      {isSettingsOpen && (
        <section className="messenger-settings-popover" aria-label="Paramètres des discussions">
          <header><div><strong>Paramètres des discussions</strong><small>Personnalisez votre expérience Messenger</small></div><button type="button" onClick={() => setIsSettingsOpen(false)}><X size={17} /></button></header>
          <div className="messenger-setting-row">
            <span><Volume2 size={20} /><span><strong>Sons des messages</strong><small>Jouer un son à la réception.</small></span></span>
            <button type="button" role="switch" aria-checked={messageSounds} className={messageSounds ? 'enabled' : ''} onClick={toggleMessageSounds}><i /></button>
          </div>
          <div className="messenger-sound-test">
            <button type="button" onClick={testMessageSound} disabled={!messageSounds || soundTestStatus === 'testing'}>
              <Volume2 size={16} /> {soundTestStatus === 'testing' ? 'Test en cours…' : 'Tester le son'}
            </button>
            {soundTestStatus === 'success' && <small>Son joué. Vérifiez aussi le volume de Windows.</small>}
            {soundTestStatus === 'blocked' && <small className="error">Audio bloqué ou indisponible dans ce navigateur.</small>}
            {!messageSounds && <small>Activez les sons pour effectuer le test.</small>}
          </div>
          <div className="messenger-setting-row">
            <span><MessageCircleIcon /><span><strong>Afficher les nouveaux messages</strong><small>Ouvrir automatiquement les nouvelles discussions.</small></span></span>
            <button type="button" role="switch" aria-checked={autoOpenMessages} className={autoOpenMessages ? 'enabled' : ''} onClick={toggleAutoOpenMessages}><i /></button>
          </div>
          <div className="messenger-settings-note"><ShieldCheck size={18} /><span><strong>Confidentialité et sécurité</strong><small>Les règles d’accès du projet continuent de protéger chaque conversation.</small></span></div>
        </section>
      )}

      {isComposerOpen && (
        <div className="messenger-compose-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { setIsComposerOpen(false); setComposeRequest(null); } }}>
          <div className="messenger-compose-panel">
            <NewMessagePanel
              onClose={() => { setIsComposerOpen(false); setComposeRequest(null); }}
              onSelectContact={handleSelectContact}
              presenceByUser={presenceByUser}
              title={composeRequest?.title}
              helperText={composeRequest?.helperText}
              allowedRoles={composeRequest?.allowedRoles}
            />
          </div>
        </div>
      )}

      {callState && createPortal(
        <div className={`messenger-call-overlay ${callMinimized ? 'minimized' : ''}`} role="dialog" aria-modal={!callMinimized} aria-label={`Appel ${callState.kind === 'video' ? 'vidéo' : 'vocal'}`}>
          <section className={`messenger-call-panel ${callState.kind} ${callState.status}`}>
            <header className="messenger-call-header">
              <span className="messenger-avatar compact">{getInitials(callState.peerName)}</span>
              <span>
                <strong>{callState.peerName}</strong>
                <small>{callState.status === 'incoming'
                  ? `Appel ${callState.kind === 'video' ? 'vidéo' : 'vocal'} entrant`
                  : callState.status === 'ringing'
                    ? 'Sonnerie…'
                    : callState.status === 'active'
                      ? formatCallTimer(callElapsedSeconds)
                      : 'Connexion…'}</small>
              </span>
              <button type="button" onClick={() => setCallMinimized((current) => !current)} title={callMinimized ? 'Agrandir' : 'Réduire'}>
                {callMinimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
              </button>
            </header>

            <div className="messenger-call-media">
              {callState.kind === 'video' ? (
                <>
                  <video ref={remoteMediaRef} autoPlay playsInline />
                  {callState.status !== 'active' && <div className="call-video-waiting"><span className="messenger-avatar call-avatar">{getInitials(callState.peerName)}</span><p>{callState.status === 'incoming' ? 'Appel vidéo entrant' : 'En attente de la vidéo…'}</p></div>}
                  <video ref={localVideoRef} autoPlay playsInline muted className={`local-video ${cameraDisabled ? 'disabled' : ''}`} />
                </>
              ) : (
                <>
                  <audio ref={remoteMediaRef} autoPlay />
                  <span className="messenger-avatar call-avatar">{getInitials(callState.peerName)}</span>
                  <h2>{callState.peerName}</h2>
                  <p>{callState.status === 'active' ? formatCallTimer(callElapsedSeconds) : callState.status === 'incoming' ? 'vous appelle' : 'appel en cours de connexion'}</p>
                </>
              )}
            </div>

            <div className="messenger-call-actions">
              {callState.status === 'incoming' ? (
                <>
                  <button type="button" className="call-action accept" onClick={acceptIncomingCall} title="Accepter"><span><Phone size={22} /></span><small>Accepter</small></button>
                  <button type="button" className="call-action hangup" onClick={() => endCall('call_reject', 'decline')} title="Refuser"><span><PhoneOff size={22} /></span><small>Refuser</small></button>
                </>
              ) : (
                <>
                  <button type="button" className={`call-action ${microphoneMuted ? 'disabled' : ''}`} onClick={toggleMicrophone} title={microphoneMuted ? 'Activer le microphone' : 'Couper le microphone'}>
                    <span>{microphoneMuted ? <MicOff size={21} /> : <Mic size={21} />}</span><small>Micro</small>
                  </button>
                  {callState.kind === 'video' && (
                    <button type="button" className={`call-action ${cameraDisabled ? 'disabled' : ''}`} onClick={toggleCamera} title={cameraDisabled ? 'Activer la caméra' : 'Couper la caméra'}>
                      <span>{cameraDisabled ? <VideoOff size={21} /> : <Video size={21} />}</span><small>Caméra</small>
                    </button>
                  )}
                  <button type="button" className="call-action hangup" onClick={() => endCall('call_end')} title="Raccrocher"><span><PhoneOff size={22} /></span><small>Raccrocher</small></button>
                </>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
};

const DetailSection = ({ title, open, onToggle, children }) => (
  <section className="messenger-detail-section">
    <button type="button" onClick={onToggle}><strong>{title}</strong><ChevronDown size={18} className={open ? 'open' : ''} /></button>
    {open && <div>{children}</div>}
  </section>
);

const ConversationControl = ({ icon, title, description, children, danger = false, unavailable = false }) => (
  <div className={`conversation-control ${danger ? 'danger' : ''} ${unavailable ? 'unavailable' : ''}`}>
    <span className="conversation-control-icon">{icon}</span>
    <span className="conversation-control-copy"><strong>{title}</strong><small>{description}</small></span>
    {children && <span className="conversation-control-action">{children}</span>}
  </div>
);

const SwitchControl = ({ checked, onChange, label, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    className={`conversation-switch ${checked ? 'enabled' : ''}`}
    onClick={() => onChange(!checked)}
  ><i /></button>
);

const AttachmentGroup = ({ title, icon, attachments, onDownload }) => (
  <div className="attachment-group">
    <h3>{icon}{title}<span>{attachments.length}</span></h3>
    {attachments.length === 0 ? <p className="detail-empty">Aucun élément.</p> : (
      <div className="attachment-list">
        {attachments.map((attachment) => (
          <button type="button" key={attachment.id} onClick={() => onDownload(attachment)} title={`Télécharger ${attachment.original_name}`}>
            <span>{String(attachment.mime_type || '').startsWith('image/') ? <Image size={17} /> : <FileText size={17} />}</span>
            <span><strong>{attachment.original_name}</strong><small>{attachment.sender_name} · {Math.max(1, Math.round(Number(attachment.size_bytes || 0) / 1024))} Ko</small></span>
            <Download size={15} />
          </button>
        ))}
      </div>
    )}
  </div>
);

const CallTimelineCard = ({ call, onRecall }) => {
  const isVideo = call.call_kind === 'video';
  const Icon = isVideo ? Video : Phone;
  const failedStatus = ['missed', 'declined', 'cancelled', 'failed'].includes(call.status);
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
    <article className={`messenger-call-history ${failedStatus ? 'unsuccessful' : ''}`}>
      <div className="call-history-heading">
        <span><Icon size={18} /></span>
        <span>
          <strong>Appel {isVideo ? 'vidéo' : 'vocal'}</strong>
          <small>{statusText} · {call.is_outgoing ? 'sortant' : 'entrant'}</small>
        </span>
        <time>{parseServerDate(call.started_at)?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) || ''}</time>
      </div>
      <button type="button" onClick={() => onRecall(call.call_kind)}><Icon size={16} /> Rappeler</button>
    </article>
  );
};

const MessageCircleIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default Messaging;
