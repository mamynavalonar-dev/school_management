// src/components/Courses/Courses.jsx
// Il s'agit du fichier complet avec les modifications pour utiliser les API

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit, Trash2, Eye, BookOpen, Users, Clock, Award, Save } from 'lucide-react';
import { useUi } from '../../context/UiContext';
import { useNotifications } from '../../hooks/useNotifications';
import apiService from '../../services/api';
import { useApp } from '../../context/AppContext';
import { canManageFeature } from '../../utils/permissions';
import CourseResources from './CourseResources';

const Courses = () => {
  const [courses, setCourses] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterSpecialization, setFilterSpecialization] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add');
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [formData, setFormData] = useState({
    code: '', name: '', description: '', credits: 0, hours_per_week: 0,
    course_type: 'Theory', level_id: '', specialization_id: '', is_mandatory: true
  });
  const { intent, clearIntent } = useUi();
  const { user } = useApp();
  const { success, error: notifyError } = useNotifications();
  const canManageCourses = ['admin', 'directeur'].includes(user?.role)
    && canManageFeature(user, 'courses');

  // États pour les référentiels dynamiques
  const [levels, setLevels] = useState([]);
  const [specializations, setSpecializations] = useState([]);

  // Chargement des cours et des référentiels
  useEffect(() => {
    const loadData = async () => {
      try {
        const [coursesRes, levelsRes, specsRes] = await Promise.all([
          apiService.getCourses(),
          apiService.getLevels(),
          apiService.getSpecializations()
        ]);
        setCourses(coursesRes.data || []);
        setLevels(levelsRes.data || []);
        setSpecializations(specsRes.data || []);
      } catch (err) {
        notifyError('Erreur de chargement des données');
        console.error(err);
      }
    };
    loadData();
  }, [notifyError]);

  const filteredCourses = courses.filter(course =>
    (course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     course.code.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!filterLevel || course.level_id === parseInt(filterLevel)) &&
    (!filterSpecialization || course.specialization_id === parseInt(filterSpecialization)) &&
    (!filterType || course.course_type === filterType)
  );

  const handleAdd = useCallback(() => {
    if (!canManageCourses) return;
    setModalType('add');
    setSelectedCourse(null);
    setFormData({
      code: '', name: '', description: '', credits: 0, hours_per_week: 0,
      course_type: 'Theory', level_id: '', specialization_id: '', is_mandatory: true
    });
    setShowModal(true);
  }, [canManageCourses]);

  useEffect(() => {
    if (intent?.action === 'add') {
      if (canManageCourses) handleAdd();
      else notifyError("Vous n'avez pas l'autorisation de créer un cours.");
      clearIntent();
    }
  }, [intent, clearIntent, canManageCourses, notifyError, handleAdd]);

  const handleEdit = (course) => {
    if (!canManageCourses) return;
    setModalType('edit');
    setSelectedCourse(course);
    setFormData({
      code: course.code, name: course.name, description: course.description,
      credits: course.credits, hours_per_week: course.hours_per_week,
      course_type: course.course_type, level_id: course.level_id,
      specialization_id: course.specialization_id, is_mandatory: course.is_mandatory
    });
    setShowModal(true);
  };

  const handleView = (course) => {
    setModalType('view');
    setSelectedCourse(course);
    setShowModal(true);
  };

  const handleDelete = async (courseId) => {
    if (!canManageCourses) return;
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce cours ?')) return;
    try {
      await apiService.deleteCourse(courseId);
      setCourses(courses.filter(c => c.id !== courseId));
      success('Cours supprimé avec succès.');
    } catch (err) {
      notifyError(err.message || 'Erreur de suppression');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManageCourses) return;
    try {
      if (modalType === 'add') {
        await apiService.createCourse(formData);
        success('Cours créé avec succès.');
        // Recharger les cours
        const coursesRes = await apiService.getCourses();
        setCourses(coursesRes.data || []);
      } else if (modalType === 'edit') {
        await apiService.updateCourse(selectedCourse.id, formData);
        success('Cours modifié avec succès.');
        const coursesRes = await apiService.getCourses();
        setCourses(coursesRes.data || []);
      }
      setShowModal(false);
    } catch (err) {
      notifyError(err.message || 'Erreur lors de l\'enregistrement');
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Theory': return 'bg-blue-100 text-blue-800';
      case 'Practice': return 'bg-green-100 text-green-800';
      case 'Mixed': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800 dark:text-gray-100';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'Theory': return 'Théorique';
      case 'Practice': return 'Pratique';
      case 'Mixed': return 'Mixte';
      default: return type;
    }
  };

  const totalCredits = filteredCourses.reduce((sum, course) => sum + (course.credits || 0), 0);
  const totalHours = filteredCourses.reduce((sum, course) => sum + (course.hours_per_week || 0), 0);
  const totalEnrollments = filteredCourses.reduce((sum, course) => sum + (course.enrolled_students || 0), 0);

  return (
    <div className="courses-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Cours / Matières</h1>
        <p className="text-gray-600 dark:text-gray-400">Gérez le catalogue des cours dispensés dans l'établissement</p>
      </div>

      <div className="filters-bar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="search-bar flex items-center bg-gray-50 dark:bg-gray-900 rounded-lg px-2 py-2 flex-1 min-w-64">
            <Search size={20} className="text-gray-400 mr-2" />
            <input type="text" placeholder="Rechercher un cours par nom ou code..." className="w-full outline-none bg-transparent" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {canManageCourses && <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"><Plus size={20} />Nouveau cours</button>}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Tous les niveaux</option>
            {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
          </select>
          <select value={filterSpecialization} onChange={(e) => setFilterSpecialization(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Toutes les spécialisations</option>
            {specializations.map(spec => <option key={spec.id} value={spec.id}>{spec.name}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-2xl font-medium">
            <option value="">Tous les types</option>
            <option value="Theory">Théorique</option>
            <option value="Practice">Pratique</option>
            <option value="Mixed">Mixte</option>
          </select>
          <button onClick={() => { setFilterLevel(''); setFilterSpecialization(''); setFilterType(''); setSearchTerm(''); }} className="text-blue-600 hover:text-blue-800 text-2xl font-medium px-3 py-2">Réinitialiser</button>
        </div>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Total Cours</h3><p className="text-3xl font-bold text-blue-600">{filteredCourses.length}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Total Crédits</h3><p className="text-3xl font-bold text-green-600">{totalCredits}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Heures/Semaine</h3><p className="text-3xl font-bold text-purple-600">{totalHours}</p></div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700"><h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Étudiants Inscrits</h3><p className="text-3xl font-bold text-orange-600">{totalEnrollments}</p></div>
      </div>

      <div className="courses-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCourses.map(course => (
          <div key={course.id} className="course-card bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div><h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-1">{course.name}</h3><p className="text-lg font-semibold text-gray-500 font-mono">{course.code}</p></div>
                <span className={`px-3 py-1 rounded-full text-xl ${getTypeColor(course.course_type)}`}>{getTypeLabel(course.course_type)}</span>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-xl font-medium mb-4 line-clamp-2">{course.description}</p>
              <div className="course-info space-y-2 mb-4">
                <div className="flex items-center text-xl font-medium text-gray-600 dark:text-gray-400"><BookOpen size={19} className="mr-2 text-blue-500" />{course.level_name || '—'} - {course.specialization_name || '—'}</div>
                <div className="flex items-center text-xl font-medium text-gray-600 dark:text-gray-400"><Award size={19} className="mr-2 text-green-500" />{course.credits} crédits</div>
                <div className="flex items-center text-xl font-medium text-gray-600 dark:text-gray-400"><Clock size={19} className="mr-2 text-purple-500" />{course.hours_per_week}h/semaine</div>
                <div className="flex items-center text-xl font-medium text-gray-600 dark:text-gray-400"><Users size={19} className="mr-2 text-orange-500" />{course.enrolled_students || 0} étudiants</div>
              </div>
              <div className="flex items-center justify-between px-3 py-3 border border-gray-200 rounded-2xl dark:border-gray-700">
                <div><p className="text-xl font-medium text-gray-500">Enseignant</p><p className="text-lg font-medium text-gray-700 dark:text-gray-300">{course.teacher_assigned || 'Non assigné'}</p></div>
                <div className="flex space-x-1">
                  <button onClick={() => handleView(course)} className="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50" title="Voir détails"><Eye size={19} /></button>
                  {canManageCourses && <button onClick={() => handleEdit(course)} className="text-green-600 hover:text-green-800 p-2 rounded-lg hover:bg-green-50" title="Modifier"><Edit size={19} /></button>}
                  {canManageCourses && <button onClick={() => handleDelete(course.id)} className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50" title="Supprimer"><Trash2 size={19} /></button>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {showModal && (
        <div className="modal-overlay app-modal-layer bg-black bg-opacity-50">
          <div className={`modal-content bg-white dark:bg-gray-800 rounded-lg p-6 w-full ${modalType === 'view' ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] overflow-y-auto`}>
            <h2 className="text-3xl font-bold mb-6">
              {modalType === 'add' && 'Nouveau Cours'}
              {modalType === 'edit' && 'Modifier le Cours'}
              {modalType === 'view' && `Détails du Cours`}
            </h2>

            {modalType === 'view' && selectedCourse && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <div><label className="block text-2xl font-semibold text-gray-500">Code</label><p className="text-xl font-medium text-gray-900">{selectedCourse.code}</p></div>
                  <div><label className="block text-2xl font-semibold text-gray-500">Nom</label><p className="text-xl font-medium text-gray-900">{selectedCourse.name}</p></div>
                  <div><label className="block text-2xl font-semibold text-gray-500">Niveau</label><p className="text-xl font-medium text-gray-900">{selectedCourse.level_name || '—'}</p></div>
                  <div><label className="block text-2xl font-semibold text-gray-500">Spécialisation</label><p className="text-xl font-medium text-gray-900">{selectedCourse.specialization_name || '—'}</p></div>
                  <div><label className="block text-2xl font-semibold text-gray-500">Crédits</label><p className="text-xl font-medium text-gray-900">{selectedCourse.credits}</p></div>
                  <div><label className="block text-2xl font-semibold text-gray-500">Heures/Semaine</label><p className="text-xl font-medium text-gray-900">{selectedCourse.hours_per_week}</p></div>
                  <div><label className="block text-2xl font-semibold text-gray-500">Type</label><p className="text-xl font-medium text-gray-900">{getTypeLabel(selectedCourse.course_type)}</p></div>
                  <div><label className="block text-2xl font-semibold text-gray-500">Statut</label><p className="text-xl font-medium text-gray-900">{selectedCourse.is_mandatory ? 'Obligatoire' : 'Optionnel'}</p></div>
                </div>
                <div><label className="block text-2xl font-semibold text-gray-500">Description</label><p className="text-xl font-medium text-gray-900">{selectedCourse.description}</p></div>
                <CourseResources courseId={selectedCourse.id} courseName={selectedCourse.name} />
                <div className="flex justify-end pt-4 mt-6">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-blue-600 text-gray-800 dark:text-blue-100 rounded-lg hover:bg-blue-500">Fermer</button>
                </div>
              </div>
            )}
            
            {(modalType === 'add' || modalType === 'edit') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Code du cours</label><input type="text" name="code" value={formData.code} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du cours</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                </div>
                <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><textarea name="description" value={formData.description} onChange={handleInputChange} rows="3" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Crédits</label><input type="number" name="credits" value={formData.credits} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Heures/semaine</label><input type="number" name="hours_per_week" value={formData.hours_per_week} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Niveau</label>
                    <select name="level_id" value={formData.level_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner</option>
                      {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Spécialisation</label>
                    <select name="specialization_id" value={formData.specialization_id} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner</option>
                      {specializations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="block text-2xl font-medium text-gray-700 dark:text-gray-300 mb-1">Type de cours</label>
                  <select name="course_type" value={formData.course_type} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="Theory">Théorique</option>
                    <option value="Practice">Pratique</option>
                    <option value="Mixed">Mixte</option>
                  </select>
                </div>
                <div className="flex items-center"><input type="checkbox" name="is_mandatory" checked={formData.is_mandatory} onChange={handleInputChange} className="h-6 w-6 rounded" /><label className="ml-2 text-2xl text-gray-700 dark:text-gray-300">Ce cours est obligatoire</label></div>
                <div className="flex justify-end space-x-3 pt-4 mt-6">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900">Annuler</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save size={18}/> {modalType === 'add' ? 'Créer' : 'Sauvegarder'}
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

export default Courses;
