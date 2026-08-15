// src/components/Student/StudentDashboard.jsx
import React, { useEffect, useState, useRef } from 'react';
import {
  getStudentDashboard,
  uploadAbsenceJustification,
  downloadAbsenceJustification,
  listAbsenceJustifications,
} from '../../services/api';
import { FileText } from 'lucide-react';
import CourseResources from '../Courses/CourseResources';

const DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const StudentDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCourseForResources, setSelectedCourseForResources] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const result = await getStudentDashboard();
      setData(result);
    } catch (err) {
      console.error('Failed to load student dashboard:', err);
      setError('Impossible de charger le tableau de bord.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Mon tableau de bord</h2>
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

  const { profile, weekly_schedule: schedule, grades, absences, upcoming_evaluations: upcoming, overall_average: average } = data;
  const access = data.feature_access || {};

  const scheduleByDay = schedule.reduce((acc, s) => {
    (acc[s.day_of_week] = acc[s.day_of_week] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Bonjour {profile.first_name}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {profile.level_name} · {profile.specialization_name} · N° {profile.student_number}
        </p>
      </div>

      {/* Moyenne + évaluations à venir */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {access.grades && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Moyenne générale</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
            {average !== null ? `${average}/20` : 'N/A'}
          </p>
        </div>}
        {access.evaluations && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Évaluations à venir</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{upcoming.length}</p>
        </div>}
      </div>

      {/* Emploi du temps */}
      {access.planning && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Mon emploi du temps
        </h3>
        {schedule.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Aucun cours planifié pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(scheduleByDay).map(([day, sessions]) => (
              <div key={day}>
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{DAY_NAMES[day]}</p>
                <div className="space-y-1">
                  {sessions.map((s, i) => (
                    <div key={i} className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900 rounded px-3 py-2">
                      <span>{s.course_name} — {s.teacher_name} — Salle {s.room_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 dark:text-gray-400">{s.start_time}–{s.end_time}</span>
                        {access.courses && s.course_id && (
                          <button
                            onClick={() => setSelectedCourseForResources({ id: s.course_id, name: s.course_name })}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            title="Voir les documents du cours"
                          >
                            <FileText size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* Notes */}
      {access.grades && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow mb-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Mes notes</h3>
        {grades.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Aucune note pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                <th className="py-2">Évaluation</th>
                <th className="py-2">Cours</th>
                <th className="py-2">Date</th>
                <th className="py-2 text-right">Note</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id} className="border-b dark:border-gray-700 last:border-0">
                  <td className="py-2">{g.evaluation_title}</td>
                  <td className="py-2">{g.course_name}</td>
                  <td className="py-2">{g.grade_date}</td>
                  <td className="py-2 text-right font-medium">
                    {g.is_absent ? (
                      <span className="text-gray-400">Absent</span>
                    ) : (
                      `${g.score}/${g.max_score}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}

      {/* Absences + justificatifs */}
      {access.absences && <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Mes absences</h3>
        {absences.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Aucune absence enregistrée.</p>
        ) : (
          <div className="space-y-3">
            {absences.map((a) => (
              <AbsenceRow key={a.id} absence={a} />
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

const STATUS_LABELS = {
  justified: { text: 'Justifiée', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  unjustified: { text: 'Non justifiée', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  pending: { text: 'En attente', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
};

const AbsenceRow = ({ absence }) => {
  const [files, setFiles] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const loadFiles = async () => {
    try {
      const list = await listAbsenceJustifications(absence.id);
      setFiles(list);
    } catch (err) {
      console.error('Failed to load justification files:', err);
    }
  };

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    try {
      await uploadAbsenceJustification(absence.id, file);
      await loadFiles();
    } catch (err) {
      setUploadError(err.message || "Échec de l'envoi du justificatif.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const statusInfo = STATUS_LABELS[absence.status] || STATUS_LABELS.pending;

  return (
    <div className="border dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{absence.course_name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{absence.date} — {absence.reason}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded ${statusInfo.className}`}>
          {statusInfo.text}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {files === null ? (
          <span className="text-xs text-gray-400">Chargement des justificatifs...</span>
        ) : files.length === 0 ? (
          <span className="text-xs text-gray-400">Aucun justificatif envoyé.</span>
        ) : (
          files.map((f) => (
            <button
              key={f.id}
              onClick={() => downloadAbsenceJustification(f.id, f.original_name)}
              className="text-xs px-2 py-1 rounded border dark:border-gray-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            >
              📎 {f.original_name}
            </button>
          ))
        )}

        <label className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
          {uploading ? 'Envoi...' : 'Ajouter un justificatif'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
      {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
    </div>
  );
};

export default StudentDashboard;
