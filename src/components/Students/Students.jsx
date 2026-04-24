import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye, UserPlus, Save, X, AlertCircle } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useUi } from '../../context/UiContext';
import { generateStudentNumber } from '../../utils/helpers';

const Students = () => {
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [levels, setLevels] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    address: '',
    level: '',
    specialization: '',
    status: 'Active'
  });
  const [capacityInfo, setCapacityInfo] = useState({ available: true, message: '' });

  const { success, error } = useNotifications();
  const { intent, clearIntent } = useUi();

  useEffect(() => {
    if (intent?.action === 'add') {
      handleAdd();
      clearIntent();
    }
  }, [intent, clearIntent]);
  
  // Simulation de donnÃ©es
  useEffect(() => {
    const mockStudents = [
      { id: 1, studentNumber: 'STU20240001', firstName: 'Jean', lastName: 'Dupont', email: 'jean.dupont@email.com', phone: '0123456789', birthDate: '2000-05-15', address: '123 Rue de la Paix, Paris', level: 'L1', specialization: 'Informatique', enrollmentDate: '2023-09-01', status: 'Active' },
      { id: 2, studentNumber: 'STU20240002', firstName: 'Marie', lastName: 'Martin', email: 'marie.martin@email.com', phone: '0987654321', birthDate: '1999-12-03', address: '456 Avenue des Champs, Lyon', level: 'L2', specialization: 'MathÃ©matiques', enrollmentDate: '2022-09-01', status: 'Active' }
    ];

    const mockLevels = [
      { id: 1, name: 'L1', capacity: 30 },
      { id: 2, name: 'L2', capacity: 25 },
      { id: 3, name: 'L3', capacity: 20 },
      { id: 4, name: 'M1', capacity: 15 },
      { id: 5, name: 'M2', capacity: 10 }
    ];

    const mockSpecializations = [
      { id: 1, name: 'Informatique', capacity: 40 },
      { id: 2, name: 'MathÃ©matiques', capacity: 35 },
      { id: 3, name: 'Physique', capacity: 30 },
      { id: 4, name: 'Chimie', capacity: 25 }
    ];

    setStudents(mockStudents);
    setLevels(mockLevels);
    setSpecializations(mockSpecializations);
  }, []);
  
  const checkCapacity = (levelName, specializationName) => {
    const level = levels.find(l => l.name === levelName);
    const specialization = specializations.find(s => s.name === specializationName);
    
    if (!level || !specialization) {
      return { available: true, message: '' };
    }

    const currentEnrollments = students.filter(s => 
      s.level === level.name && s.specialization === specialization.name
    ).length;
    
    const maxCapacity = Math.min(level.capacity, specialization.capacity);
    
    if (currentEnrollments >= maxCapacity) {
      return { available: false, message: `CapacitÃ© maximale (${maxCapacity}) atteinte pour ${levelName} - ${specializationName}.` };
    }
    
    return { available: true, message: `Places disponibles: ${maxCapacity - currentEnrollments}/${maxCapacity}` };
  };

  useEffect(() => {
    if (modalType === 'add' && formData.level && formData.specialization) {
      const capacityResult = checkCapacity(formData.level, formData.specialization);
      setCapacityInfo(capacityResult);
    } else {
      setCapacityInfo({ available: true, message: '' });
    }
  }, [formData.level, formData.specialization, modalType, students]);


  const filteredStudents = students.filter(student =>
    `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.level.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.specialization.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = () => {
    setModalType('add');
    setSelectedStudent(null);
    setFormData({
      firstName: '', lastName: '', email: '', phone: '',
      birthDate: '', address: '', level: '', specialization: '',
      status: 'Active'
    });
    setShowModal(true);
  };

  const handleEdit = (student) => {
    setModalType('edit');
    setSelectedStudent(student);
    setFormData({
      firstName: student.firstName, lastName: student.lastName, email: student.email,
      phone: student.phone, birthDate: student.birthDate, address: student.address,
      level: student.level, specialization: student.specialization, status: student.status
    });
    setShowModal(true);
  };

  const handleView = (student) => {
    setModalType('view');
    setSelectedStudent(student);
    setShowModal(true);
  };

  const handleEnroll = (student) => {
    setModalType('enroll');
    setSelectedStudent(student);
    setShowModal(true);
  };

  const handleDelete = (studentId) => {
    if (window.confirm('ÃŠtes-vous sÃ»r de vouloir supprimer cet Ã©tudiant ?')) {
      setStudents(students.filter(s => s.id !== studentId));
      success('Ã‰tudiant supprimÃ© avec succÃ¨s');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (modalType === 'add') {
      if (!capacityInfo.available) {
        error("Impossible de crÃ©er l'Ã©tudiant, la capacitÃ© de la classe est atteinte.");
        return;
      }
      const newStudent = {
        id: Math.max(...students.map(s => s.id)) + 1,
        studentNumber: generateStudentNumber(),
        ...formData,
        enrollmentDate: new Date().toISOString().split('T')[0]
      };
      setStudents([...students, newStudent]);
      success('Ã‰tudiant crÃ©Ã© avec succÃ¨s');
    } else if (modalType === 'edit') {
      setStudents(students.map(s => 
        s.id === selectedStudent.id ? { ...s, ...formData } : s
      ));
      success('Ã‰tudiant modifiÃ© avec succÃ¨s');
    }
    setShowModal(false);
  };

  return (
    <div className="students-container p-6">
      <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Ã‰tudiants</h1>
        <p className="text-gray-600 dark:text-gray-400">GÃ©rez les profils, inscriptions et effectifs des Ã©tudiants</p>
      </div>

      <div className="actions-bar flex justify-between items-center mb-6">
        <div className="search-bar flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 px-4 py-2 w-1/3">
          <Search size={20} className="text-gray-400 mr-2" />
          <input type="text" placeholder="Rechercher un Ã©tudiant..." className="w-full outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors">
          <Plus size={20} /> Nouveau Ã©tudiant
        </button>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Total Ã‰tudiants</h3>
          <p className="text-3xl font-bold text-blue-600">{students.length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Nouveaux (2024)</h3>
          <p className="text-3xl font-bold text-green-600">{students.filter(s => s.enrollmentDate.startsWith('2024')).length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Actifs</h3>
          <p className="text-3xl font-bold text-purple-600">{students.filter(s => s.status === 'Active').length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">SpÃ©cialisations</h3>
          <p className="text-3xl font-bold text-orange-600">{specializations.length}</p>
        </div>
      </div>

      <div className="students-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Nom complet</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Email</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Niveau</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">SpÃ©cialisation</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Statut</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map(student => (
              <tr key={student.id} className="border dark:border-gray-700-t hover:bg-gray-50 dark:bg-gray-900">
                <td className="p-4">
                  <div>
                    <div className="font-medium text-gray-900">{student.firstName} {student.lastName}</div>
                    <div className="text-sm text-gray-500">{student.phone}</div>
                  </div>
                </td>
                <td className="p-4 text-gray-600 dark:text-gray-400">{student.email}</td>
                <td className="p-4">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">{student.level}</span>
                </td>
                <td className="p-4 text-gray-600 dark:text-gray-400">{student.specialization}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-sm ${student.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{student.status}</span>
                </td>
                <td className="p-4">
                  <div className="flex space-x-2">
                    <button onClick={() => handleView(student)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="Voir dÃ©tails"><Eye size={16} /></button>
                    <button onClick={() => handleEdit(student)} className="text-green-600 hover:text-green-800 p-1 rounded" title="Modifier"><Edit size={16} /></button>
                    <button onClick={() => handleEnroll(student)} className="text-purple-600 hover:text-purple-800 p-1 rounded" title="GÃ©rer inscription"><UserPlus size={16} /></button>
                    <button onClick={() => handleDelete(student.id)} className="text-red-600 hover:text-red-800 p-1 rounded" title="Supprimer"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredStudents.length === 0 && (<div className="p-8 text-center text-gray-500">Aucun Ã©tudiant trouvÃ©</div>)}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {modalType === 'add' && 'Nouveau Ã©tudiant'}
              {modalType === 'edit' && 'Modifier Ã©tudiant'}
              {modalType === 'view' && 'DÃ©tails de l\'Ã©tudiant'}
              {modalType === 'enroll' && 'GÃ©rer inscription'}
            </h2>
            
            {modalType === 'view' && selectedStudent && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nom complet</label><p className="text-gray-900 text-base">{selectedStudent.firstName} {selectedStudent.lastName}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">NumÃ©ro Ã©tudiant</label><p className="text-gray-900 text-base">{selectedStudent.studentNumber}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label><p className="text-gray-900 text-base">{selectedStudent.email}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">TÃ©lÃ©phone</label><p className="text-gray-900 text-base">{selectedStudent.phone}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date de naissance</label><p className="text-gray-900 text-base">{new Date(selectedStudent.birthDate).toLocaleDateString()}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Niveau</label><p className="text-gray-900 text-base">{selectedStudent.level}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">SpÃ©cialisation</label><p className="text-gray-900 text-base">{selectedStudent.specialization}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date d'inscription</label><p className="text-gray-900 text-base">{new Date(selectedStudent.enrollmentDate).toLocaleDateString()}</p></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Statut</label><span className={`px-2 py-1 rounded-full text-sm ${selectedStudent.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{selectedStudent.status}</span></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Adresse</label><p className="text-gray-900 text-base">{selectedStudent.address}</p></div>
                <div className="flex justify-end pt-4 mt-4 border dark:border-gray-700-t">
                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300">Fermer</button>
                </div>
              </div>
            )}
            
            {modalType === 'enroll' && selectedStudent && (
              <form onSubmit={(e) => { e.preventDefault(); success('Inscription mise Ã  jour avec succÃ¨s'); setShowModal(false); }} className="space-y-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-4">
                  <h3 className="font-semibold text-lg">{selectedStudent.firstName} {selectedStudent.lastName}</h3>
                  <p className="text-sm">NumÃ©ro: {selectedStudent.studentNumber}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nouveau Niveau</label>
                    <select name="level" defaultValue={selectedStudent.level} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500">
                      <option value="">SÃ©lectionner</option>
                      {levels.map(level => (<option key={level.id} value={level.name}>{level.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nouvelle SpÃ©cialisation</label>
                    <select name="specialization" defaultValue={selectedStudent.specialization} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500">
                      <option value="">SÃ©lectionner</option>
                      {specializations.map(spec => (<option key={spec.id} value={spec.name}>{spec.name}</option>))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4 border dark:border-gray-700-t mt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border dark:border-gray-700 border dark:border-gray-700-gray-300 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900">Annuler</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save size={16} /> Mettre Ã  jour l'inscription
                  </button>
                </div>
              </form>
            )}
            
            {(modalType === 'add' || modalType === 'edit') && (
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PrÃ©nom *</label><input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label><input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TÃ©lÃ©phone</label><input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de naissance</label><input type="date" name="birthDate" value={formData.birthDate} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Niveau</label><select name="level" value={formData.level} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500"><option value="">SÃ©lectionner un niveau</option>{levels.map(level => (<option key={level.id} value={level.name}>{level.name}</option>))}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SpÃ©cialisation</label><select name="specialization" value={formData.specialization} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500"><option value="">SÃ©lectionner une spÃ©cialisation</option>{specializations.map(spec => (<option key={spec.id} value={spec.name}>{spec.name}</option>))}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut</label><select name="status" value={formData.status} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500"><option value="Active">Actif</option><option value="Inactive">Inactif</option><option value="Suspended">Suspendu</option><option value="Graduated">DiplÃ´mÃ©</option></select></div>
                  <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse</label><textarea name="address" value={formData.address} onChange={handleInputChange} rows="3" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border dark:border-gray-700-blue-500" /></div>
                </div>

                {modalType === 'add' && formData.level && formData.specialization && (
                    <div className={`mt-4 p-3 rounded-lg flex items-center text-sm ${capacityInfo.available ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                        <AlertCircle size={20} className="mr-2" /> {capacityInfo.message}
                    </div>
                )}


                <div className="flex justify-end space-x-3 pt-4 border dark:border-gray-700-t">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border dark:border-gray-700 border dark:border-gray-700-gray-300 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900">Annuler</button>
                  <button type="submit" disabled={modalType === 'add' && !capacityInfo.available} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <Save size={16} />{modalType === 'add' ? 'CrÃ©er' : 'Modifier'}
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

export default Students;
