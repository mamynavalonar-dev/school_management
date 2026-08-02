import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const NotificationToast = ({ notification, onRemove }) => {
  const { id, type, message, duration } = notification;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onRemove(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, id, onRemove]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getStyles = () => {
    const baseStyles = "flex items-center p-4 mb-3 rounded-lg shadow-lg border dark:border-gray-700-l-4 max-w-md";
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-50 border dark:border-gray-700-green-400 text-green-800`;
      case 'error':
        return `${baseStyles} bg-red-50 border dark:border-gray-700-red-400 text-red-800`;
      case 'warning':
        return `${baseStyles} bg-yellow-50 border dark:border-gray-700-yellow-400 text-yellow-800`;
      default:
        return `${baseStyles} bg-blue-50 border dark:border-gray-700-blue-400 text-blue-800`;
    }
  };

  return (
    <div className={getStyles()}>
      <div className="flex-shrink-0 mr-3">
        {getIcon()}
      </div>
      <div className="flex-1 text-sm font-medium">
        {message}
      </div>
      <button
        onClick={() => onRemove(id)}
        className="flex-shrink-0 ml-3 hover:opacity-70"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default NotificationToast;


