import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import { UiProvider } from './context/UiContext.jsx'
import { NotificationsProvider } from './hooks/useNotifications.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppProvider>
    <UiProvider>
      <NotificationsProvider>
        <App />
      </NotificationsProvider>
    </UiProvider>
  </AppProvider>,
)
