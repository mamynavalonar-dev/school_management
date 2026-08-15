const parseUtcDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatLastSeen = (value, now = Date.now()) => {
  const date = parseUtcDate(value);
  if (!date) return null;

  const elapsedSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  const minutes = Math.max(1, Math.floor(elapsedSeconds / 60));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} j`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} sem`;

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};
