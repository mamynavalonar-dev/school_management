import React, { useEffect, useState } from 'react';
import {
  Activity,
  Briefcase,
  Check,
  Clock3,
  Database,
  GraduationCap,
  HardDrive,
  Layers,
  RefreshCw,
  Server,
  ShieldCheck,
  Table2,
  Type,
  UserCheck,
  Users,
} from 'lucide-react';
import { getAdminStats, getAdminSystemInfo, getAdminUserStats } from '../../services/api';
import ChartBar from '../shared/ChartBar';
import ChartLine from '../shared/ChartLine';

const AdminDashboard = ({
  onNavigateToUsers,
  fontScale = 1.1,
  onFontScaleChange,
  fontWeight = 500,
  onFontWeightChange,
}) => {
  const [stats, setStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [systemLoading, setSystemLoading] = useState(true);
  const [systemError, setSystemError] = useState(null);

  const loadSystemInfo = async () => {
    try {
      setSystemLoading(true);
      setSystemError(null);
      setSystemInfo(await getAdminSystemInfo());
    } catch (err) {
      console.error('Failed to load system information:', err);
      setSystemError('Les informations système sont momentanément indisponibles.');
    } finally {
      setSystemLoading(false);
    }
  };

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        // NOTE : getAdminStats() et getAdminUserStats() (services/api.js)
        // renvoient déjà directement les données (res.data ?? res), pas
        // l'enveloppe { success, data }. Pas de .success à vérifier ici :
        // une vraie erreur passe par le catch plus bas.
        const [statsData, userStatsData] = await Promise.all([
          getAdminStats(),
          getAdminUserStats(),
        ]);

        setStats(statsData);
        setUserStats(userStatsData);
      } catch (err) {
        console.error('Failed to load admin stats:', err);
        setError('Impossible de charger les données du tableau de bord.');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    loadSystemInfo();
  }, []);

  // Helper function to convert objects to chart data format
  const objToChartData = (obj) => {
    if (!obj) return [];
    return Object.entries(obj).map(([label, value]) => ({
      label,
      value: Number(value)
    }));
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Tableau de bord administrateur</h2>
        <div className="space-y-4">
          <div className="animate-pulse bg-gray-200 rounded-lg h-96"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-64"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-48"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4 text-red-600">Erreur</h2>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  // NOTE : le backend (admin_stats.php -> getDashboardStats) renvoie
  // { total_users, users_by_role, users_by_status, recent_users_week, active_today },
  // et pas { users: { total, active }, roles: { admin, teacher } }.
  // users_by_role / users_by_status sont des objets clé -> nombre,
  // ex: { student: 120, teacher: 24, admin: 3, directeur: 5 }.
  const totalUsers = stats?.total_users ?? 0;
  const activeUsers = stats?.users_by_status?.active ?? 0;
  const adminCount = stats?.users_by_role?.admin ?? 0;
  const teacherCount = stats?.users_by_role?.teacher ?? 0;
  const directeurCount = stats?.users_by_role?.directeur ?? 0;
  const systemItems = systemInfo ? [
    { label: 'Base de données', value: systemInfo.database_name, detail: systemInfo.database_status === 'connected' ? 'Connectée' : systemInfo.database_status, icon: Database, healthy: systemInfo.database_status === 'connected' },
    { label: 'Version MySQL', value: systemInfo.database_version, icon: Layers },
    { label: 'Taille de la base', value: `${systemInfo.database_size_mb ?? 0} Mo`, icon: HardDrive },
    { label: 'Tables', value: systemInfo.table_count, detail: `${systemInfo.migration_count ?? 0} migration(s) appliquée(s)`, icon: Table2 },
    { label: 'PHP', value: systemInfo.php_version, detail: `Mémoire : ${systemInfo.memory_limit}`, icon: Server },
    { label: 'Serveur', value: systemInfo.server_software, detail: `Upload max : ${systemInfo.upload_max_filesize}`, icon: Activity },
    { label: 'Heure serveur UTC', value: systemInfo.server_time_utc, icon: Clock3 },
  ] : [];

  const fontScaleOptions = [
    { value: 1, label: 'Standard', percent: '100 %' },
    { value: 1.1, label: 'Confort', percent: '110 %' },
    { value: 1.2, label: 'Grand', percent: '120 %' },
    { value: 1.3, label: 'Très grand', percent: '130 %' },
  ];
  const fontWeightOptions = [
    { value: 400, label: 'Normal' },
    { value: 500, label: 'Medium' },
    { value: 600, label: 'Semi-gras' },
    { value: 700, label: 'Gras' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Tableau de bord administrateur
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-3">
          Vue d'ensemble du système de gestion universitaire
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Users */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Utilisateurs totaux
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {totalUsers}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900" title="Ensemble des utilisateurs">
              <Users className="h-7 w-7 text-blue-600 dark:text-blue-400" strokeWidth={2.2} aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Comptes actifs
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {activeUsers}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900" title="Comptes autorisés à se connecter">
              <UserCheck className="h-7 w-7 text-green-600 dark:text-green-400" strokeWidth={2.2} aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Admins */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Administrateurs
              </p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {adminCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900" title="Comptes administrateurs">
              <ShieldCheck className="h-7 w-7 text-purple-600 dark:text-purple-400" strokeWidth={2.2} aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Directeurs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Directeurs
              </p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                {directeurCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900" title="Comptes de direction">
              <Briefcase className="h-7 w-7 text-indigo-600 dark:text-indigo-400" strokeWidth={2.2} aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Teachers */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Enseignants
              </p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                {teacherCount}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900" title="Comptes enseignants">
              <GraduationCap className="h-7 w-7 text-orange-600 dark:text-orange-400" strokeWidth={2.2} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity / Quick Actions and Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: User Management and System Info */}
        <div className="space-y-6">
          {/* User Management */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Gestion des utilisateurs
              </h3>
              <button
                onClick={() => onNavigateToUsers && onNavigateToUsers()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Voir tous les utilisateurs
              </button>
            </div>

            {/* Quick stats from userStats */}
            {!loading && userStats && (
              <div className="p-4 space-y-3">
                {userStats.growth_last_30_days && userStats.growth_last_30_days.length > 0 && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <p className="font-medium mb-1">Croissance des utilisateurs (30 derniers jours):</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {userStats.growth_last_30_days.slice(-5).map((week, index) => (
                        <li key={index}>
                          Semaine {week.week} de l'année {week.year}: <span className="font-medium">{week.count}</span> nouveaux utilisateurs
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {userStats.role_distribution && userStats.role_distribution.length > 0 && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <p className="font-medium mb-1">Répartition des rôles:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {userStats.role_distribution.map((role, index) => (
                        <li key={index}>
                          {role.role.charAt(0).toUpperCase() + role.role.slice(1)}:
                          <span className="font-medium">{role.count}</span>
                          <span className="text-gray-500 dark:text-gray-500">({role.percentage}%)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* System Info */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Système d’information
              </h3>
              <button type="button" onClick={loadSystemInfo} disabled={systemLoading} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 disabled:opacity-50">
                <RefreshCw size={17} className={systemLoading ? 'animate-spin' : ''} /> Actualiser
              </button>
            </div>
            <div className="p-4">
              {systemLoading && !systemInfo ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse"><span className="h-20 rounded-lg bg-gray-200 dark:bg-gray-700" /><span className="h-20 rounded-lg bg-gray-200 dark:bg-gray-700" /></div>
              ) : systemError && !systemInfo ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><p>{systemError}</p><button type="button" className="mt-2 font-semibold underline" onClick={loadSystemInfo}>Réessayer</button></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {systemItems.map(({ label, value, detail, icon: Icon, healthy }) => (
                    <div key={label} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><Icon size={19} /></span>
                      <span className="min-w-0 flex-1"><small className="block text-gray-500 dark:text-gray-400">{label}</small><strong className="block break-words text-gray-900 dark:text-white">{value ?? 'Non disponible'}</strong>{detail && <small className={`block ${healthy ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>{healthy && <Check size={13} className="mr-1 inline" />}{detail}</small>}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="flex items-center gap-3 p-4 border-b dark:border-gray-700">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"><Type size={20} /></span>
              <div><h3 className="text-xl font-semibold text-gray-900 dark:text-white">Lisibilité de l’interface</h3><p className="text-sm text-gray-500 dark:text-gray-400">Réglage enregistré sur cet appareil et appliqué à toute l’application.</p></div>
            </div>
            <div className="space-y-5 p-4">
              <fieldset>
                <legend className="mb-2 font-semibold text-gray-900 dark:text-white">Taille du texte</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {fontScaleOptions.map((option) => (
                    <button type="button" key={option.value} onClick={() => onFontScaleChange?.(option.value)} className={`rounded-lg border p-3 text-left transition ${fontScale === option.value ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-300' : 'border-gray-200 hover:border-blue-300 dark:border-gray-700'}`}>
                      <strong className="block">{option.label}</strong><small>{option.percent}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 font-semibold text-gray-900 dark:text-white">Épaisseur du texte</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {fontWeightOptions.map((option) => (
                    <button type="button" key={option.value} onClick={() => onFontWeightChange?.(option.value)} className={`rounded-lg border p-3 transition ${fontWeight === option.value ? 'border-purple-600 bg-purple-50 text-purple-700 ring-2 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-300' : 'border-gray-200 hover:border-purple-300 dark:border-gray-700'}`} style={{ fontWeight: option.value }}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="rounded-lg bg-gray-50 p-4 text-gray-800 dark:bg-gray-900/50 dark:text-gray-100"><small className="block text-gray-500 dark:text-gray-400">Aperçu</small><p className="mt-1" style={{ fontWeight }}>Le texte doit rester confortable, clair et facile à lire pendant plusieurs heures.</p></div>
            </div>
          </div>
        </div>

        {/* Right column: Charts */}
        <div className="space-y-6">
          {/* Role Distribution Chart */}
          {stats?.users_by_role && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b dark:border-gray-700">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Répartition des rôles
                </h3>
              </div>
              <div className="p-6">
                <ChartBar
                  data={objToChartData(stats.users_by_role)}
                  height={200}
                  xLabel="Rôle"
                  yLabel="Nombre"
                />
              </div>
            </div>
          )}

          {/* Status Distribution Chart */}
          {stats?.users_by_status && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b dark:border-gray-700">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Répartition par statut
                </h3>
              </div>
              <div className="p-6">
                <ChartBar
                  data={objToChartData(stats.users_by_status)}
                  height={200}
                  xLabel="Statut"
                  yLabel="Nombre"
                />
              </div>
            </div>
          )}

          {/* User Growth Chart */}
          {userStats?.growth_last_30_days && userStats.growth_last_30_days.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-6 py-4 border-b dark:border-gray-700">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Croissance des utilisateurs (30 derniers jours)
                </h3>
              </div>
              <div className="p-6">
                <ChartLine
                  data={userStats.growth_last_30_days.map((point) => ({
                    x: `Sem ${point.week}`,
                    y: point.count
                  }))}
                  height={200}
                  color="#3b82f6"
                  xLabel="Semaine"
                  yLabel="Nouveaux utilisateurs"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
