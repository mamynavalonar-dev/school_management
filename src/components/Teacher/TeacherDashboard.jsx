// src/components/Teacher/TeacherDashboard.jsx
import React, { useEffect, useState } from 'react';
import {
  getTeacherDashboard,
  getAlertThresholds,
  saveAlertThreshold,
  deleteAlertThreshold,
} from '../../services/api';
import { FileText } from 'lucide-react';
import CourseResources from '../Courses/CourseResources';

const METRIC_LABELS = {
  average_below: 'Moyenne inférieure à',
  absences_above: "Nombre d'absences non justifiées supérieur à",
};

const TeacherDashboard = () => {
  const [data, setData] = useState(null);
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showThresholdForm, setShowThresholdForm] = useState(false);
  const [selectedCourseForResources, setSelectedCourseForResources] = useState(null);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [overview, thresholdList] = await Promise.all([
        getTeacherDashboard(),
        getAlertThresholds(),
      ]);
      setData(overview);
      setThresholds(thresholdList || []);
    } catch (err) {
      console.error('Failed to load teacher dashboard:', err);
      setError('Impossible de charger le tableau de bord.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDeleteThreshold = async (id) => {
    try {
      await deleteAlertThreshold(id);
      await loadAll();
    } catch (err) {
      console.error('Failed to delete threshold:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Tableau de bord enseignant</h2>
        <div className="space-y-4">
          <div className="animate-pulse bg-gray-200 rounded-lg h-48"></div>
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

  const todaySchedule = data.today_schedule || [];
  const alerts = data.alerts || [];
  const myCourses = data.my_courses || [];
  const access = data.feature_access || {};

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Tableau de bord enseignant
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Votre journée en un coup d'œil</p>
      </div>

      {/* Cours du jour */}
      {access.planning && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Cours d'aujourd'hui
        </h3>
        {todaySchedule.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Aucun cours prévu aujourd'hui.</p>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {todaySchedule.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{s.course_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {s.level_name} · {s.specialization_name} · Salle {s.room_name}
                  </p>
                </div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {s.start_time} – {s.end_time}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Mes cours — accès aux documents/supports (Task #4 "resources") */}
      {access.courses && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Mes cours
        </h3>
        {myCourses.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Aucun cours assigné pour le moment.</p>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {myCourses.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between">
                <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                <button
                  onClick={() => setSelectedCourseForResources(c)}
                  className="text-sm px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1.5"
                >
                  <FileText size={14} /> Documents
                </button>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Alertes étudiants en difficulté */}
      {(access.grades || access.absences) && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Étudiants en difficulté
          </h3>
          <button
            onClick={() => setShowThresholdForm((v) => !v)}
            className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            {showThresholdForm ? 'Fermer' : 'Configurer les seuils'}
          </button>
        </div>

        {showThresholdForm && (
          <ThresholdForm
            courses={myCourses}
            existing={thresholds}
            access={access}
            onSaved={loadAll}
            onDelete={handleDeleteThreshold}
          />
        )}

        {alerts.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Aucune alerte active. {thresholds.length === 0 && 'Configurez un seuil pour en recevoir.'}
          </p>
        ) : (
          <div className="space-y-2 mt-4">
            {alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{a.student_name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {a.course_name} — {METRIC_LABELS[a.type]} {a.threshold}
                  </p>
                </div>
                <span className="text-red-600 dark:text-red-400 font-semibold">{a.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>}

      {selectedCourseForResources && (
        <div className="app-modal-layer bg-black bg-opacity-50">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CourseResources
              courseId={selectedCourseForResources.id}
              courseName={selectedCourseForResources.name}
              onClose={() => setSelectedCourseForResources(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const ThresholdForm = ({ courses, existing, access, onSaved, onDelete }) => {
  const [metric, setMetric] = useState(access.grades ? 'average_below' : 'absences_above');
  const [value, setValue] = useState('');
  const [courseId, setCourseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue)) {
      setFormError('Veuillez saisir une valeur numérique.');
      return;
    }
    if (metric === 'average_below' && (numericValue < 0 || numericValue > 20)) {
      setFormError('Le seuil de moyenne doit être entre 0 et 20.');
      return;
    }

    try {
      setSaving(true);
      await saveAlertThreshold({
        metric,
        threshold_value: numericValue,
        course_id: courseId ? Number(courseId) : undefined,
      });
      setValue('');
      setCourseId('');
      await onSaved();
    } catch (err) {
      setFormError(err.message || "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Métrique
          </label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm dark:bg-gray-800 dark:text-white"
          >
            {access.grades && <option value="average_below">Moyenne inférieure à</option>}
            {access.absences && <option value="absences_above">Absences non justifiées supérieures à</option>}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Seuil
          </label>
          <input
            type="number"
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-24 dark:bg-gray-800 dark:text-white"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Cours (optionnel)
          </label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm dark:bg-gray-800 dark:text-white"
          >
            <option value="">Tous mes cours</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Ajouter'}
        </button>
      </form>
      {formError && <p className="text-sm text-red-600 mt-2">{formError}</p>}

      {existing.length > 0 && (
        <div className="mt-4 space-y-1">
          {existing.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 rounded px-3 py-2">
              <span>
                {METRIC_LABELS[t.metric]} {t.threshold_value} {t.course_name ? `— ${t.course_name}` : '— tous cours'}
              </span>
              <button
                onClick={() => onDelete(t.id)}
                className="text-red-600 hover:text-red-800 text-xs font-medium"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
