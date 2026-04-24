import { useEffect } from 'react';

const NotificationToast = ({ notification, onRemove }) => {
  const { id, type, message, duration } = notification;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onRemove(id);
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [id, duration, onRemove]);

  const getIcon = () => {
    switch (type) {
      case 'success': return 'âœ“';
      case 'error': return 'âœ•';
      case 'warning': return 'âš ';
      case 'info': return 'â„¹';
      default: return 'â„¹';
    }
  };

  return (
    <div className={`notification-toast notification-${type}`}>
      <span className="notification-icon">{getIcon()}</span>
      <span className="notification-message">{message}</span>
      <button 
        className="notification-close"
        onClick={() => onRemove(id)}
        aria-label="Fermer"
      >
        Ã—
      </button>
    </div>
  );
};

export default NotificationToast;
