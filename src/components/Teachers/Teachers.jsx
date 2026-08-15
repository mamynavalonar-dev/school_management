// src/components/Teachers/Teachers.jsx
import { useCallback, useState, useEffect } from "react";
import { Search, Edit, Trash2, Eye, Award, Save, Info, Printer, X } from "lucide-react";
import { useUi } from "../../context/UiContext";
import { useApp } from "../../context/AppContext";
import { useNotifications } from "../../hooks/useNotifications";
import apiService from "../../services/api";
import PhotoPicker from "../shared/PhotoPicker";
import { canManageFeature } from "../../utils/permissions";

const Teachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("view"); // "view" | "edit" — pas de "add" ici
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const { success, error: notifyError } = useNotifications();
  const { intent, clearIntent, goTo } = useUi();
  const { user } = useApp();
  const canManageTeachers = canManageFeature(user, 'teachers');
  const canTableActions = ['admin', 'directeur'].includes(user?.role);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    birth_date: "",
    address: "",
    city: "",
    postal_code: "",
    gender: "",
    nationality: "",
    profession: "",
    diploma: "",
    department: "",
    title: "",
    specialization: "",
    hire_date: "",
    salary: "",
    contract_type: "",
    contract_start_date: "",
    contract_end_date: "",
    photo_url: "",
    status: "active",
  });

  const loadTeachers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.getTeachers();
      setTeachers(res?.data ?? []);
    } catch (err) {
      console.error("Failed to load teachers:", err);
      notifyError("Impossible de charger la liste des enseignants.");
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  // Un profil enseignant est créé automatiquement avec le compte enseignant
  // dans la gestion unifiée des utilisateurs. Il n'y a donc
  // pas de formulaire de création ici : "add" redirige vers la gestion des
  // utilisateurs, où le compte + profil sont créés ensemble.
  useEffect(() => {
    if (intent?.action === "add") {
      if (canManageTeachers) {
        notifyError('Créez un enseignant depuis "Gestion des utilisateurs" (rôle Enseignant) — le profil est généré automatiquement.');
        goTo('admin-users');
      } else {
        notifyError("Vous n'avez pas l'autorisation de créer un enseignant.");
      }
      clearIntent();
    }
  }, [intent, clearIntent, goTo, notifyError, canManageTeachers]);

  const filteredTeachers = teachers.filter(
    (teacher) =>
      `${teacher.first_name} ${teacher.last_name}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (teacher.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.department || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.specialization || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.title || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleEdit = (teacher) => {
    setModalType("edit");
    setSelectedTeacher(teacher);
    setFormData({
      first_name: teacher.first_name || "",
      last_name: teacher.last_name || "",
      email: teacher.email || "",
      phone: teacher.phone || "",
      birth_date: teacher.birth_date || "",
      address: teacher.address || "",
      city: teacher.city || "",
      postal_code: teacher.postal_code || "",
      gender: teacher.gender || "",
      nationality: teacher.nationality || "",
      profession: teacher.profession || "",
      diploma: teacher.diploma || "",
      department: teacher.department || "",
      title: teacher.title || "",
      specialization: teacher.specialization || "",
      hire_date: teacher.hire_date || "",
      salary: teacher.salary || "",
      contract_type: teacher.contract_type || "",
      contract_start_date: teacher.contract_start_date || "",
      contract_end_date: teacher.contract_end_date || "",
      photo_url: teacher.photo_url || "",
      status: teacher.status || "active",
    });
    setShowModal(true);
  };

  const handleView = (teacher) => {
    setModalType("view");
    setSelectedTeacher(teacher);
    setShowModal(true);
  };

  const handleDelete = async (teacher) => {
    if (user?.role !== "admin") {
      notifyError("Seul un administrateur peut supprimer définitivement l’accès à un compte.");
      return;
    }
    if (!teacher?.user_id) {
      notifyError("Ce profil n’est rattaché à aucun compte utilisateur.");
      return;
    }
    if (!window.confirm(`Supprimer le compte de ${teacher.first_name} ${teacher.last_name} ? L’accès sera révoqué, mais les historiques professionnels seront conservés.`)) return;
    try {
      const res = await apiService.deleteAdminUser(teacher.user_id);
      if (res?.success === false) throw new Error(res.message);
      setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
      success("Compte enseignant supprimé et accès révoqués.");
    } catch (err) {
      console.error("Failed to delete teacher:", err);
      notifyError(err.message || "Échec de la suppression.");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiService.updateTeacher(selectedTeacher.id, formData);
      if (res?.success === false) throw new Error(res.message);
      success("Profil enseignant mis à jour.");
      setShowModal(false);
      await loadTeachers();
    } catch (err) {
      console.error("Failed to update teacher:", err);
      notifyError(err.message || "Échec de la mise à jour.");
    }
  };

  const getExperienceYears = (hireDate) => {
    if (!hireDate) return 0;
    return new Date().getFullYear() - new Date(hireDate).getFullYear();
  };

  const getTitleColor = (title) => {
    switch (title) {
      case "Professeur Émérite": return "bg-purple-100 text-purple-800";
      case "Professeur": return "bg-blue-100 text-blue-800";
      case "Maître de Conférences": return "bg-green-100 text-green-800";
      case "Assistant": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800 dark:text-gray-100";
    }
  };

  const statusLabel = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "active") return { text: "Actif", className: "bg-green-100 text-green-800" };
    if (s === "on_leave") return { text: "En congé", className: "bg-amber-100 text-amber-800" };
    return { text: "Inactif", className: "bg-red-100 text-red-800" };
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse bg-gray-200 rounded-lg h-64"></div>
      </div>
    );
  }

  return (
    <div className="teachers-container p-6">
      <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Gestion des Enseignants</h1>
        <p className="text-gray-600 dark:text-gray-400">Gérez les profils des enseignants et formateurs</p>
      </div>

      {canManageTeachers && <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 mb-6 flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200">
        <Info size={18} className="mt-0.5 flex-shrink-0" />
        <span>Les nouveaux enseignants sont créés depuis "Gestion des utilisateurs" (rôle Enseignant) : le profil ci-dessous est généré automatiquement à l'inscription du compte.</span>
      </div>}

      <div className="actions-bar flex justify-between items-center mb-6">
        <div className="search-bar flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 px-4 py-2 w-1/3">
          <Search size={20} className="text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Rechercher un enseignant..."
            className="w-full outline-none bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total Enseignants</h3>
          <p className="text-3xl font-bold text-blue-600">{teachers.length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Professeurs</h3>
          <p className="text-3xl font-bold text-purple-600">
            {teachers.filter((t) => (t.title || "").includes("Professeur")).length}
          </p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Départements</h3>
          <p className="text-3xl font-bold text-green-600">
            {new Set(teachers.map((t) => t.department).filter(Boolean)).size}
          </p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Actifs</h3>
          <p className="text-3xl font-bold text-orange-600">
            {teachers.filter((t) => (t.status || "").toLowerCase() === "active").length}
          </p>
        </div>
      </div>

      <div className="teachers-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Enseignant</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Département</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Grade</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Spécialisation</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Expérience</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Statut</th>
              {canTableActions && <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.map((teacher) => {
              const st = statusLabel(teacher.status);
              return (
                <tr key={teacher.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="p-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {teacher.first_name} {teacher.last_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{teacher.email}</div>
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{teacher.department || '—'}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTitleColor(teacher.title)}`}>
                      {teacher.title || '—'}
                    </span>
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{teacher.specialization || '—'}</td>
                  <td className="p-4">
                    <div className="flex items-center">
                      <Award size={16} className="text-yellow-500 mr-1" />
                      <span className="text-gray-600 dark:text-gray-400">{getExperienceYears(teacher.hire_date)} ans</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${st.className}`}>{st.text}</span>
                  </td>
                  {canTableActions && (
                    <td className="p-4">
                      <div className="flex space-x-2">
                        <button onClick={() => handleView(teacher)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="Voir détails"><Eye size={18} /></button>
                        {canManageTeachers && <>
                          <button onClick={() => handleEdit(teacher)} className="text-green-600 hover:text-green-800 p-1 rounded" title="Modifier"><Edit size={18} /></button>
                          {user?.role === "admin" && <button onClick={() => handleDelete(teacher)} className="text-red-600 hover:text-red-800 p-1 rounded" title="Supprimer le compte"><Trash2 size={18} /></button>}
                        </>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredTeachers.length === 0 && (
          <div className="p-8 text-center text-gray-500">Aucun enseignant trouvé</div>
        )}
      </div>

      {showModal && (
        <div className="app-modal-layer bg-black/60 backdrop-blur-sm">
          <div className={`app-modal-dialog bg-white dark:bg-gray-800 rounded-2xl w-full ${modalType === 'edit' ? 'max-w-6xl' : 'max-w-4xl'} shadow-2xl border dark:border-gray-700`}>
            <div className="app-modal-body p-6">
            <div className="flex justify-between items-start gap-4 mb-5"><div><h2 className="text-3xl font-bold">{modalType === "edit" ? "Modifier le profil de l'enseignant" : "Détails de l'enseignant"}</h2><p className="text-gray-500">{selectedTeacher?.teacher_number} · {selectedTeacher?.email}</p></div><button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Fermer"><X size={24} /></button></div>

            {modalType === "view" && selectedTeacher && (
              <div className="space-y-4">
                <div className="school-print-area"><TeacherCard teacher={selectedTeacher} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nom complet" value={`${selectedTeacher.first_name} ${selectedTeacher.last_name}`} />
                  <Field label="Numéro enseignant" value={selectedTeacher.teacher_number} />
                  <Field label="Email" value={selectedTeacher.email} />
                  <Field label="Téléphone" value={selectedTeacher.phone || '—'} />
                  <Field label="Date de naissance" value={selectedTeacher.birth_date ? new Date(selectedTeacher.birth_date).toLocaleDateString() : '—'} />
                  <Field label="Sexe" value={selectedTeacher.gender || '—'} />
                  <Field label="Nationalité" value={selectedTeacher.nationality || '—'} />
                  <Field label="Profession" value={selectedTeacher.profession || 'Enseignant'} />
                  <Field label="Diplôme" value={selectedTeacher.diploma || '—'} />
                  <Field label="Département" value={selectedTeacher.department || '—'} />
                  <Field label="Grade" value={selectedTeacher.title || '—'} />
                  <Field label="Spécialisation" value={selectedTeacher.specialization || '—'} />
                  <Field label="Date d'embauche" value={selectedTeacher.hire_date ? new Date(selectedTeacher.hire_date).toLocaleDateString() : '—'} />
                  <Field label="Expérience" value={`${getExperienceYears(selectedTeacher.hire_date)} ans`} />
                  <Field label="Type de contrat" value={selectedTeacher.contract_type || '—'} />
                  <Field label="Début du contrat" value={selectedTeacher.contract_start_date ? new Date(selectedTeacher.contract_start_date).toLocaleDateString() : '—'} />
                  <Field label="Fin du contrat" value={selectedTeacher.contract_end_date ? new Date(selectedTeacher.contract_end_date).toLocaleDateString() : '—'} />
                  {canManageTeachers && <Field label="Salaire" value={selectedTeacher.salary ? Number(selectedTeacher.salary).toLocaleString('fr-FR') : '—'} />}
                </div>
                <Field label="Adresse" value={[selectedTeacher.address, selectedTeacher.city, selectedTeacher.postal_code].filter(Boolean).join(', ') || '—'} />
                <div className="flex justify-end gap-3 mt-6 pt-4">
                  <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 border dark:border-gray-700 rounded-lg"><Printer size={17} /> Imprimer la carte</button>
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500">Fermer</button>
                </div>
              </div>
            )}

            {modalType === "edit" && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4"><h3 className="font-bold text-lg">Profil professionnel</h3><p className="text-sm text-gray-600 dark:text-gray-300">Renseignez l’identité, l’affectation et le contrat dans des blocs lisibles. La photo peut être importée depuis le PC.</p></div>
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 rounded-2xl border dark:border-gray-700 p-5">
                  <div className="md:col-span-2 xl:col-span-3"><h3 className="text-lg font-bold border-b dark:border-gray-700 pb-2">Identité et coordonnées</h3></div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prénom *</label>
                    <input type="text" name="first_name" value={formData.first_name} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
                    <input type="text" name="last_name" value={formData.last_name} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de naissance</label>
                    <input type="date" name="birth_date" value={formData.birth_date} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <EditSelect label="Sexe" name="gender" value={formData.gender} onChange={handleInputChange} options={genderOptions} />
                  <EditField label="Nationalité" name="nationality" value={formData.nationality} onChange={handleInputChange} />
                  <EditField label="Profession" name="profession" value={formData.profession} onChange={handleInputChange} />
                  <EditField label="Diplôme" name="diploma" value={formData.diploma} onChange={handleInputChange} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date d'embauche</label>
                    <input type="date" name="hire_date" value={formData.hire_date} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Département</label>
                    <input type="text" name="department" value={formData.department} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grade / Titre</label>
                    <input type="text" name="title" value={formData.title} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div className="md:col-span-2 xl:col-span-3"><h3 className="text-lg font-bold border-b dark:border-gray-700 pb-2 mt-2">Affectation et qualification</h3></div>
                  <div className="md:col-span-2 xl:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Spécialisation</label>
                    <input type="text" name="specialization" value={formData.specialization} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <EditField label="Ville" name="city" value={formData.city} onChange={handleInputChange} />
                  <EditField label="Code postal" name="postal_code" value={formData.postal_code} onChange={handleInputChange} />
                  <EditField label="Salaire" name="salary" value={formData.salary} onChange={handleInputChange} type="number" />
                  <EditField label="Type de contrat" name="contract_type" value={formData.contract_type} onChange={handleInputChange} placeholder="CDI, CDD, vacataire…" />
                  <EditField label="Début du contrat" name="contract_start_date" value={formData.contract_start_date} onChange={handleInputChange} type="date" />
                  <EditField label="Fin du contrat" name="contract_end_date" value={formData.contract_end_date} onChange={handleInputChange} type="date" />
                  <div className="md:col-span-2 xl:col-span-3"><h3 className="text-lg font-bold border-b dark:border-gray-700 pb-2 mt-2">Contrat et rémunération</h3></div>
                  <div className="md:col-span-2 xl:col-span-3"><PhotoPicker value={formData.photo_url} onChange={(value) => setFormData((current) => ({ ...current, photo_url: value }))} label="Photo de l’enseignant" /></div>
                  <div className="md:col-span-2 xl:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse</label>
                    <textarea name="address" value={formData.address} onChange={handleInputChange} rows="2" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="active">Actif</option>
                      <option value="inactive">Inactif</option>
                      <option value="on_leave">En congé</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4 mt-4 border-t dark:border-gray-700">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900">Annuler</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save size={16} /> Sauvegarder
                  </button>
                </div>
              </form>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, value }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</label>
    <p className="text-gray-900 dark:text-gray-100">{value}</p>
  </div>
);

const EditField = ({ label, name, value, onChange, type = 'text', placeholder }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent" />
  </div>
);

const genderOptions = [['', 'Non renseigné'], ['male', 'Masculin'], ['female', 'Féminin'], ['other', 'Autre']];
const EditSelect = ({ label, name, value, onChange, options }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    <select name={name} value={value ?? ''} onChange={onChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent">
      {options.map(([key, text]) => <option key={key || 'empty'} value={key}>{text}</option>)}
    </select>
  </div>
);

const TeacherCard = ({ teacher }) => <article className="max-w-3xl rounded-2xl overflow-hidden border-2 border-blue-200 bg-white text-gray-900 shadow-sm">
  <header className="bg-gradient-to-r from-blue-700 to-purple-700 text-white px-5 py-4"><p className="text-xs uppercase tracking-[0.2em] opacity-80">Carte professionnelle</p><h3 className="text-xl font-bold">Établissement universitaire</h3></header>
  <div className="p-5 grid grid-cols-[8rem_1fr] gap-5 items-center">
    {teacher.photo_url ? <img src={teacher.photo_url} alt="" className="w-28 h-32 object-cover rounded-xl border" /> : <span className="w-28 h-32 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white grid place-items-center text-3xl font-bold">{`${teacher.first_name?.[0] || ''}${teacher.last_name?.[0] || ''}`}</span>}
    <div><h4 className="text-2xl font-bold">{teacher.first_name} {teacher.last_name}</h4><p className="text-blue-700 font-bold text-lg">{teacher.teacher_number}</p><p className="mt-2">{teacher.title || teacher.profession || 'Enseignant'}</p><p>{teacher.department || 'Département non renseigné'}</p><p className="text-sm text-gray-500 mt-2">{teacher.email}</p></div>
  </div>
</article>;

export default Teachers;
