import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, Calendar, Clock, FileText, Users, MapPin, AlertCircle, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useNotifications } from '../../hooks/useNotifications';

const Evaluations = () => {
  const [evaluations, setEvaluations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    course_id: '',
    teacher_id: '',
    room_id: '',
    evaluation_type: '',
    date: '',
    time: '',
    duration: 120
  });
  const { intent, clearIntent } = useUi();
  const { success } = useNotifications();

  useEffect(() => {
    if (intent?.action === 'add') {
      handleAdd();
      clearIntent();
    }
  }, [intent, clearIntent]);

  useEffect(() => {
    const mockEvaluations = [
      { id: 1, title: 'Examen Final - Programmation Web', course_name: 'Programmation Web', course_code: 'INFO301', teacher_name: 'Pierre Durand', room_name: 'B201', evaluation_type_name: 'Examen Final', evaluation_date: '2024-09-25', evaluation_time: '09:00', duration_minutes: 180, level_name: 'L3', specialization_name: 'Informatique', status: 'upcoming', registered_students: 28, completed_grades: 0 },
      { id: 2, title: 'Partiel - Méthodes Numériques', course_name: 'Analyse Numérique', course_code: 'MATH201', teacher_name: 'Marie Leblanc', room_name: 'A101', evaluation_type_name: 'Examen Partiel', evaluation_date: '2024-09-20', evaluation_time: '14:00', duration_minutes: 120, level_name: 'L2', specialization_name: 'Mathématiques', status: 'completed', registered_students: 22, completed_grades: 22 },
    ];
    setEvaluations(mockEvaluations);
  }, []);

  const filteredEvaluations = evaluations.filter(evaluation =>
    (evaluation.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
     evaluation.course_name.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!filterType || evaluation.evaluation_type_name === filterType) &&
    (!filterStatus || evaluation.status === filterStatus) &&
    (!filterCourse || evaluation.course_name === filterCourse)
  );

  const handleAdd = () => {
    setModalType('add');
    setSelectedEvaluation(null);
    setFormData({
      title: '',
      course_id: '',
      teacher_id: '',
      room_id: '',
      evaluation_type: '',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      duration: 120
    });
    setShowModal(true);
  };

  const handleEdit = (evaluation) => {
    setModalType('edit');
    setSelectedEvaluation(evaluation);
    setFormData({
      title: evaluation.title,
      course_id: evaluation.course_id || '',
      teacher_id: evaluation.teacher_id || '',
      room_id: evaluation.room_id || '',
      evaluation_type: evaluation.evaluation_type_name,
      date: evaluation.evaluation_date,
      time: evaluation.evaluation_time,
      duration: evaluation.duration_minutes
    });
    setShowModal(true);
  };

  const handleView = (evaluation) => {
    setModalType('view');
    setSelectedEvaluation(evaluation);
    setShowModal(true);
  };

  const handleDelete = (evaluationId) => {
    if (window.confirm('Etes-vous sûr de vouloir supprimer cette valuation ?')) {
      setEvaluations(evaluations.filter(e => e.id !== evaluationId));
      success('Évaluation supprimée avec succès');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (modalType === 'add') {
      const newEvaluation = {
        id: Math.max(...evaluations.map(e => e.id), 0) + 1,
        title: formData.title,
        course_name: formData.course_id === '1' ? 'Programmation Web' : 'Analyse Numérique',
        course_code: formData.course_id === '1' ? 'INFO301' : 'MATH201',
        teacher_name: formData.teacher_id === '1' ? 'Pierre Durand' : 'Marie Leblanc',
        room_name: formData.room_id === '1' ? 'A101' : 'B201',
        evaluation_type_name: formData.evaluation_type,
        evaluation_date: formData.date,
        evaluation_time: formData.time,
        duration_minutes: formData.duration,
        level_name: 'L3',
        specialization_name: 'Informatique',
        status: 'upcoming',
        registered_students: 0,
        completed_grades: 0
      };
      setEvaluations([...evaluations, newEvaluation]);
      success('Évaluation créée avec succès');
    } else if (modalType === 'edit') {
      setEvaluations(evaluations.map(e => 
        e.id === selectedEvaluation.id ? {
          ...e,
          title: formData.title,
          evaluation_type_name: formData.evaluation_type,
          evaluation_date: formData.date,
          evaluation_time: formData.time,
          duration_minutes: formData.duration
        } : e
      ));
      success('Évaluation modifiée avec succès');
    }
    setShowModal(false);
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
          <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors">
            <Plus size={20}/>Nouvelle évaluation
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Tous les types</option>
            <option value="Examen Final">Examen Final</option>
            <option value="Examen Partiel">Examen Partiel</option>
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
            <option value="Programmation Web">Programmation Web</option>
            <option value="Analyse Numérique">Analyse Numérique</option>
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
            <div className="flex justify-end space-x-2 mt-4 pt-4 ">
              <button onClick={() => handleView(evaluation)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" title="Voir détails">
                <Eye size={18}/>
              </button>
              <button onClick={() => handleEdit(evaluation)} className="p-2 text-green-600 hover:bg-green-50 rounded-full" title="Modifier">
                <Edit size={18}/>
              </button>
              <button onClick={() => handleDelete(evaluation.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-full" title="Supprimer">
                <Trash2 size={18}/>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
                <div className="flex justify-end pt-4 ">
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
                    <option value="1">Programmation Web</option>
                    <option value="2">Analyse Numérique</option>
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
                <div className="flex justify-end pt-4 space-x-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">
                    Annuler
                  </button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save size={18}/> {modalType === 'add' ? 'Créer' : 'Modifier'}
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


