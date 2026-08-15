// src/components/Director/DirectorDashboard.jsx
import React, { useEffect, useState } from 'react';
import { getDirectorDashboard } from '../../services/api';
import ChartBar from '../shared/ChartBar';

const DirectorDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const result = await getDirectorDashboard();
        setData(result);
      } catch (err) {
        console.error('Failed to load director dashboard:', err);
        setError("Impossible de charger le tableau de bord.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Tableau de bord directeur</h2>
        <div className="space-y-4">
          <div className="animate-pulse bg-gray-200 rounded-lg h-32"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-64"></div>
          <div className="animate-pulse bg-gray-200 rounded-lg h-64"></div>
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

  const studentsByLevel = (data.students_by_level || []).map((r) => ({
    label: r.level_name,
    value: Number(r.count),
  }));
  const studentsBySpecialization = (data.students_by_specialization || []).map((r) => ({
    label: r.specialization_name,
    value: Number(r.count),
  }));

  const successRate = data.success_rate?.rate_percent;
  const attendance = data.attendance_last_30_days;
  const unjustifiedRate =
    attendance && attendance.total_absences > 0
      ? Math.round((attendance.unjustified / attendance.total_absences) * 100)
      : null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Tableau de bord directeur
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Vue stratégique — indicateurs agrégés, sans accès aux dossiers individuels
        </p>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KpiCard
          label="Étudiants actifs"
          value={data.total_active_students}
          colorClass="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
        />
        <KpiCard
          label="Enseignants actifs"
          value={data.total_active_teachers}
          colorClass="bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400"
        />
        <KpiCard
          label="Taux de réussite"
          value={successRate !== null && successRate !== undefined ? `${successRate}%` : 'N/A'}
          colorClass="bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
        />
        <KpiCard
          label="Occupation moyenne des salles"
          value={`${data.average_room_utilization ?? 0}%`}
          colorClass="bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* Assiduité */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Assiduité — 30 derniers jours
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{attendance?.total_absences ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Absences totales</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{attendance?.justified ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Justifiées</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{attendance?.unjustified ?? 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Non justifiées {unjustifiedRate !== null ? `(${unjustifiedRate}%)` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Répartitions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Répartition par niveau
          </h3>
          <ChartBar data={studentsByLevel} color="#2563eb" yLabel="Étudiants" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Répartition par spécialisation
          </h3>
          <ChartBar data={studentsBySpecialization} color="#7c3aed" yLabel="Étudiants" />
        </div>
      </div>

      {/* À venir */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Évaluations à venir
        </h3>
        <p className="text-3xl font-bold text-gray-900 dark:text-white">{data.upcoming_evaluations ?? 0}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">planifiées, tous cours confondus</p>
      </div>
    </div>
  );
};

const KpiCard = ({ label, value, colorClass }) => (
  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
    <div className={`inline-block mt-3 px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
      Agrégat institutionnel
    </div>
  </div>
);

export default DirectorDashboard;
