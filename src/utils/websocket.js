export const getWebSocketUrl = () => {
  const configuredUrl = String(import.meta.env.VITE_WS_URL || '').trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  const isSecure = window.location.protocol === 'https:';
  const host = window.location.protocol === 'file:'
    ? '127.0.0.1'
    : (window.location.hostname || '127.0.0.1');

  return `${isSecure ? 'wss' : 'ws'}://${host}:3001`;
};
