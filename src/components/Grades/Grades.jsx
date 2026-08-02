import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, FileText, Download, Upload, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useNotifications } from '../../hooks/useNotifications';

const Grades = () => {
  const [grades, setGrades] = useState([]);
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
  const { success, error } = useNotifications();

  useEffect(() => {
    if (intent?.action === 'add') {
      handleAdd();
      clearIntent();
    }
  }, [intent, clearIntent]);

  useEffect(() => {
    const mockGrades = [
      { id: 1, student_name: 'Jean Dupont', student_number: 'STU20240001', evaluation_title: 'Examen Final - Programmation Web', course_name: 'Programmation Web', score: 16.5, max_score: 20, status: 'completed', grade_date: '2024-09-26', is_absent: false },
      { id: 2, student_name: 'Marie Martin', student_number: 'STU20240002', evaluation_title: 'Partiel - Méthodes Numériques', course_name: 'Analyse Numérique', score: 14.0, max_score: 20, status: 'completed', grade_date: '2024-09-21', is_absent: false },
      { id: 4, student_name: 'Sophie Bernard', student_number: 'STU20240004', evaluation_title: 'TP Évalué - Synthèse Organique', course_name: 'Chimie Générale', score: null, max_score: 20, status: 'absent', is_absent: true, grade_date: '2024-09-23' },
      { id: 5, student_name: 'Pierre Leroy', student_number: 'STU20240003', evaluation_title: 'Projet - Application Web', course_name: 'Programmation Web', score: null, max_score: 20, status: 'pending', grade_date: null, is_absent: false },
    ];
    setGrades(mockGrades);
  }, []);

  const filteredGrades = grades.filter(grade =>
    grade.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grade.evaluation_title.toLowerCase().includes(searchTerm.toLowerCase())
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

  const handleDelete = (gradeId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette note ?')) {
      setGrades(grades.filter(g => g.id !== gradeId));
      success('Note supprimée avec succès');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (modalType === 'add') {
      const newGrade = {
        id: Math.max(...grades.map(g => g.id), 0) + 1,
        student_name: 'Nouvel Étudiant',
        student_number: 'STU2024000' + (grades.length + 1),
        evaluation_title: formData.evaluation_id === '1' ? 'Examen Final - Programmation Web' : 'Partiel - Méthodes Numériques',
        course_name: formData.evaluation_id === '1' ? 'Programmation Web' : 'Analyse Numérique',
        score: formData.is_absent ? null : parseFloat(formData.score),
        max_score: formData.max_score,
        status: formData.is_absent ? 'absent' : (formData.score ? 'completed' : 'pending'),
        grade_date: new Date().toISOString().split('T')[0],
        is_absent: formData.is_absent
      };
      setGrades([...grades, newGrade]);
      success('Note ajoutée avec succès');
    } else if (modalType === 'edit') {
      setGrades(grades.map(g => 
        g.id === selectedGrade.id ? {
          ...g,
          score: formData.is_absent ? null : parseFloat(formData.score),
          max_score: formData.max_score,
          status: formData.is_absent ? 'absent' : (formData.score ? 'completed' : 'pending'),
          is_absent: formData.is_absent
        } : g
      ));
      success('Note modifiée avec succès');
    }
    setShowModal(false);
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

      <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6 flex justify-between items-center">
        <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 flex-1 min-w-64">
          <Search size={20} className="text-gray-400 mr-2" />
          <input type="text" placeholder="Rechercher par étudiant, évaluation..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <button onClick={handleAdd} className="ml-4 bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
          <Plus size={20} /> Saisir une note
        </button>
      </div>

      <div className="grades-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Étudiant</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Évaluation</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Note</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Statut</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          
          <tbody>
            {filteredGrades.map(grade => (
              <tr key={grade.id} className="border dark:border-gray-700-t hover:bg-gray-50 dark:bg-gray-900">
                <td className="p-4">
                  <div className="font-medium text-xl">{grade.student_name}</div>
                  {/* <div className="text-base text-gray-500">{grade.student_number}</div> */}
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
                <td className="p-4">
                  <div className="flex space-x-2">
                    <button onClick={() => handleView(grade)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="Voir détails">
                      <Eye size={19}/>
                    </button>
                    <button onClick={() => handleEdit(grade)} className="text-green-600 hover:text-green-800 p-1 rounded" title="Modifier">
                      <Edit size={19}/>
                    </button>
                    <button onClick={() => handleDelete(grade.id)} className="text-red-600 hover:text-red-800 p-1 rounded" title="Supprimer">
                      <Trash2 size={19}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredGrades.length === 0 && (
          <div className="p-8 text-center text-gray-500">Aucune note trouvée</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Évaluation</label>
                  <select name="evaluation_id" value={formData.evaluation_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">Sélectionner une évaluation</option>
                    <option value="1">Examen Final - Programmation Web</option>
                    <option value="2">Partiel - Méthodes Numériques</option>
                  </select>
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Étudiant</label>
                  <select name="student_id" value={formData.student_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">Sélectionner un étudiant</option>
                    <option value="1">Jean Dupont</option>
                    <option value="2">Marie Martin</option>
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


