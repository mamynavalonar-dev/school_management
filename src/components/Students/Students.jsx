// src/components/Students/Students.jsx
import { useCallback, useState, useEffect, useMemo } from "react";
import {
  Search,
  Edit,
  Trash2,
  Eye,
  UserPlus,
  Save,
  X,
  Info,
  History,
  FolderOpen,
} from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { useUi } from "../../context/UiContext";
import { useApp } from "../../context/AppContext";
import apiService from "../../services/api";
import PhotoPicker from "../shared/PhotoPicker";
import { canManageFeature } from "../../utils/permissions";

const Students = () => {
  const [students, setStudents] = useState([]);
  const [levels, setLevels] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [groups, setGroups] = useState([]);
  // Inscription active par student_id (id -> ligne enrollments), pour
  // afficher niveau/spécialisation courants dans le tableau sans refaire
  // un appel par étudiant.
  const [activeEnrollments, setActiveEnrollments] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("view"); // "view" | "edit" | "enroll" | "history"
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    birth_date: "",
    birth_place: "",
    address: "",
    city: "",
    postal_code: "",
    gender: "",
    nationality: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    photo_url: "",
    status: "active",
  });

  const [enrollForm, setEnrollForm] = useState({
    level_id: "",
    specialization_id: "",
    academic_year: currentAcademicYear(),
    academic_year_id: "",
    group_id: "",
  });
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollError, setEnrollError] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { success, error: notifyError } = useNotifications();
  const { intent, clearIntent, goTo } = useUi();
  const { user } = useApp();
  const canManageStudents = canManageFeature(user, 'students');
  const canTableActions = ['admin', 'directeur'].includes(user?.role);

  function currentAcademicYear() {
    const now = new Date();
    const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
  }

  // Un profil étudiant est créé automatiquement à l'inscription d'un compte
  // "student" (voir auth.php::createStudentProfile / admin_users.php).
  // Il n'y a donc pas de formulaire de création ici : "add" redirige vers
  // la gestion des utilisateurs, où le compte + profil sont créés ensemble.
  useEffect(() => {
    if (intent?.action === "add") {
      if (canManageStudents) {
        notifyError('Créez un étudiant depuis "Gestion des utilisateurs" (rôle Étudiant) — le profil est généré automatiquement.');
        goTo("admin-users");
      } else {
        notifyError("Vous n'avez pas l'autorisation de créer un étudiant.");
      }
      clearIntent();
    }
  }, [intent, clearIntent, goTo, notifyError, canManageStudents]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [studentsRes, levelsRes, specsRes, enrollmentsRes, schoolRefsRes, groupsRes] = await Promise.all([
        apiService.getStudents(),
        apiService.getLevels(),
        apiService.getSpecializations(),
        apiService.getEnrollments(),
        apiService.getSchoolResource('reference_data'),
        apiService.getSchoolResource('groups'),
      ]);

      setStudents(studentsRes?.data ?? []);
      setLevels(levelsRes?.data ?? []);
      setSpecializations(specsRes?.data ?? []);
      setSchoolYears(schoolRefsRes?.data?.years ?? []);
      setGroups(groupsRes?.data ?? []);

      // Ne garde que l'inscription 'Enrolled' la plus récente par étudiant.
      const byStudent = {};
      for (const e of enrollmentsRes?.data ?? []) {
        if (e.status !== "Enrolled") continue;
        const existing = byStudent[e.student_id];
        if (!existing || new Date(e.enrollment_date) > new Date(existing.enrollment_date)) {
          byStudent[e.student_id] = e;
        }
      }
      setActiveEnrollments(byStudent);
    } catch (err) {
      console.error("Failed to load students:", err);
      notifyError("Impossible de charger la liste des étudiants.");
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredStudents = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return students.filter((s) => {
      const enrollment = activeEnrollments[s.id];
      return (
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(term) ||
        (s.email || "").toLowerCase().includes(term) ||
        (s.student_number || "").toLowerCase().includes(term) ||
        (enrollment?.level_name || "").toLowerCase().includes(term) ||
        (enrollment?.specialization_name || "").toLowerCase().includes(term)
      );
    });
  }, [students, searchTerm, activeEnrollments]);

  const handleView = (student) => {
    setModalType("view");
    setSelectedStudent(student);
    setShowModal(true);
  };

  const handleEdit = (student) => {
    setModalType("edit");
    setSelectedStudent(student);
    setFormData({
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      email: student.email || "",
      phone: student.phone || "",
      birth_date: student.birth_date || "",
      birth_place: student.birth_place || "",
      address: student.address || "",
      city: student.city || "",
      postal_code: student.postal_code || "",
      gender: student.gender || "",
      nationality: student.nationality || "",
      emergency_contact_name: student.emergency_contact_name || "",
      emergency_contact_phone: student.emergency_contact_phone || "",
      photo_url: student.photo_url || "",
      status: student.status || "active",
    });
    setShowModal(true);
  };

  const handleEnroll = (student) => {
    setModalType("enroll");
    setSelectedStudent(student);
    setEnrollError(null);
    const current = activeEnrollments[student.id];
    const activeYear = schoolYears.find((year) => Number(year.is_active) === 1) || schoolYears[0];
    setEnrollForm({
      level_id: current?.level_id ?? "",
      specialization_id: current?.specialization_id ?? "",
      academic_year: activeYear?.name || currentAcademicYear(),
      academic_year_id: activeYear?.id || "",
      group_id: current?.group_id ?? "",
    });
    setShowModal(true);
  };

  const handleHistory = async (student) => {
    setModalType("history");
    setSelectedStudent(student);
    setShowModal(true);
    setHistoryLoading(true);
    try {
      const res = await apiService.getEnrollments(student.id);
      setHistory(res?.data ?? []);
    } catch (err) {
      console.error("Failed to load enrollment history:", err);
      notifyError("Impossible de charger l'historique des inscriptions.");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDelete = async (student) => {
    if (user?.role !== "admin") {
      notifyError("Seul un administrateur peut supprimer définitivement l’accès à un compte.");
      return;
    }
    if (!student?.user_id) {
      notifyError("Ce profil n’est rattaché à aucun compte utilisateur.");
      return;
    }
    if (!window.confirm(`Supprimer le compte de ${student.first_name} ${student.last_name} ? L’accès sera révoqué, mais les historiques scolaires seront conservés.`)) return;
    try {
      const res = await apiService.deleteAdminUser(student.user_id);
      if (res?.success === false) throw new Error(res.message);
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      success("Compte étudiant supprimé et accès révoqués.");
    } catch (err) {
      console.error("Failed to delete student:", err);
      notifyError(err.message || "Échec de la suppression.");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEnrollInputChange = (e) => {
    const { name, value } = e.target;
    setEnrollForm((prev) => ({ ...prev, [name]: value }));
    setEnrollError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiService.updateStudent(selectedStudent.id, formData);
      if (res?.success === false) throw new Error(res.message);
      success("Profil étudiant mis à jour.");
      setShowModal(false);
      await loadAll();
    } catch (err) {
      console.error("Failed to update student:", err);
      notifyError(err.message || "Échec de la mise à jour.");
    }
  };

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    setEnrollError(null);

    if (!enrollForm.level_id || !enrollForm.specialization_id || !enrollForm.academic_year) {
      setEnrollError("Tous les champs sont requis.");
      return;
    }

    setEnrollSubmitting(true);
    try {
      const res = await apiService.createEnrollment({
        student_id: selectedStudent.id,
        level_id: Number(enrollForm.level_id),
        specialization_id: Number(enrollForm.specialization_id),
        academic_year: enrollForm.academic_year,
        academic_year_id: enrollForm.academic_year_id ? Number(enrollForm.academic_year_id) : null,
        group_id: enrollForm.group_id ? Number(enrollForm.group_id) : null,
      });
      if (res?.success === false) throw new Error(res.message);
      success(`${selectedStudent.first_name} ${selectedStudent.last_name} inscrit(e) avec succès.`);
      setShowModal(false);
      await loadAll();
    } catch (err) {
      console.error("Failed to enroll student:", err);
      // Erreur métier (capacité atteinte, etc.) : on l'affiche dans le
      // formulaire plutôt que de fermer la modale silencieusement.
      setEnrollError(err.message || "Échec de l'inscription.");
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const statusLabel = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "active") return { text: "Actif", className: "bg-green-100 text-green-800" };
    if (s === "graduated") return { text: "Diplômé", className: "bg-blue-100 text-blue-800" };
    return { text: "Inactif", className: "bg-red-100 text-red-800" };
  };

  const enrollmentStatusLabel = (status) => {
    const map = {
      Enrolled: { text: "Inscrit", className: "bg-green-100 text-green-800" },
      Dropped: { text: "Abandonné", className: "bg-red-100 text-red-800" },
      Completed: { text: "Terminé", className: "bg-gray-100 text-gray-800" },
      Pending: { text: "En attente", className: "bg-amber-100 text-amber-800" },
    };
    return map[status] || { text: status, className: "bg-gray-100 text-gray-800" };
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse bg-gray-200 rounded-lg h-64"></div>
      </div>
    );
  }

  const enrolledCount = Object.keys(activeEnrollments).length;

  return (
    <div className="students-container p-6">
      <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Gestion des Étudiants
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérez les profils, inscriptions et effectifs des étudiants
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 mb-6 flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200">
        <Info size={18} className="mt-0.5 flex-shrink-0" />
        <span>Les nouveaux étudiants sont créés depuis "Gestion des utilisateurs" (rôle Étudiant) : le profil ci-dessous est généré automatiquement à l'inscription du compte. Utilisez le bouton <UserPlus size={14} className="inline mb-0.5" /> pour inscrire un étudiant existant à un niveau/spécialisation.</span>
      </div>

      <div className="actions-bar flex justify-between items-center mb-6">
        <div className="search-bar flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 px-4 py-2 w-1/3">
          <Search size={20} className="text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Rechercher un étudiant..."
            className="w-full outline-none bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total Étudiants</h3>
          <p className="text-3xl font-bold text-blue-600">{students.length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Inscrits (année en cours)</h3>
          <p className="text-3xl font-bold text-green-600">{enrolledCount}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Non inscrits</h3>
          <p className="text-3xl font-bold text-amber-600">{students.length - enrolledCount}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Actifs</h3>
          <p className="text-3xl font-bold text-orange-600">
            {students.filter((s) => (s.status || "").toLowerCase() === "active").length}
          </p>
        </div>
      </div>

      <div className="students-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Étudiant</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">N° étudiant</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Niveau</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Spécialisation</th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Statut</th>
              {canTableActions && <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => {
              const st = statusLabel(student.status);
              const enrollment = activeEnrollments[student.id];
              return (
                <tr key={student.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="p-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {student.first_name} {student.last_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{student.email}</div>
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{student.student_number}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{enrollment?.level_name || "—"}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{enrollment?.specialization_name || "—"}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${st.className}`}>{st.text}</span>
                  </td>
                  {canTableActions && (
                    <td className="p-4">
                      <div className="flex space-x-2">
                        <button onClick={() => handleView(student)} className="text-blue-600 hover:text-blue-800 p-1 rounded" title="Voir détails"><Eye size={18} /></button>
                        {canManageStudents && (
                          <>
                            <button onClick={() => handleEdit(student)} className="text-green-600 hover:text-green-800 p-1 rounded" title="Modifier"><Edit size={18} /></button>
                            <button onClick={() => handleEnroll(student)} className="text-purple-600 hover:text-purple-800 p-1 rounded" title="Inscrire / changer de niveau"><UserPlus size={18} /></button>
                          </>
                        )}
                        <button onClick={() => handleHistory(student)} className="text-gray-600 hover:text-gray-800 p-1 rounded" title="Historique des inscriptions"><History size={18} /></button>
                        {canManageStudents && <button onClick={() => goTo('school-operations', { action: 'dossier', studentId: student.id })} className="text-indigo-600 hover:text-indigo-800 p-1 rounded" title="Ouvrir le dossier complet"><FolderOpen size={18} /></button>}
                        {user?.role === "admin" && <button onClick={() => handleDelete(student)} className="text-red-600 hover:text-red-800 p-1 rounded" title="Supprimer le compte"><Trash2 size={18} /></button>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredStudents.length === 0 && (
          <div className="p-8 text-center text-gray-500">Aucun étudiant trouvé</div>
        )}
      </div>

      {showModal && (
        <div className="app-modal-layer bg-black/60 backdrop-blur-sm">
          <div className={`app-modal-dialog bg-white dark:bg-gray-800 rounded-2xl w-full ${modalType === 'edit' ? 'max-w-6xl' : 'max-w-3xl'} shadow-2xl border dark:border-gray-700`}>
            <div className="app-modal-body p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">
                {modalType === "edit" && "Modifier le profil de l'étudiant"}
                {modalType === "view" && "Détails de l'étudiant"}
                {modalType === "enroll" && `Inscrire ${selectedStudent?.first_name} ${selectedStudent?.last_name}`}
                {modalType === "history" && `Historique — ${selectedStudent?.first_name} ${selectedStudent?.last_name}`}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Fermer">
                <X size={22} />
              </button>
            </div>

            {modalType === "view" && selectedStudent && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nom complet" value={`${selectedStudent.first_name} ${selectedStudent.last_name}`} />
                  <Field label="N° étudiant" value={selectedStudent.student_number} />
                  <Field label="Email" value={selectedStudent.email} />
                  <Field label="Téléphone" value={selectedStudent.phone || "—"} />
                  <Field label="Date de naissance" value={selectedStudent.birth_date ? new Date(selectedStudent.birth_date).toLocaleDateString() : "—"} />
                  <Field label="Lieu de naissance" value={selectedStudent.birth_place || "—"} />
                  <Field label="Sexe" value={selectedStudent.gender || "—"} />
                  <Field label="Nationalité" value={selectedStudent.nationality || "—"} />
                  <Field label="Statut" value={statusLabel(selectedStudent.status).text} />
                  <Field label="Niveau actuel" value={activeEnrollments[selectedStudent.id]?.level_name || "Non inscrit"} />
                  <Field label="Spécialisation actuelle" value={activeEnrollments[selectedStudent.id]?.specialization_name || "—"} />
                </div>
                <Field label="Adresse" value={selectedStudent.address || "—"} />
                <Field label="Ville / code postal" value={[selectedStudent.city, selectedStudent.postal_code].filter(Boolean).join(' ') || "—"} />
                <Field label="Contact d’urgence" value={[selectedStudent.emergency_contact_name, selectedStudent.emergency_contact_phone].filter(Boolean).join(' · ') || "—"} />
                <div className="flex justify-end mt-6 pt-4">
                  {canManageStudents && <button onClick={() => { setShowModal(false); goTo('school-operations', { action: 'dossier', studentId: selectedStudent.id }); }} className="mr-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 inline-flex items-center gap-2"><FolderOpen size={16} /> Dossier complet</button>}
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500">Fermer</button>
                </div>
              </div>
            )}

            {modalType === "edit" && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-4"><h3 className="font-bold text-lg">Informations du profil</h3><p className="text-sm text-gray-600 dark:text-gray-300">Les champs sont regroupés pour éviter un long formulaire étroit. La photo peut venir du poste local ou d’une adresse web.</p></div>
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 rounded-2xl border dark:border-gray-700 p-5">
                  <div className="md:col-span-2 xl:col-span-3"><h3 className="text-lg font-bold border-b dark:border-gray-700 pb-2">Identité et état civil</h3></div>
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
                  <EditField label="Lieu de naissance" name="birth_place" value={formData.birth_place} onChange={handleInputChange} />
                  <EditSelect label="Sexe" name="gender" value={formData.gender} onChange={handleInputChange} options={genderOptions} />
                  <EditField label="Nationalité" name="nationality" value={formData.nationality} onChange={handleInputChange} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="active">Actif</option>
                      <option value="inactive">Inactif</option>
                      <option value="graduated">Diplômé</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 xl:col-span-3"><h3 className="text-lg font-bold border-b dark:border-gray-700 pb-2 mt-2">Coordonnées</h3></div>
                  <div className="md:col-span-2 xl:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse</label>
                    <textarea name="address" value={formData.address} onChange={handleInputChange} rows="2" className="w-full border dark:border-gray-700 rounded-lg px-3 py-2" />
                  </div>
                  <EditField label="Ville" name="city" value={formData.city} onChange={handleInputChange} />
                  <EditField label="Code postal" name="postal_code" value={formData.postal_code} onChange={handleInputChange} />
                  <EditField label="Contact d’urgence" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleInputChange} />
                  <EditField label="Téléphone d’urgence" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleInputChange} />
                  <div className="md:col-span-2 xl:col-span-3"><PhotoPicker value={formData.photo_url} onChange={(value) => setFormData((current) => ({ ...current, photo_url: value }))} label="Photo de l’étudiant" /></div>
                </div>
                <div className="flex justify-end space-x-3 pt-4 mt-4 border-t dark:border-gray-700">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900">Annuler</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Save size={16} /> Sauvegarder
                  </button>
                </div>
              </form>
            )}

            {modalType === "enroll" && (
              <form onSubmit={handleEnrollSubmit} className="space-y-4">
                {activeEnrollments[selectedStudent?.id] && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg px-3 py-2">
                    Actuellement inscrit(e) en <strong>{activeEnrollments[selectedStudent.id].level_name}</strong> — {activeEnrollments[selectedStudent.id].specialization_name}.
                    Valider ce formulaire clôturera cette inscription et en créera une nouvelle.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Niveau *</label>
                    <select name="level_id" value={enrollForm.level_id} onChange={handleEnrollInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner...</option>
                      {levels.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Spécialisation *</label>
                    <select name="specialization_id" value={enrollForm.specialization_id} onChange={handleEnrollInputChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sélectionner...</option>
                      {specializations.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Année académique *</label>
                    <select
                      name="academic_year_id"
                      value={enrollForm.academic_year_id}
                      onChange={(event) => {
                        const selected = schoolYears.find((year) => String(year.id) === event.target.value);
                        setEnrollForm((prev) => ({ ...prev, academic_year_id: event.target.value, academic_year: selected?.name || prev.academic_year, group_id: '' }));
                      }}
                      required
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    >
                      <option value="">Sélectionner...</option>
                      {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.name}{Number(year.is_active) === 1 ? ' — active' : ''}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Classe / groupe</label>
                    <select name="group_id" value={enrollForm.group_id} onChange={handleEnrollInputChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                      <option value="">Sans groupe pour le moment</option>
                      {groups.filter((group) => String(group.academic_year_id) === String(enrollForm.academic_year_id) && String(group.level_id) === String(enrollForm.level_id) && (!group.specialization_id || String(group.specialization_id) === String(enrollForm.specialization_id))).map((group) => (
                        <option key={group.id} value={group.id}>{group.level_name} — {group.name} ({group.enrolled_count}/{group.capacity})</option>
                      ))}
                    </select>
                  </div>
                </div>
                {enrollError && (
                  <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{enrollError}</p>
                )}
                <div className="flex justify-end space-x-3 pt-4 mt-4 border-t dark:border-gray-700">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900">Annuler</button>
                  <button type="submit" disabled={enrollSubmitting} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50">
                    <UserPlus size={16} /> {enrollSubmitting ? "Inscription..." : "Inscrire"}
                  </button>
                </div>
              </form>
            )}

            {modalType === "history" && (
              <div className="space-y-3">
                {historyLoading ? (
                  <p className="text-sm text-gray-400">Chargement...</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Aucune inscription enregistrée.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                        <th className="py-2">Année</th>
                        <th className="py-2">Niveau</th>
                        <th className="py-2">Spécialisation</th>
                        <th className="py-2">Date</th>
                        <th className="py-2">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => {
                        const st = enrollmentStatusLabel(h.status);
                        return (
                          <tr key={h.id} className="border-b dark:border-gray-700 last:border-0">
                            <td className="py-2">{h.academic_year}</td>
                            <td className="py-2">{h.level_name}</td>
                            <td className="py-2">{h.specialization_name}</td>
                            <td className="py-2">{h.enrollment_date ? new Date(h.enrollment_date).toLocaleDateString() : "—"}</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.className}`}>{st.text}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="flex justify-end pt-4 mt-2 border-t dark:border-gray-700">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500">Fermer</button>
                </div>
              </div>
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

const EditField = ({ label, name, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 bg-transparent" />
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

export default Students;
