export const getWebSocketUrl = () => {
  const configuredUrl = String(import.meta.env.VITE_WS_URL || '').trim();

  if (configuredUrl) {
    if (/^wss?:\/\//i.test(configuredUrl)) {
      return configuredUrl.replace(/\/$/, '');
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const configuredPath = configuredUrl.startsWith('/') ? configuredUrl : `/${configuredUrl}`;
    return `${protocol}//${window.location.host}${configuredPath}`.replace(/\/$/, '');
  }

  if (window.location.protocol === 'file:') {
    return 'ws://127.0.0.1:3001';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (import.meta.env.DEV) {
    const host = window.location.hostname || '127.0.0.1';
    return `${protocol}//${host}:3001`;
  }

  return `${protocol}//${window.location.host}/ws`;
};
