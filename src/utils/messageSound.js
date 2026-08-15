const SOUND_ENABLED_KEY = 'messenger_message_sounds';
const SOUND_VOLUME_KEY = 'messenger_sound_volume';
const LAST_SOUND_EVENT_KEY = 'messenger_last_sound_event';

let sharedAudioContext = null;

const getAudioContext = () => {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') return sharedAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedAudioContext = new AudioContextClass();
  return sharedAudioContext;
};

const getConfiguredVolume = () => {
  const stored = Number(localStorage.getItem(SOUND_VOLUME_KEY));
  return Number.isFinite(stored) && stored >= 0.1 && stored <= 1 ? stored : 0.65;
};

const claimSoundEvent = (eventKey) => {
  if (!eventKey) return true;
  const now = Date.now();
  try {
    const previous = JSON.parse(localStorage.getItem(LAST_SOUND_EVENT_KEY) || 'null');
    if (previous?.key === String(eventKey) && now - Number(previous.playedAt || 0) < 5000) return false;
    localStorage.setItem(LAST_SOUND_EVENT_KEY, JSON.stringify({ key: String(eventKey), playedAt: now }));
  } catch {
    // Le son reste utilisable si le stockage local est indisponible.
  }
  return true;
};

export const isMessageSoundEnabled = () => localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';

export const unlockMessageSound = async () => {
  try {
    const context = getAudioContext();
    if (!context) return { played: false, reason: 'unsupported' };
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running'
      ? { played: true, reason: null }
      : { played: false, reason: 'blocked' };
  } catch {
    return { played: false, reason: 'blocked' };
  }
};

export const installMessageSoundUnlock = () => {
  let removed = false;
  const removeListeners = () => {
    if (removed) return;
    removed = true;
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  const unlock = () => {
    unlockMessageSound().then((result) => {
      if (result.played) removeListeners();
    });
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  return removeListeners;
};

export const playMessageSound = async ({ force = false, eventKey = null } = {}) => {
  if (!force && !isMessageSoundEnabled()) return { played: false, reason: 'disabled' };

  const unlocked = await unlockMessageSound();
  if (!unlocked.played) return unlocked;
  if (!claimSoundEvent(eventKey)) return { played: false, reason: 'duplicate' };

  try {
    const context = getAudioContext();
    if (!context) return { played: false, reason: 'unsupported' };

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.09 * getConfiguredVolume(), now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    master.connect(context.destination);

    const firstTone = context.createOscillator();
    firstTone.type = 'sine';
    firstTone.frequency.setValueAtTime(660, now);
    firstTone.connect(master);
    firstTone.start(now);
    firstTone.stop(now + 0.15);

    const secondTone = context.createOscillator();
    secondTone.type = 'sine';
    secondTone.frequency.setValueAtTime(880, now + 0.12);
    secondTone.connect(master);
    secondTone.start(now + 0.12);
    secondTone.stop(now + 0.34);

    window.setTimeout(() => {
      firstTone.disconnect();
      secondTone.disconnect();
      master.disconnect();
    }, 500);

    return { played: true, reason: null };
  } catch {
    return { played: false, reason: 'error' };
  }
};

export const setMessageSoundVolume = (volume) => {
  const normalized = Math.min(1, Math.max(0.1, Number(volume) || 0.65));
  localStorage.setItem(SOUND_VOLUME_KEY, String(normalized));
  return normalized;
};

export const getMessageSoundVolume = getConfiguredVolume;
