// src/components/Dashboard/Dashboard.jsx
import React, { useEffect, useState } from "react";
import {
  Users,
  UserCheck,
  Book,
  Building,
  Calendar,
  ClipboardList,
  GraduationCap,
  UserX,
  Activity,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  getStats,
  getActivities,
  getUpcoming,
} from "../../services/api";
import ChartLine from "../shared/ChartLine";
import ChartBar from "../shared/ChartBar";
import LoadingSpinner from "../shared/LoadingSpinner";

const statColorClasses = {
  blue: { background: 'bg-blue-100 dark:bg-blue-900', icon: 'text-blue-600 dark:text-blue-400' },
  green: { background: 'bg-green-100 dark:bg-green-900', icon: 'text-green-600 dark:text-green-400' },
  purple: { background: 'bg-purple-100 dark:bg-purple-900', icon: 'text-purple-600 dark:text-purple-400' },
  orange: { background: 'bg-orange-100 dark:bg-orange-900', icon: 'text-orange-600 dark:text-orange-400' },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState("checking");

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);

    try {
      const [statsData, activitiesData, upcomingData] = await Promise.all([
        getStats(),
        getActivities(),
        getUpcoming(),
      ]);

      setStats(statsData);
      setActivities(Array.isArray(activitiesData) ? activitiesData : []);
      setUpcoming(Array.isArray(upcomingData) ? upcomingData : []);
      setBackendStatus("connected");
    } catch (err) {
      console.error("Dashboard data error:", err);
      setError(err.message || "Erreur lors du chargement des données");
      setBackendStatus("disconnected");
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

  const enrollmentTrend = (stats?.enrollment_trend ?? []).map((item) => {
    const date = new Date(`${item.period}-01T00:00:00`);
    return {
      x: Number.isNaN(date.getTime())
        ? item.period
        : new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date),
      y: Number(item.value) || 0,
    };
  });
  const specializationDistribution = (stats?.specialization_distribution ?? []).map((item) => ({
    label: item.label,
    value: Number(item.value) || 0,
  }));

  const StatCard = ({ icon: Icon, title, value, change, color = "blue" }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-400 dark:text-gray-400">
            {title}
          </p>
          <p className="text-4xl font-bold text-gray-900 dark:text-white mt-1">
            {value}
          </p>
          {change && (
            <p
              className="text-xl font-medium text-gray-500 dark:text-gray-400"
            >
              {change}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${statColorClasses[color]?.background || statColorClasses.blue.background}`}>
          <Icon
            className={`w-20 h-20 ${statColorClasses[color]?.icon || statColorClasses.blue.icon}`}
          />
        </div>
      </div>
    </div>
  );

  const ActivityItem = ({ activity }) => (
    <div className="flex items-start space-x-3 py-3">
      <div
        className={`p-2 rounded-full ${
          activity.type === "grade"
            ? "bg-green-100 text-green-600"
            : activity.type === "absence"
              ? "bg-red-100 text-red-600"
              : "bg-blue-100 text-blue-600"
        }`}
      >
        <Activity className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-medium text-gray-900 dark:text-white">
          {activity.description}
        </p>
        <p className="text-xl text-gray-500 dark:text-gray-400">
          {activity.user} .{" "}
          {new Date(activity.time).toLocaleDateString("fr-FR")}
        </p>
      </div>
    </div>
  );

  const UpcomingItem = ({ item }) => (
    <div className="flex items-center space-x-3 py-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
      <div
        className={`p-2 rounded-full ${
          item.type === "exam"
            ? "bg-red-100 text-red-600"
            : item.type === "meeting"
              ? "bg-blue-100 text-blue-600"
              : "bg-orange-100 text-orange-600"
        }`}
      >
        <Clock className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-medium text-gray-900 dark:text-white">
          {item.title}
        </p>
        <p className="text-xl text-gray-500 dark:text-gray-400">
          {new Date(item.date).toLocaleDateString("fr-FR")} à {item.time}
        </p>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* En-tête avec statut backend */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Tableau de Bord
          </h1>
          <p className="text-gray-600 dark:text-gray-400 dark:text-gray-400 mt-1">
            Vue d'ensemble de l'établissement
          </p>
        </div>
        {backendStatus === "disconnected" && (
          <div className="flex items-center space-x-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              Backend indisponible — aucune donnée simulée affichée
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
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
            title="Étudiants"
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
            change={`${stats.courses?.mandatory || 0} obligatoires`}
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
        {/* Activités récentes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
              Activités Récentes
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
                Aucune activité récente
              </p>
            )}
          </div>
        </div>

        {/* Événements à venir */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
              Événements à Venir
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
                Aucun événement à venir
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Graphiques supplémentaires */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Évolution des inscriptions
          </h3>
          <ChartLine
            data={enrollmentTrend}
            color="#3b82f6"
            xLabel="Mois"
            yLabel="Étudiants"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Répartition par spécialité
          </h3>
          <ChartBar
            data={specializationDistribution}
            color="#10b981"
            valueSuffix=""
            xLabel="Spécialité"
            yLabel="Nombre d'étudiants"
          />
        </div>
      </div>

      {/* Bouton de rechargement */}
      <div className="flex justify-center">
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Actualiser les données
        </button>
      </div>
    </div>
  );
}
