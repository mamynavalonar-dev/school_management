// src/components/Dashboard/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { Users, UserCheck, Book, Building, Calendar, ClipboardList, GraduationCap, UserX, Activity, Clock, AlertTriangle } from 'lucide-react';
import {
  getStats,
  getActivities,
  getUpcoming,
  apiService
} from '../../services/api';
import ChartLine from '../shared/ChartLine';
import ChartBar from '../shared/ChartBar';
import LoadingSpinner from '../shared/LoadingSpinner';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking');

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);
    
    try {
      // VÃ©rifier d'abord la connexion au backend
      const isBackendConnected = await apiService.checkBackendConnection();
      setBackendStatus(isBackendConnected ? 'connected' : 'disconnected');
      
      const [statsData, activitiesData, upcomingData] = await Promise.all([
        getStats(),
        getActivities(),
        getUpcoming(),
      ]);
      
      setStats(statsData);
      setActivities(Array.isArray(activitiesData) ? activitiesData : []);
      setUpcoming(Array.isArray(upcomingData) ? upcomingData : []);
      
    } catch (err) {
      console.error('Dashboard data error:', err);
      setError(err.message || 'Erreur lors du chargement des donnÃ©es');
      
      // Charger les donnÃ©es mockÃ©es en cas d'erreur
      setBackendStatus('disconnected');
      const statsData = await getStats();
      const activitiesData = await getActivities();
      const upcomingData = await getUpcoming();
      
      setStats(statsData);
      setActivities(Array.isArray(activitiesData) ? activitiesData : []);
      setUpcoming(Array.isArray(upcomingData) ? upcomingData : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSpinner size="lg" text="Chargement du tableau de bord..." />
      </div>
    );
  }

  const StatCard = ({ icon: Icon, title, value, change, color = 'blue' }) => (
    <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-lg p-6 shadow-sm border dark:border-gray-700 border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {change && (
            <p className={`text-sm ${change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
              {change}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-${color}-100 dark:bg-${color}-900`}>
          <Icon className={`w-6 h-6 text-${color}-600 dark:text-${color}-400`} />
        </div>
      </div>
    </div>
  );

  const ActivityItem = ({ activity }) => (
    <div className="flex items-start space-x-3 py-3">
      <div className={`p-2 rounded-full ${
        activity.type === 'grade' ? 'bg-green-100 text-green-600' :
        activity.type === 'absence' ? 'bg-red-100 text-red-600' :
        'bg-blue-100 text-blue-600'
      }`}>
        <Activity className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {activity.description}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {activity.user} â€¢ {new Date(activity.time).toLocaleDateString('fr-FR')}
        </p>
      </div>
    </div>
  );

  const UpcomingItem = ({ item }) => (
    <div className="flex items-center space-x-3 py-3 border dark:border-gray-700-b border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700 last:border dark:border-gray-700-0">
      <div className={`p-2 rounded-full ${
        item.type === 'exam' ? 'bg-red-100 text-red-600' :
        item.type === 'meeting' ? 'bg-blue-100 text-blue-600' :
        'bg-orange-100 text-orange-600'
      }`}>
        <Clock className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {item.title}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {new Date(item.date).toLocaleDateString('fr-FR')} Ã  {item.time}
        </p>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* En-tÃªte avec statut backend */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tableau de Bord</h1>
          <p className="text-gray-600 dark:text-gray-400 dark:text-gray-400 mt-1">
            Vue d'ensemble de l'Ã©tablissement
          </p>
        </div>
        {backendStatus === 'disconnected' && (
          <div className="flex items-center space-x-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900 border dark:border-gray-700 border dark:border-gray-700-yellow-300 dark:border dark:border-gray-700-yellow-700 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              Mode dÃ©mo - DonnÃ©es simulÃ©es
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900 border dark:border-gray-700 border dark:border-gray-700-red-200 dark:border dark:border-gray-700-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-red-800 dark:text-red-200">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Statistiques */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={Users}
            title="Ã‰tudiants"
            value={stats.students?.total || 0}
            change={`${stats.students?.new || 0} nouveaux`}
            color="blue"
          />
          <StatCard
            icon={UserCheck}
            title="Enseignants"
            value={stats.teachers?.total || 0}
            change={`${stats.teachers?.active || 0} actifs`}
            color="green"
          />
          <StatCard
            icon={Book}
            title="Cours"
            value={stats.courses?.total || 0}
            change={`${stats.courses?.active || 0} actifs`}
            color="purple"
          />
          <StatCard
            icon={Building}
            title="Salles"
            value={stats.rooms?.total || 0}
            change={`${stats.rooms?.available || 0} disponibles`}
            color="orange"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ActivitÃ©s rÃ©centes */}
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700">
          <div className="p-6 border dark:border-gray-700-b border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              ActivitÃ©s RÃ©centes
            </h2>
          </div>
          <div className="p-6">
            {activities.length > 0 ? (
              <div className="space-y-2">
                {activities.slice(0, 5).map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                Aucune activitÃ© rÃ©cente
              </p>
            )}
          </div>
        </div>

        {/* Ã‰vÃ©nements Ã  venir */}
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700">
          <div className="p-6 border dark:border-gray-700-b border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Ã‰vÃ©nements Ã  Venir
            </h2>
          </div>
          <div className="p-6">
            {upcoming.length > 0 ? (
              <div>
                {upcoming.slice(0, 5).map((item) => (
                  <UpcomingItem key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                Aucun Ã©vÃ©nement Ã  venir
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Graphiques supplÃ©mentaires */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Ã‰volution des inscriptions
          </h3>
          <ChartLine
            data={[
              { x: 'Jan', y: 120 },
              { x: 'FÃ©v', y: 135 },
              { x: 'Mar', y: 142 },
              { x: 'Avr', y: 148 },
              { x: 'Mai', y: 156 }
            ]}
            color="#3b82f6"
            xLabel="Mois"
            yLabel="Ã‰tudiants"
          />
        </div>
        
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 border dark:border-gray-700-gray-200 dark:border dark:border-gray-700-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            RÃ©partition par spÃ©cialitÃ©
          </h3>
          <ChartBar
            data={[
              { label: 'Info', value: 65 },
              { label: 'Maths', value: 45 },
              { label: 'Physique', value: 32 },
              { label: 'Chimie', value: 14 }
            ]}
            color="#10b981"
            valueSuffix=""
          />
        </div>
      </div>

      {/* Bouton de rechargement */}
      <div className="flex justify-center">
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Actualiser les donnÃ©es
        </button>
      </div>
    </div>
  );
}
