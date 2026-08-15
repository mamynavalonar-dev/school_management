import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, UserX, Calendar, Clock, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useNotifications } from '../../hooks/useNotifications';
import { useApp } from '../../context/AppContext';
import apiService from '../../services/api';
import { canManageFeature } from '../../utils/permissions';

const Absences = () => {
  const [absences, setAbsences] = useState([]);
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedAbsence, setSelectedAbsence] = useState(null);
  const [formData, setFormData] = useState({
    student_id: '',
    course_id: '',
    date: '',
    reason: '',
    status: 'pending',
    justification: ''
  });
  const { intent, clearIntent } = useUi();
  const { user } = useApp();
  const { success, error: notifyError } = useNotifications();
  const canManage = canManageFeature(user, 'absences');
  const canTableActions = ['admin', 'directeur'].includes(user?.role);

  const loadAbsences = async () => {
    const response = await apiService.getAbsences();
    setAbsences(response?.data ?? []);
  };

  useEffect(() => {
    if (intent?.action === 'add') {
      if (canManage) {
        handleAdd();
      } else {
        notifyError("Vous n'avez pas l'autorisation d'ajouter une absence.");
      }
      clearIntent();
    }
  }, [intent, clearIntent, canManage, notifyError]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const absencesResponse = await apiService.getAbsences();
        if (active) setAbsences(absencesResponse?.data ?? []);

        if (canManage) {
          const [studentsResult, coursesResult] = await Promise.allSettled([
            apiService.getStudents(),
            apiService.getCourses(),
          ]);

          if (!active) return;
          if (studentsResult.status === 'fulfilled') {
            setStudents(studentsResult.value?.data ?? []);
          }
          if (coursesResult.status === 'fulfilled') {
            setCourses(coursesResult.value?.data ?? []);
          }
          if (studentsResult.status === 'rejected' || coursesResult.status === 'rejected') {
            notifyError("Certaines listes nécessaires au formulaire n'ont pas pu être chargées.");
          }
        }
      } catch (err) {
        console.error('Failed to load absences:', err);
        if (active) notifyError('Impossible de charger les absences.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [canManage, notifyError]);

  const filteredAbsences = absences.filter(absence => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term
      || (absence.student_name || '').toLowerCase().includes(term)
      || (absence.student_number || '').toLowerCase().includes(term)
      || (absence.course_name || '').toLowerCase().includes(term);
    const matchesStatus = !filterStatus || absence.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleAdd = () => {
    setModalType('add');
    setSelectedAbsence(null);
    setFormData({
      student_id: '',
      course_id: '',
      date: new Date().toISOString().split('T')[0],
      reason: '',
      status: 'pending',
      justification: ''
    });
    setShowModal(true);
  };

  const handleEdit = (absence) => {
    setModalType('edit');
    setSelectedAbsence(absence);
    setFormData({
      student_id: absence.student_id || '',
      course_id: absence.course_id || '',
      date: absence.date,
      reason: absence.reason,
      status: absence.status,
      justification: absence.justification || ''
    });
    setShowModal(true);
  };

  const handleView = (absence) => {
    setModalType('view');
    setSelectedAbsence(absence);
    setShowModal(true);
  };

  const handleDelete = async (absenceId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette absence ?')) {
      try {
        await apiService.deleteAbsence(absenceId);
        setAbsences(prev => prev.filter(a => a.id !== absenceId));
        success('Absence supprimée avec succès');
      } catch (err) {
        notifyError(err.message || "Erreur lors de la suppression de l'absence.");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSubmitting(true);

      if (modalType === 'add') {
        const student = students.find(item => String(item.id) === String(formData.student_id));
        if (!student || !formData.course_id) {
          notifyError('Veuillez sélectionner un étudiant et un cours valides.');
          return;
        }

        await apiService.createAbsence({
          ...formData,
          student_id: Number(student.id),
          course_id: Number(formData.course_id),
        });
        success('Absence ajoutée avec succès');
      } else if (modalType === 'edit') {
        await apiService.updateAbsence(selectedAbsence.id, {
          date: formData.date,
          reason: formData.reason,
          status: formData.status,
          justification: formData.justification,
        });
        success('Absence modifiée avec succès');
      }

      await loadAbsences();
      setShowModal(false);
    } catch (err) {
      notifyError(err.message || "Erreur lors de l'enregistrement de l'absence.");
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
      case 'justified': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'unjustified': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800 dark:text-gray-100';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'justified': return 'Justifiée';
      case 'pending': return 'En attente';
      case 'unjustified': return 'Non justifiée';
      default: return status;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  return (
    <div className="absences-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Absences</h1>
        <p className="text-gray-600 dark:text-gray-400">Suivi et gestion des absences étudiantes</p>
      </div>

      <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 flex-1 min-w-64">
            <Search size={20} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Rechercher par étudiant, cours..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {canManage && (
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
              <Plus size={20} /> Nouvelle absence
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="justified">Justifiée</option>
            <option value="unjustified">Non justifiée</option>
          </select>
          <button onClick={() => { setFilterStatus(''); setSearchTerm(''); }} className="text-blue-600 hover:text-blue-800 text-base px-3 py-2">Réinitialiser</button>
        </div>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Total Absences</h3>
          <p className="text-3xl font-bold text-blue-600">{absences.length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Justifiées</h3>
          <p className="text-3xl font-bold text-green-600">{absences.filter(a => a.status === 'justified').length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">En attente</h3>
          <p className="text-3xl font-bold text-yellow-600">{absences.filter(a => a.status === 'pending').length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Non justifiées</h3>
          <p className="text-3xl font-bold text-red-600">{absences.filter(a => a.status === 'unjustified').length}</p>
        </div>
      </div>

      <div className="absences-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Étudiant</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Date</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Cours</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Motif</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Statut</th>
              {canTableActions && <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>}
            </tr>
          </thead>
          
          <tbody>
            {filteredAbsences.map(absence => (
              <tr key={absence.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-900">
                <td className="p-4">
                  <div className="font-medium text-2xl">{absence.student_name}</div>
                  {/* <div className="text-base text-gray-500">{absence.student_number}</div> */}
                </td>
                <td className="p-4 text-2xl">{formatDate(absence.date)}</td>
                <td className="p-4 text-2xl">{absence.course_name}</td>
                <td className="p-4 text-2xl">{absence.reason}</td>
                <td className="p-4">
                  <span className={`px-4 py-2 rounded-full text-2xl ${getStatusColor(absence.status)}`}>
                    {getStatusLabel(absence.status)}
                  </span>
                </td>
                {canTableActions && (
                  <td className="p-4">
                    <div className="flex space-x-2">
                      <button onClick={() => handleView(absence)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="Voir détails"><Eye size={18}/></button>
                      {canManage && <>
                        <button onClick={() => handleEdit(absence)} className="text-green-600 hover:text-green-800 p-1 rounded" title="Modifier"><Edit size={18}/></button>
                        <button onClick={() => handleDelete(absence.id)} className="text-red-600 hover:text-red-800 p-1 rounded" title="Supprimer"><Trash2 size={18}/></button>
                      </>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {(loading || filteredAbsences.length === 0) && (
          <div className="p-8 text-center text-gray-500">
            {loading ? 'Chargement des absences...' : 'Aucune absence trouvée'}
          </div>
        )}
      </div>

      {showModal && (
        <div className="app-modal-layer bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-3xl font-bold mb-6">
              {modalType === 'add' && 'Nouvelle Absence'}
              {modalType === 'edit' && 'Modifier l\'Absence'}
              {modalType === 'view' && 'Détails de l\'Absence'}
            </h2>
            
            {modalType === 'view' && selectedAbsence && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Étudiant</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedAbsence.student_name}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Numéro Étudiant</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedAbsence.student_number}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Date</label>
                    <p className="text-2xl font-medium text-gray-900">{formatDate(selectedAbsence.date)}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Cours</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedAbsence.course_name}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Motif</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedAbsence.reason}</p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Statut</label>
                    <span className={`px-4 py-1 rounded-full text-2xl font-medium ${getStatusColor(selectedAbsence.status)}`}>
                      {getStatusLabel(selectedAbsence.status)}
                    </span>
                  </div>
                </div>
                {selectedAbsence.justification && (
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">Justification</label>
                    <p className="text-2xl font-medium text-gray-900">{selectedAbsence.justification}</p>
                  </div>
                )}
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
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Étudiant</label>
                  <select name="student_id" value={formData.student_id} onChange={handleInputChange} required disabled={modalType === 'edit'} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="">Sélectionner un étudiant</option>
                    {students.map(student => (
                      <option key={student.id} value={student.id}>
                        {[student.first_name, student.last_name].filter(Boolean).join(' ') || student.name} {student.student_number ? `(${student.student_number})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Cours</label>
                  <select name="course_id" value={formData.course_id} onChange={handleInputChange} required disabled={modalType === 'edit'} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="">Sélectionner un cours</option>
                    {courses.map(course => (
                      <option key={course.id} value={course.id}>{course.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Date</label>
                  <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Motif</label>
                  <input type="text" name="reason" value={formData.reason} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="pending">En attente</option>
                    <option value="justified">Justifiée</option>
                    <option value="unjustified">Non justifiée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">Justification</label>
                  <textarea name="justification" value={formData.justification} onChange={handleInputChange} rows="3" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" placeholder="Détails de la justification..." />
                </div>
                <div className="flex justify-end pt-4 space-x-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">
                    Annuler
                  </button>
                  <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                    <Save size={18}/> {submitting ? 'Enregistrement...' : (modalType === 'add' ? 'Enregistrer' : 'Modifier')}
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

export default Absences;
