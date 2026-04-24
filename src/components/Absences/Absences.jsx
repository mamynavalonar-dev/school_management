import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, UserX, Calendar, Clock, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useNotifications } from '../../hooks/useNotifications';

const Absences = () => {
  const [absences, setAbsences] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedAbsence, setSelectedAbsence] = useState(null);
  const [formData, setFormData] = useState({
    student_id: '',
    date: '',
    reason: '',
    status: 'pending',
    justification: ''
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
    const mockAbsences = [
      { id: 1, student_name: 'Jean Dupont', student_number: 'STU20240001', date: '2024-09-20', reason: 'Maladie', status: 'justified', justification: 'Certificat mÃ©dical fourni', course_name: 'Programmation Web' },
      { id: 2, student_name: 'Marie Martin', student_number: 'STU20240002', date: '2024-09-22', reason: 'ProblÃ¨me familial', status: 'pending', justification: '', course_name: 'Analyse NumÃ©rique' },
      { id: 3, student_name: 'Pierre Leroy', student_number: 'STU20240003', date: '2024-09-18', reason: 'Retard', status: 'unjustified', justification: '', course_name: 'Physique Quantique' },
    ];
    setAbsences(mockAbsences);
  }, []);

  const filteredAbsences = absences.filter(absence =>
    absence.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    absence.course_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = () => {
    setModalType('add');
    setSelectedAbsence(null);
    setFormData({
      student_id: '',
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

  const handleDelete = (absenceId) => {
    if (window.confirm('ÃŠtes-vous sÃ»r de vouloir supprimer cette absence ?')) {
      setAbsences(absences.filter(a => a.id !== absenceId));
      success('Absence supprimÃ©e avec succÃ¨s');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (modalType === 'add') {
      const newAbsence = {
        id: Math.max(...absences.map(a => a.id), 0) + 1,
        student_name: formData.student_id === '1' ? 'Jean Dupont' : 'Marie Martin',
        student_number: formData.student_id === '1' ? 'STU20240001' : 'STU20240002',
        date: formData.date,
        reason: formData.reason,
        status: formData.status,
        justification: formData.justification,
        course_name: 'Cours GÃ©nÃ©ral'
      };
      setAbsences([...absences, newAbsence]);
      success('Absence ajoutÃ©e avec succÃ¨s');
    } else if (modalType === 'edit') {
      setAbsences(absences.map(a => 
        a.id === selectedAbsence.id ? {
          ...a,
          date: formData.date,
          reason: formData.reason,
          status: formData.status,
          justification: formData.justification
        } : a
      ));
      success('Absence modifiÃ©e avec succÃ¨s');
    }
    setShowModal(false);
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
      case 'justified': return 'JustifiÃ©e';
      case 'pending': return 'En attente';
      case 'unjustified': return 'Non justifiÃ©e';
      default: return status;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  return (
    <div className="absences-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Absences</h1>
        <p className="text-gray-600 dark:text-gray-400">Suivi et gestion des absences Ã©tudiantes</p>
      </div>

      <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2 flex-1 min-w-64">
            <Search size={20} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Rechercher par Ã©tudiant, cours..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
            <Plus size={20} /> Nouvelle absence
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-base">
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="justified">JustifiÃ©e</option>
            <option value="unjustified">Non justifiÃ©e</option>
          </select>
          <button onClick={() => { setFilterStatus(''); setSearchTerm(''); }} className="text-blue-600 hover:text-blue-800 text-base px-3 py-2">RÃ©initialiser</button>
        </div>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Total Absences</h3>
          <p className="text-3xl font-bold text-blue-600">{absences.length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">JustifiÃ©es</h3>
          <p className="text-3xl font-bold text-green-600">{absences.filter(a => a.status === 'justified').length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">En attente</h3>
          <p className="text-3xl font-bold text-yellow-600">{absences.filter(a => a.status === 'pending').length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Non justifiÃ©es</h3>
          <p className="text-3xl font-bold text-red-600">{absences.filter(a => a.status === 'unjustified').length}</p>
        </div>
      </div>

      <div className="absences-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Ã‰tudiant</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Date</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Cours</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Motif</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Statut</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          
          <tbody>
            {filteredAbsences.map(absence => (
              <tr key={absence.id} className="border dark:border-gray-700-t hover:bg-gray-50 dark:bg-gray-900">
                <td className="p-4">
                  <div className="font-medium text-base">{absence.student_name}</div>
                  <div className="text-base text-gray-500">{absence.student_number}</div>
                </td>
                <td className="p-4 text-base">{formatDate(absence.date)}</td>
                <td className="p-4 text-base">{absence.course_name}</td>
                <td className="p-4 text-base">{absence.reason}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-base ${getStatusColor(absence.status)}`}>
                    {getStatusLabel(absence.status)}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex space-x-2">
                    <button onClick={() => handleView(absence)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="Voir dÃ©tails">
                      <Eye size={18}/>
                    </button>
                    <button onClick={() => handleEdit(absence)} className="text-green-600 hover:text-green-800 p-1 rounded" title="Modifier">
                      <Edit size={18}/>
                    </button>
                    <button onClick={() => handleDelete(absence.id)} className="text-red-600 hover:text-red-800 p-1 rounded" title="Supprimer">
                      <Trash2 size={18}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAbsences.length === 0 && (
          <div className="p-8 text-center text-gray-500">Aucune absence trouvÃ©e</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              {modalType === 'add' && 'Nouvelle Absence'}
              {modalType === 'edit' && 'Modifier l\'Absence'}
              {modalType === 'view' && 'DÃ©tails de l\'Absence'}
            </h2>
            
            {modalType === 'view' && selectedAbsence && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ã‰tudiant</label>
                    <p className="text-base text-gray-900">{selectedAbsence.student_name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">NumÃ©ro Ã©tudiant</label>
                    <p className="text-base text-gray-900">{selectedAbsence.student_number}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
                    <p className="text-base text-gray-900">{formatDate(selectedAbsence.date)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cours</label>
                    <p className="text-base text-gray-900">{selectedAbsence.course_name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Motif</label>
                    <p className="text-base text-gray-900">{selectedAbsence.reason}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Statut</label>
                    <span className={`px-2 py-1 rounded-full text-sm ${getStatusColor(selectedAbsence.status)}`}>
                      {getStatusLabel(selectedAbsence.status)}
                    </span>
                  </div>
                </div>
                {selectedAbsence.justification && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Justification</label>
                    <p className="text-base text-gray-900">{selectedAbsence.justification}</p>
                  </div>
                )}
                <div className="flex justify-end pt-4 border dark:border-gray-700-t">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">
                    Fermer
                  </button>
                </div>
              </div>
            )}
            
            {(modalType === 'add' || modalType === 'edit') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Ã‰tudiant</label>
                  <select name="student_id" value={formData.student_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">SÃ©lectionner un Ã©tudiant</option>
                    <option value="1">Jean Dupont</option>
                    <option value="2">Marie Martin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                  <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Motif</label>
                  <input type="text" name="reason" value={formData.reason} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="pending">En attente</option>
                    <option value="justified">JustifiÃ©e</option>
                    <option value="unjustified">Non justifiÃ©e</option>
                  </select>
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">Justification</label>
                  <textarea name="justification" value={formData.justification} onChange={handleInputChange} rows="3" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" placeholder="DÃ©tails de la justification..." />
                </div>
                <div className="flex justify-end pt-4 border dark:border-gray-700-t space-x-3">
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

export default Absences;
