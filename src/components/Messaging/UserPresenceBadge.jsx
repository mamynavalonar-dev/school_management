import React, { useEffect, useMemo, useState } from 'react';
import { formatLastSeen } from '../../utils/presence';

const UserPresenceBadge = ({ presence, compact = false }) => {
  const isOnline = Boolean(presence?.isOnline ?? presence?.is_online);
  const lastSeenAt = presence?.lastSeenAt ?? presence?.last_seen_at ?? null;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (isOnline || !lastSeenAt) return undefined;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, [isOnline, lastSeenAt]);

  const elapsedLabel = useMemo(() => formatLastSeen(lastSeenAt, now), [lastSeenAt, now]);

  if (isOnline) {
    return (
      <span
        role="status"
        aria-label="En ligne"
        title="En ligne"
        className={`presence-badge ${compact ? 'compact' : 'regular'} absolute bottom-0 right-0 rounded-full bg-emerald-400 border-2 border-white dark:border-gray-900 ${
          compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
        }`}
      />
    );
  }

  if (!elapsedLabel) {
    return (
      <span
        role="status"
        aria-label="Hors ligne"
        title="Hors ligne"
        className={`presence-badge presence-offline ${compact ? 'compact' : 'regular'} absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-gray-900 ${
          compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
        }`}
      />
    );
  }

  return (
    <span
      role="status"
      aria-label={`Hors ligne depuis ${elapsedLabel}`}
      title={`Hors ligne depuis ${elapsedLabel}`}
      className={`presence-badge presence-offline elapsed ${compact ? 'compact' : 'regular'} absolute -bottom-1 -right-2 rounded-full border border-white dark:border-gray-900 font-semibold leading-none whitespace-nowrap shadow-sm ${
        compact ? 'h-3.5 min-w-[24px] px-0.5 text-[8px]' : 'h-4 min-w-[30px] px-1 text-[9px]'
      } flex items-center justify-center`}
    >
      {elapsedLabel}
    </span>
  );
};

export default UserPresenceBadge;
