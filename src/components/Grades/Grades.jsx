import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, FileText, Download, Upload, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import apiService from '../../services/api';
import ReportCardsPanel from './ReportCardsPanel';
import { canManageFeature } from '../../utils/permissions';

const Grades = () => {
  const [activeTab, setActiveTab] = useState('grades');
  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);    // ✅ Liste des étudiants réels
  const [evaluations, setEvaluations] = useState([]); // ✅ Liste des évaluations réelles
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [formData, setFormData] = useState({
    student_id: '',
    evaluation_id: '',
    score: '',
    max_score: 20,
    is_absent: false
  });
  const { intent, clearIntent } = useUi();
  const { user } = useApp();
  const { success, error: notifyError } = useNotifications();
  const canManageGrades = ['admin', 'directeur', 'teacher'].includes(user?.role) && canManageFeature(user, 'grades');
  const canTableActions = ['admin', 'directeur'].includes(user?.role);

  // Le tableau de notes dépend uniquement de la permission « Notes ».
  // Pour la saisie, grades.php fournit ses propres références filtrées au lieu
  // d'appeler student.php/evaluations.php, qui peuvent être désactivés séparément.
  useEffect(() => {
    const loadData = async () => {
      try {
        const gradesRes = await apiService.getGrades();
        setGrades(gradesRes.data || []);

        if (canManageGrades) {
          const refsRes = await apiService.getGradeReferences();
          setStudents(refsRes.data?.students || []);
          setEvaluations(refsRes.data?.evaluations || []);
        } else {
          setStudents([]);
          setEvaluations([]);
        }
      } catch (err) {
        notifyError('Impossible de charger les données nécessaires.');
        console.error(err);
      }
    };
    loadData();
  }, [canManageGrades, notifyError]);

  // Gestion de l'intent (bouton "+" depuis la sidebar)
  useEffect(() => {
    if (intent?.action === 'add') {
      if (canManageGrades) {
        handleAdd();
      } else {
        notifyError("Vous n'avez pas l'autorisation de saisir une note.");
      }
      clearIntent();
    }
  }, [intent, clearIntent, canManageGrades, notifyError]);

  // Filtrage local des notes (recherche)
  const filteredGrades = grades.filter(grade =>
    (grade.student_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (grade.evaluation_title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = () => {
    setModalType('add');
    setSelectedGrade(null);
    setFormData({ student_id: '', evaluation_id: '', score: '', max_score: 20, is_absent: false });
    setShowModal(true);
  };

  const handleEdit = (grade) => {
    setModalType('edit');
    setSelectedGrade(grade);
    setFormData({
      student_id: grade.student_id || '',
      evaluation_id: grade.evaluation_id || '',
      score: grade.score || '',
      max_score: grade.max_score || 20,
      is_absent: grade.is_absent || false
    });
    setShowModal(true);
  };

  const handleView = (grade) => {
    setModalType('view');
    setSelectedGrade(grade);
    setShowModal(true);
  };

  const handleDelete = async (gradeId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette note ?')) {
      try {
        await apiService.deleteGrade(gradeId);
        setGrades(grades.filter(g => g.id !== gradeId));
        success('Note supprimée avec succès');
      } catch (err) {
        notifyError(err.message || 'Erreur lors de la suppression');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ✅ Récupération des objets sélectionnés
    const selectedStudent = students.find(s => s.id === Number(formData.student_id));
    const selectedEval = evaluations.find(e => e.id === Number(formData.evaluation_id));

    if (!selectedStudent || !selectedEval) {
      notifyError('Veuillez sélectionner un étudiant et une évaluation valides.');
      return;
    }

    const gradeData = {
      student_id: selectedStudent.id,
      evaluation_id: selectedEval.id,
      score: formData.is_absent ? null : parseFloat(formData.score) || null,
      max_score: formData.max_score,
      status: formData.is_absent ? 'absent' : (formData.score ? 'completed' : 'pending'),
      grade_date: new Date().toISOString().split('T')[0],
      is_absent: formData.is_absent
    };

    try {
      if (modalType === 'add') {
        await apiService.createGrade(gradeData);
        // Rafraîchir la liste des notes
        const gradesRes = await apiService.getGrades();
        setGrades(gradesRes.data || []);
        success('Note ajoutée avec succès');
      } else if (modalType === 'edit') {
        await apiService.updateGrade(selectedGrade.id, gradeData);
        const gradesRes = await apiService.getGrades();
        setGrades(gradesRes.data || []);
        success('Note modifiée avec succès');
      }
      setShowModal(false);
    } catch (err) {
      notifyError(err.message || 'Erreur lors de l\'enregistrement de la note');
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'absent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800 dark:text-gray-100';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed': return 'Terminé';
      case 'pending': return 'En attente';
      case 'absent': return 'Absent';
      default: return status;
    }
  };

  return (
    <div className="grades-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Notes</h1>
        <p className="text-gray-600 dark:text-gray-400">Saisie et consultation des résultats et bulletins</p>
      </div>

      <div className="flex gap-2 border-b dark:border-gray-700 mb-6">
        <button onClick={() => setActiveTab('grades')} className={`px-5 py-3 font-bold border-b-4 ${activeTab === 'grades' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>Notes et évaluations</button>
        <button onClick={() => setActiveTab('reports')} className={`px-5 py-3 font-bold border-b-4 ${activeTab === 'reports' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>Bulletins scolaires</button>
      </div>

      {activeTab === 'grades' && <>
      <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6 flex justify-between items-center">
        <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 flex-1 min-w-64">
          <Search size={20} className="text-gray-400 mr-2" />
          <input type="text" placeholder="Rechercher par étudiant, évaluation..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        {canManageGrades && (
          <button onClick={handleAdd} className="ml-4 bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
            <Plus size={20} /> Saisir une note
          </button>
        )}
      </div>

      <div className="grades-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Étudiant</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Évaluation</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Note</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Statut</th>
              {canTableActions && <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>}
            </tr>
          </thead>
          
          <tbody>
            {filteredGrades.map(grade => (
              <tr key={grade.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-900">
                <td className="p-4">
                  <div className="font-medium text-xl">{grade.student_name}</div>
                </td>
                <td className="p-4 text-xl font-medium">{grade.evaluation_title}</td>
                <td className="p-4 font-semibold text-xl">
                  {grade.is_absent ? 
                    <span className="text-red-600">Absent</span> : 
                    grade.score !== null ? `${grade.score} / ${grade.max_score}` : '-'
                  }
                </td>
                <td className="p-4">
                  <span className={`px-4 py-2 rounded-full text-xl font-medium ${getStatusColor(grade.status)}`}>
                    {getStatusLabel(grade.status)}
                  </span>
                </td>
                {canTableActions && (
                  <td className="p-4">
                    <div className="flex space-x-2">
                      <button onClick={() => handleView(grade)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="Voir détails"><Eye size={19}/></button>
                      {canManageGrades && <>
                        <button onClick={() => handleEdit(grade)} className="text-green-600 hover:text-green-800 p-1 rounded" title="Modifier"><Edit size={19}/></button>
                        <button onClick={() => handleDelete(grade.id)} className="text-red-600 hover:text-red-800 p-1 rounded" title="Supprimer"><Trash2 size={19}/></button>
                      </>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredGrades.length === 0 && (
          <div className="p-8 text-center text-gray-500">Aucune note trouvée</div>
        )}
      </div>
      </>}

      {activeTab === 'reports' && <ReportCardsPanel canManage={canManageGrades} />}

      {showModal && (
        <div className="app-modal-layer bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-3xl font-bold mb-6">
              {modalType === 'add' && 'Saisir une Note'}
              {modalType === 'edit' && 'Modifier la Note'}
              {modalType === 'view' && 'Détails de la Note'}
            </h2>
            
            {modalType === 'view' && selectedGrade && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Étudiant</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedGrade.student_name}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Numéro étudiant</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedGrade.student_number}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Évaluation</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedGrade.evaluation_title}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Cours</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedGrade.course_name}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Note</label>
                    <p className="text-2xl font-medium text-gray-900">
                      {selectedGrade.is_absent ? 'Absent' : selectedGrade.score !== null ? `${selectedGrade.score} / ${selectedGrade.max_score}` : 'Non noté'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Statut</label>
                    <span className={`px-4 py-2 rounded-full text-2xl font-medium ${getStatusColor(selectedGrade.status)}`}>
                      {getStatusLabel(selectedGrade.status)}
                    </span>
                  </div>
                </div>
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
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Évaluation</label>
                  <select name="evaluation_id" value={formData.evaluation_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">Sélectionner une évaluation</option>
                    {evaluations.map(evalItem => (
                      <option key={evalItem.id} value={evalItem.id}>{evalItem.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Étudiant</label>
                  <select name="student_id" value={formData.student_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">Sélectionner un étudiant</option>
                    {students.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name} ({student.student_number})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Note</label>
                    <input type="number" step="0.5" name="score" value={formData.score} onChange={handleInputChange} disabled={formData.is_absent} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Sur</label>
                    <input type="number" name="max_score" value={formData.max_score} onChange={handleInputChange} disabled={formData.is_absent} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                </div>
                <div className="flex items-center">
                  <input type="checkbox" name="is_absent" checked={formData.is_absent} onChange={handleInputChange} className="h-6 w-6 rounded" />
                  <label className="ml-2 text-2xl font-semibold text-gray-700 dark:text-gray-300">Marquer comme absent</label>
                </div>
                <div className="flex justify-end pt-4 space-x-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">
                    Annuler
                  </button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save size={18}/> {modalType === 'add' ? 'Enregistrer' : 'Modifier'}
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

export default Grades;
