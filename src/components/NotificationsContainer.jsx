// src/components/NotificationsContainer.jsx
import NotificationToast from './shared/NotificationToast';

const NotificationsContainer = ({ notifications, removeNotification }) => {
  return (
    <div className="notifications-container">
      {notifications.map(notification => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
        />
      ))}
    </div>
  );
};

export default NotificationsContainer;
