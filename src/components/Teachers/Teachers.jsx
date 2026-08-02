import { useState, useEffect } from "react";
import { Plus, Search, Edit, Trash2, Eye, Award, Save } from "lucide-react";
import { useUi } from "../../context/UiContext";
import { useNotifications } from "../../hooks/useNotifications";
import { generateTeacherNumber } from "../../utils/helpers";

const Teachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("add");
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const { success } = useNotifications();
  const { intent, clearIntent } = useUi();
  const [formData, setFormData] = useState({
    teacher_number: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    birth_date: "",
    address: "",
    department: "Informatique",
    title: "Enseignant",
    specialization: "",
    hire_date: "",
    status: "Active",
  });

  useEffect(() => {
    if (intent?.action === "add") {
      handleAdd();
      clearIntent();
    }
  }, [intent, clearIntent]);

  useEffect(() => {
    const mockTeachers = [
      {
        id: 1,
        teacher_number: "TEA20240001",
        first_name: "Pierre",
        last_name: "Durand",
        email: "pierre.durand@school.com",
        phone: "0123456789",
        birth_date: "1980-03-15",
        address: "123 Avenue de l'Université, Paris",
        department: "Informatique",
        title: "Professeur",
        specialization: "Intelligence Artificielle",
        hire_date: "2018-09-01",
        status: "Active",
      },
      {
        id: 2,
        teacher_number: "TEA20240002",
        first_name: "Marie",
        last_name: "Leblanc",
        email: "marie.leblanc@school.com",
        phone: "0987654321",
        birth_date: "1975-08-22",
        address: "456 Rue des Sciences, Lyon",
        department: "Mathématiques",
        title: "Maître de Conférences",
        specialization: "Analyse Numérique",
        hire_date: "2015-02-15",
        status: "Active",
      },
      {
        id: 3,
        teacher_number: "TEA20240003",
        first_name: "Jean",
        last_name: "Moreau",
        email: "jean.moreau@school.com",
        phone: "0567891234",
        birth_date: "1970-12-10",
        address: "789 Boulevard de la Recherche, Marseille",
        department: "Physique",
        title: "Professeur Émérite",
        specialization: "Physique Quantique",
        hire_date: "2010-09-01",
        status: "Active",
      },
    ];
    setTeachers(mockTeachers);
  }, []);

  const filteredTeachers = teachers.filter(
    (teacher) =>
      `${teacher.first_name} ${teacher.last_name}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.specialization.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const resetFormData = () => {
    setFormData({
      teacher_number: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      birth_date: "",
      address: "",
      department: "Informatique",
      title: "Enseignant",
      specialization: "",
      hire_date: "",
      status: "Active",
    });
  };

  const handleAdd = () => {
    setModalType("add");
    setSelectedTeacher(null);
    resetFormData();
    setShowModal(true);
  };

  const handleEdit = (teacher) => {
    setModalType("edit");
    setSelectedTeacher(teacher);
    setFormData({
      teacher_number: teacher.teacher_number,
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      email: teacher.email,
      phone: teacher.phone,
      birth_date: teacher.birth_date,
      address: teacher.address,
      department: teacher.department,
      title: teacher.title,
      specialization: teacher.specialization,
      hire_date: teacher.hire_date,
      status: teacher.status,
    });
    setShowModal(true);
  };

  const handleView = (teacher) => {
    setModalType("view");
    setSelectedTeacher(teacher);
    setShowModal(true);
  };

  const handleDelete = (teacherId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet enseignant ?")) {
      setTeachers(teachers.filter((t) => t.id !== teacherId));
      success("Enseignant supprimé avec succès.");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (modalType === "add") {
      const newTeacher = {
        id: Math.max(...teachers.map((t) => t.id), 0) + 1,
        ...formData,
        teacher_number: generateTeacherNumber(),
      };
      setTeachers([...teachers, newTeacher]);
      success("Enseignant ajouté avec succès.");
    } else if (modalType === "edit") {
      setTeachers(
        teachers.map((t) =>
          t.id === selectedTeacher.id ? { ...t, ...formData } : t,
        ),
      );
      success("Profil enseignant mis à jour.");
    }
    setShowModal(false);
  };

  const getExperienceYears = (hireDate) => {
    if (!hireDate) return 0;
    const years = new Date().getFullYear() - new Date(hireDate).getFullYear();
    return years;
  };

  const getTitleColor = (title) => {
    switch (title) {
      case "Professeur Émérite":
        return "bg-purple-100 text-purple-800";
      case "Professeur":
        return "bg-blue-100 text-blue-800";
      case "Maître de Conférences":
        return "bg-green-100 text-green-800";
      case "Assistant":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800 dark:text-gray-100";
    }
  };

  return (
    <div className="teachers-container p-6">
      <div className="header mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Gestion des Enseignants
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérez les profils des enseignants et formateurs
        </p>
      </div>

      <div className="actions-bar flex justify-between items-center mb-6">
        <div className="search-bar flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 px-4 py-2 w-1/3">
          <Search size={20} className="text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Rechercher un enseignant..."
            className="w-full outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} /> Nouvel enseignant
        </button>
      </div>

      <div className="stats grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
            Total Enseignants
          </h3>
          <p className="text-3xl font-bold text-blue-600">{teachers.length}</p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
            Professeurs
          </h3>
          <p className="text-3xl font-bold text-purple-600">
            {teachers.filter((t) => t.title.includes("Professeur")).length}
          </p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
            Départements
          </h3>
          <p className="text-3xl font-bold text-green-600">
            {new Set(teachers.map((t) => t.department)).size}
          </p>
        </div>
        <div className="stat-card bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
          <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
            Actifs
          </h3>
          <p className="text-3xl font-bold text-orange-600">
            {teachers.filter((t) => t.status === "Active").length}
          </p>
        </div>
      </div>

      <div className="teachers-table bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">
                Enseignant
              </th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">
                Département
              </th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">
                Grade
              </th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">
                Spécialisation
              </th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">
                Expérience
              </th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">
                Statut
              </th>
              <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.map((teacher) => (
              <tr
                key={teacher.id}
                className="border dark:border-gray-700-t hover:bg-gray-50 dark:bg-gray-900"
              >
                <td className="p-4">
                  <div>
                    <div className="font-medium text-gray-900">
                      {teacher.first_name} {teacher.last_name}
                    </div>
                    {/* <div className="text-sm text-gray-500">{teacher.email}</div>
                    <div className="text-sm text-gray-400">{teacher.teacher_number}</div> */}
                  </div>
                </td>
                <td className="p-4 text-gray-600 dark:text-gray-400">
                  {teacher.department}
                </td>
                <td className="p-4">
                  <span
                    className={`px-4 py-1 rounded-full text-2xl font-medium ${getTitleColor(teacher.title)}`}
                  >
                    {teacher.title}
                  </span>
                </td>
                <td className="p-4 text-gray-600 dark:text-gray-400">
                  {teacher.specialization}
                </td>
                <td className="p-4">
                  <div className="flex items-center">
                    <Award size={19} className="text-yellow-500 mr-1" />
                    <span className="text-gray-600 dark:text-gray-400">
                      {getExperienceYears(teacher.hire_date)} ans
                    </span>
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={`px-4 py-1 rounded-full text-2xl font-medium ${teacher.status === "Active" ? "bg-green-100 text-green-800" : teacher.status === "Retired" ? "bg-gray-100 text-gray-800 dark:text-gray-100" : "bg-red-100 text-red-800"}`}
                  >
                    {teacher.status === "Active"
                      ? "Actif"
                      : teacher.status === "Retired"
                        ? "Retiré"
                        : "Inactif"}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleView(teacher)}
                      className="text-blue-600 hover:text-blue-800 p-1 rounded"
                      title="Voir détails"
                    >
                      <Eye size={19} />
                    </button>
                    <button
                      onClick={() => handleEdit(teacher)}
                      className="text-green-600 hover:text-green-800 p-1 rounded"
                      title="Modifier"
                    >
                      <Edit size={19} />
                    </button>
                    <button
                      onClick={() => handleDelete(teacher.id)}
                      className="text-red-600 hover:text-red-800 p-1 rounded"
                      title="Supprimer"
                    >
                      <Trash2 size={19} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTeachers.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Aucun enseignant trouvé
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">
              {modalType === "add" && "Nouvel enseignant"}
              {modalType === "edit" && "Modifier le profil de l'enseignant"}
              {modalType === "view" && "Détails de l'enseignant"}
            </h2>

            {modalType === "view" && selectedTeacher && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Nom complet
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {selectedTeacher.first_name} {selectedTeacher.last_name}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Numéro enseignant
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {selectedTeacher.teacher_number}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Email
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {selectedTeacher.email}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Téléphone
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {selectedTeacher.phone}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Département
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {selectedTeacher.department}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Grade
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {selectedTeacher.title}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Spécialisation
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {selectedTeacher.specialization}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Date d'embauche
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {new Date(selectedTeacher.hire_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                      Expérience
                    </label>
                    <p className="text-gray-900 text-2xl">
                      {getExperienceYears(selectedTeacher.hire_date)} ans
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300">
                    Adresse
                  </label>
                  <p className="text-gray-900 text-2xl">
                    {selectedTeacher.address}
                  </p>
                </div>
                <div className="flex justify-end mt-6 pt-4 ">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-blue-600 text-gray-800 dark:text-blue-100 rounded-lg hover:bg-blue-500"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}

            {(modalType === "add" || modalType === "edit") && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Prénom *
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      required
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Nom *
                    </label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      required
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Date de naissance
                    </label>
                    <input
                      type="date"
                      name="birth_date"
                      value={formData.birth_date}
                      onChange={handleInputChange}
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Date d'embauche
                    </label>
                    <input
                      type="date"
                      name="hire_date"
                      value={formData.hire_date}
                      onChange={handleInputChange}
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Département
                    </label>
                    <input
                      type="text"
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Grade / Titre
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Spécialisation
                    </label>
                    <input
                      type="text"
                      name="specialization"
                      value={formData.specialization}
                      onChange={handleInputChange}
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Adresse
                    </label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      rows="2"
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Statut
                    </label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full border dark:border-gray-700 rounded-lg px-3 py-2"
                    >
                      <option value="Active">Actif</option>
                      <option value="Inactive">Inactif</option>
                      <option value="Retired">Retraité</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border dark:border-gray-700 border dark:border-gray-700-gray-300 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Save size={16} />
                    {modalType === "add" ? "Créer" : "Sauvegarder"}
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

export default Teachers;
