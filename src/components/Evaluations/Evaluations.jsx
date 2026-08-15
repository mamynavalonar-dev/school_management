// src/components/Evaluations/Evaluations.jsx
// Fichier complet avec les modifications

import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, Calendar, Clock, FileText, Users, MapPin, AlertCircle, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import apiService, { uploadEvaluationSubject } from '../../services/api';
import EvaluationSubjectPanel from './EvaluationSubjectPanel';
import { canManageFeature } from '../../utils/permissions';

const Evaluations = () => {
  const [evaluations, setEvaluations] = useState([]);
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [subjectFile, setSubjectFile] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    course_id: '',
    teacher_id: '',
    room_id: '',
    evaluation_type_id: '',
    date: '',
    time: '',
    duration: 120,
    status: 'upcoming'
  });

  // État pour les types d'évaluation
  const [evaluationTypes, setEvaluationTypes] = useState([]);

  const { intent, clearIntent } = useUi();
  const { user } = useApp();
  const { success, error: notifyError } = useNotifications();
  const canManage = canManageFeature(user, 'evaluations');

  // Chargement des données
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const evalsRes = await apiService.getEvaluations();
        setEvaluations(evalsRes?.data ?? []);

        const requests = [
          apiService.getEvaluationTypes(),
          apiService.getCourses(),
          ...(canManage ? [apiService.getTeachers(), apiService.getRooms()] : []),
        ];
        const [typesResult, coursesResult, teachersResult, roomsResult] = await Promise.allSettled(requests);

        if (typesResult?.status === 'fulfilled') setEvaluationTypes(typesResult.value?.data ?? []);
        if (coursesResult?.status === 'fulfilled') setCourses(coursesResult.value?.data ?? []);
        if (teachersResult?.status === 'fulfilled') setTeachers(teachersResult.value?.data ?? []);
        if (roomsResult?.status === 'fulfilled') setRooms(roomsResult.value?.data ?? []);

        if ([typesResult, coursesResult, teachersResult, roomsResult].some(result => result?.status === 'rejected')) {
          notifyError("Certaines listes nécessaires n'ont pas pu être chargées.");
        }
      } catch (err) {
        notifyError('Impossible de charger les évaluations.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [canManage, notifyError]);

  useEffect(() => {
    if (intent?.action === 'add') {
      if (canManage) {
        handleAdd();
      } else {
        notifyError("Vous n'avez pas l'autorisation de créer une évaluation.");
      }
      clearIntent();
    }
  }, [intent, clearIntent, canManage, notifyError]);

  const filteredEvaluations = evaluations.filter(evaluation =>
    ((evaluation.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
     (evaluation.course_name || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!filterType || String(evaluation.evaluation_type_id) === filterType) &&
    (!filterStatus || evaluation.status === filterStatus) &&
    (!filterCourse || evaluation.course_name === filterCourse)
  );

  const handleAdd = () => {
    setModalType('add');
    setSelectedEvaluation(null);
    setSubjectFile(null);
    setFormData({
      title: '',
      course_id: '',
      teacher_id: '',
      room_id: '',
      evaluation_type_id: '',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      duration: 120,
      status: 'upcoming'
    });
    setShowModal(true);
  };

  const handleEdit = (evaluation) => {
    setModalType('edit');
    setSubjectFile(null);
    setSelectedEvaluation(evaluation);
    setFormData({
      title: evaluation.title,
      course_id: evaluation.course_id || '',
      teacher_id: evaluation.teacher_id || '',
      room_id: evaluation.room_id || '',
      evaluation_type_id: evaluation.evaluation_type_id || '',
      date: evaluation.evaluation_date,
      time: evaluation.evaluation_time,
      duration: evaluation.duration_minutes || 120,
      status: evaluation.status || 'upcoming'
    });
    setShowModal(true);
  };

  const handleView = (evaluation) => {
    setModalType('view');
    setSelectedEvaluation(evaluation);
    setShowModal(true);
  };

  const handleDelete = async (evaluationId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette évaluation ?')) {
      try {
        await apiService.deleteEvaluation(evaluationId);
        setEvaluations(evaluations.filter(e => e.id !== evaluationId));
        success('Évaluation supprimée avec succès');
      } catch (err) {
        notifyError(err.message || 'Erreur de suppression');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const selectedCourse = courses.find(course => String(course.id) === String(formData.course_id));
      const payload = {
        ...formData,
        course_id: Number(formData.course_id),
        teacher_id: Number(formData.teacher_id),
        room_id: Number(formData.room_id),
        evaluation_type_id: Number(formData.evaluation_type_id),
        duration: Number(formData.duration),
        level_id: selectedCourse?.level_id ? Number(selectedCourse.level_id) : null,
        specialization_id: selectedCourse?.specialization_id ? Number(selectedCourse.specialization_id) : null,
      };

      if (modalType === 'add') {
        const created = await apiService.createEvaluation(payload);
        if (user?.role === 'teacher' && subjectFile && created?.id) {
          await uploadEvaluationSubject(created.id, subjectFile);
          success('Évaluation créée et sujet envoyé à la direction pour validation.');
        } else {
          success('Évaluation créée avec succès');
        }
        const evalsRes = await apiService.getEvaluations();
        setEvaluations(evalsRes?.data ?? []);
      } else if (modalType === 'edit') {
        await apiService.updateEvaluation(selectedEvaluation.id, payload);
        success('Évaluation modifiée avec succès');
        const evalsRes = await apiService.getEvaluations();
        setEvaluations(evalsRes?.data ?? []);
      }
      setShowModal(false);
    } catch (err) {
      notifyError(err.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 dark:text-gray-100';
      case 'upcoming': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800 dark:text-gray-100';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'draft': return 'Brouillon';
      case 'upcoming': return 'À venir';
      case 'in_progress': return 'En cours';
      case 'completed': return 'Terminé';
      default: return status;
    }
  };

  return (
    <div className="evaluations-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Évaluations</h1>
        <p className="text-gray-600 dark:text-gray-400">Gérez les sessions d'examens et évaluations</p>
      </div>
      
      <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 flex-1 min-w-64">
            <Search size={20} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Rechercher une évaluation..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          {canManage && (
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors">
              <Plus size={20}/>Nouvelle évaluation
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Tous les types</option>
            {evaluationTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Tous les statuts</option>
            <option value="draft">Brouillon</option>
            <option value="upcoming">À venir</option>
            <option value="in_progress">En cours</option>
            <option value="completed">Terminé</option>
          </select>
          <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Tous les cours</option>
            {courses.map(course => <option key={course.id} value={course.name}>{course.name}</option>)}
          </select>
          <button onClick={() => { setFilterType(''); setFilterStatus(''); setFilterCourse(''); setSearchTerm(''); }} className="text-blue-600 hover:text-blue-800 text-2xl font-medium px-3 py-2">Réinitialiser</button>
        </div>
      </div>
      
      <div className="evaluations-grid grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredEvaluations.map(evaluation => (
          <div key={evaluation.id} className="evaluation-card bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 hover:shadow-md transition-shadow p-6">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">{evaluation.title}</h3>
                <p className="text-2xl font-medium text-gray-500">{evaluation.course_name}</p>
              </div>
              <span className={`px-4 py-2 rounded-full text-xl font-medium ${getStatusColor(evaluation.status)}`}>
                {getStatusLabel(evaluation.status)}
              </span>
            </div>
            <div className="space-y-2 text-xl font-medium text-gray-700 dark:text-gray-300">
              <p className="flex items-center">
                <Calendar size={16} className="mr-2"/>
                {new Date(evaluation.evaluation_date).toLocaleDateString('fr-FR')} à {evaluation.evaluation_time}
              </p>
              <p className="flex items-center">
                <MapPin size={16} className="mr-2"/>
                Salle {evaluation.room_name}
              </p>
              <p className="flex items-center">
                <Users size={16} className="mr-2"/>
                {evaluation.registered_students} étudiants
              </p>
            </div>
            <div className="flex justify-end space-x-2 mt-4 pt-4">
              <button onClick={() => handleView(evaluation)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" title="Voir détails">
                <Eye size={18}/>
              </button>
              {canManage && (
                <>
                  <button onClick={() => handleEdit(evaluation)} className="p-2 text-green-600 hover:bg-green-50 rounded-full" title="Modifier">
                    <Edit size={18}/>
                  </button>
                  <button onClick={() => handleDelete(evaluation.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-full" title="Supprimer">
                    <Trash2 size={18}/>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {(loading || filteredEvaluations.length === 0) && (
        <div className="p-8 text-center text-gray-500">
          {loading ? 'Chargement des évaluations...' : 'Aucune évaluation trouvée'}
        </div>
      )}

      {showModal && (
        <div className="app-modal-layer bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              {modalType === 'add' && 'Nouvelle Évaluation'}
              {modalType === 'edit' && 'Modifier l\'Évaluation'}
              {modalType === 'view' && 'Détails de l\'Évaluation'}
            </h2>

            {modalType === 'view' && selectedEvaluation && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-2xl font-medium text-gray-700 dark:text-gray-300">Titre</label>
                    <p className="text-xl font-medium text-gray-900">{selectedEvaluation.title}</p>
                  </div>
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300">Cours</label>
                    <p className="text-xl font-medium text-gray-900">{selectedEvaluation.course_name}</p>
                  </div>
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300">Enseignant</label>
                    <p className="text-xl font-medium text-gray-900">{selectedEvaluation.teacher_name}</p>
                  </div>
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300">Salle</label>
                    <p className="text-xl font-medium text-gray-900">{selectedEvaluation.room_name}</p>
                  </div>
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300">Date</label>
                    <p className="text-xl font-medium text-gray-900">
                      {new Date(selectedEvaluation.evaluation_date).toLocaleDateString('fr-FR')} à {selectedEvaluation.evaluation_time}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300">Durée</label>
                    <p className="text-xl font-medium text-gray-900">{selectedEvaluation.duration_minutes} minutes</p>
                  </div>
                </div>
                <EvaluationSubjectPanel evaluation={selectedEvaluation} user={user} />
                <div className="flex justify-end pt-4">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-blue-600 text-gray-800 dark:text-blue-100 rounded-lg hover:bg-blue-500">
                    Fermer
                  </button>
                </div>
              </div>
            )}
            
            {(modalType === 'add' || modalType === 'edit') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Titre de l'évaluation</label>
                  <input type="text" name="title" value={formData.title} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Cours concerné</label>
                  <select name="course_id" value={formData.course_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">Sélectionner un cours</option>
                    {courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Enseignant</label>
                    <select name="teacher_id" value={formData.teacher_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner un enseignant</option>
                      {teachers.map(teacher => (
                        <option key={teacher.id} value={teacher.id}>
                          {[teacher.first_name, teacher.last_name].filter(Boolean).join(' ') || teacher.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Salle</label>
                    <select name="room_id" value={formData.room_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner une salle</option>
                      {rooms.map(room => <option key={room.id} value={room.id}>{room.name} ({room.number})</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Type d'évaluation</label>
                  <select name="evaluation_type_id" value={formData.evaluation_type_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">Sélectionner un type</option>
                    {evaluationTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Date</label>
                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Heure</label>
                    <input type="time" name="time" value={formData.time} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Durée (minutes)</label>
                    <input type="number" name="duration" min="1" max="1440" value={formData.duration} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  {modalType === 'edit' && (
                    <div>
                      <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                      <select name="status" value={formData.status} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                        <option value="draft">Brouillon</option>
                        <option value="upcoming">À venir</option>
                        <option value="in_progress">En cours</option>
                        <option value="completed">Terminé</option>
                      </select>
                    </div>
                  )}
                </div>
                {modalType === 'add' && user?.role === 'teacher' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4">
                    <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Sujet de l’évaluation (facultatif à la création)</label>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => setSubjectFile(event.target.files?.[0] || null)} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800" />
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Le sujet sera placé en attente. Un directeur ou administrateur devra le valider. L’étudiant ne pourra le télécharger que le jour de l’évaluation.</p>
                  </div>
                )}
                {modalType === 'add' && ['admin', 'directeur'].includes(user?.role) && (
                  <p className="rounded-xl bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 p-3 text-sm text-gray-600 dark:text-gray-300">Le sujet est déposé par l’enseignant responsable après la création de l’évaluation, puis validé par la direction.</p>
                )}
                <div className="flex justify-end pt-4 space-x-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">
                    Annuler
                  </button>
                  <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                    <Save size={18}/> {submitting ? 'Enregistrement...' : (modalType === 'add' ? 'Créer' : 'Modifier')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Evaluations;
