// src/components/Planning/Planning.jsx
import { useCallback, useState, useEffect } from "react";
import {
  Calendar as CalIcon,
  Clock,
  MapPin,
  User,
  BookOpen,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Save,
  X,
} from "lucide-react";
import { useUi } from "../../context/UiContext";
import { useApp } from "../../context/AppContext";
import { useNotifications } from "../../hooks/useNotifications";
import apiService from "../../services/api";
import { canManageFeature } from "../../utils/permissions";

const normalizeTime = (value) => String(value ?? "").slice(0, 5);
const scheduleBackgroundClasses = {
  'bg-blue-500': 'bg-blue-500',
  'bg-green-500': 'bg-green-500',
  'bg-purple-500': 'bg-purple-500',
  'bg-orange-500': 'bg-orange-500',
  'bg-red-500': 'bg-red-500',
  'bg-indigo-500': 'bg-indigo-500',
};
const scheduleBorderClasses = {
  'bg-blue-500': 'border-blue-500',
  'bg-green-500': 'border-green-500',
  'bg-purple-500': 'border-purple-500',
  'bg-orange-500': 'border-orange-500',
  'bg-red-500': 'border-red-500',
  'bg-indigo-500': 'border-indigo-500',
};

const Planning = () => {
  const [schedules, setSchedules] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState("week"); // 'week', 'day'
  const [selectedFilters, setSelectedFilters] = useState({
    level: "",
    specialization: "",
    teacher: "",
    room: "",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const { intent, clearIntent } = useUi();
  const { user } = useApp();
  const { success, error: notifyError } = useNotifications();
  const canManagePlanning = ['admin', 'directeur'].includes(user?.role) && canManageFeature(user, 'planning');

  // ✅ État pour les données réelles
  const [levels, setLevels] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [courses, setCourses] = useState([]);

  // État pour le formulaire
  const [newScheduleData, setNewScheduleData] = useState({
    courseId: "",
    teacherId: "",
    roomId: "",
    level: "",
    specialization: "",
    dayOfWeek: "1",
    startTime: "08:00",
    endTime: "10:00",
    type: "Cours",
  });

  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
  ];
  const daysOfWeek = [
    "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"
  ];

  // Chargement du planning. Les rôles en consultation ne doivent pas dépendre
  // d'API annexes qui peuvent être volontairement désactivées pour leur compte.
  // Les libellés nécessaires aux filtres sont déjà renvoyés par planning.php.
  const loadData = useCallback(async () => {
    try {
      const schedulesRes = await apiService.getSchedules();
      const rows = schedulesRes.data || [];
      setSchedules(rows);

      if (canManagePlanning) {
        const [levelsRes, specsRes, teachersRes, roomsRes, coursesRes] = await Promise.all([
          apiService.getLevels(),
          apiService.getSpecializations(),
          apiService.getTeachers(),
          apiService.getRooms(),
          apiService.getCourses(),
        ]);
        setLevels(levelsRes.data || []);
        setSpecializations(specsRes.data || []);
        setTeachers(teachersRes.data || []);
        setRooms(roomsRes.data || []);
        setCourses(coursesRes.data || []);
        return;
      }

      const uniqueRefs = (idKey, labelKey, mapper = (id, label) => ({ id, name: label })) => {
        const refs = new Map();
        rows.forEach((row) => {
          const id = Number(row[idKey]);
          const label = String(row[labelKey] || '').trim();
          if (id > 0 && label && !refs.has(id)) refs.set(id, mapper(id, label));
        });
        return [...refs.values()];
      };

      setLevels(uniqueRefs('level_id', 'level_name'));
      setSpecializations(uniqueRefs('specialization_id', 'specialization_name'));
      setTeachers(uniqueRefs('teacher_id', 'teacher_name', (id, label) => ({ id, name: label })));
      setRooms(uniqueRefs('room_id', 'room_name'));
      setCourses([]);
    } catch (err) {
      notifyError("Impossible de charger les données nécessaires à la planification.");
      console.error(err);
    }
  }, [canManagePlanning, notifyError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Gestion de l'intent (bouton "+" depuis la sidebar)
  useEffect(() => {
    if (intent?.action === "add") {
      if (canManagePlanning) {
        setShowAddModal(true);
      } else {
        notifyError("Vous n'avez pas l'autorisation de modifier le planning.");
      }
      clearIntent();
    }
  }, [intent, clearIntent, canManagePlanning, notifyError]);

  const handleEventClick = (schedule) => {
    setSelectedSchedule(schedule);
    setShowDetailModal(true);
  };

  const getWeekDates = (date) => {
    const week = [];
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    for (let i = 0; i < 6; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      week.push(d);
    }
    return week;
  };

  // Filtrage local (si besoin, on peut filtrer côté front)
  const filteredSchedules = schedules.filter(
    (schedule) =>
      (!selectedFilters.level || String(schedule.level_id) === selectedFilters.level) &&
      (!selectedFilters.specialization ||
        String(schedule.specialization_id) === selectedFilters.specialization) &&
      (!selectedFilters.teacher ||
        String(schedule.teacher_id) === selectedFilters.teacher) &&
      (!selectedFilters.room ||
        String(schedule.room_id) === selectedFilters.room)
  );

  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);
    const increment = direction === "next" ? 1 : -1;
    if (viewType === "week") {
      newDate.setDate(currentDate.getDate() + increment * 7);
    } else {
      newDate.setDate(currentDate.getDate() + increment);
    }
    setCurrentDate(newDate);
  };

  const formatDate = (date, options = { day: "2-digit", month: "2-digit" }) =>
    date.toLocaleDateString("fr-FR", options);

  const getCurrentWeekRange = () => {
    const weekDates = getWeekDates(currentDate);
    const start = weekDates[0];
    const end = weekDates[5];
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const handleFilterChange = (filterType, value) => {
    setSelectedFilters((prev) => ({ ...prev, [filterType]: value }));
  };

  const clearFilters = () => {
    setSelectedFilters({
      level: "",
      specialization: "",
      teacher: "",
      room: "",
    });
  };

  const handleNewScheduleChange = (e) => {
    const { name, value } = e.target;
    setNewScheduleData((prev) => ({ ...prev, [name]: value }));
  };

  // ✅ Création réelle d'un créneau
  const handleCreateSchedule = async (e) => {
    e.preventDefault();

    // Récupérer les objets sélectionnés
    const selectedCourse = courses.find(c => c.id === Number(newScheduleData.courseId));
    const selectedTeacher = teachers.find(t => t.id === Number(newScheduleData.teacherId));
    const selectedRoom = rooms.find(r => r.id === Number(newScheduleData.roomId));
    const selectedLevel = levels.find(l => l.id === Number(newScheduleData.level));
    const selectedSpecialization = specializations.find(s => s.id === Number(newScheduleData.specialization));

    if (!selectedCourse || !selectedTeacher || !selectedRoom || !selectedLevel || !selectedSpecialization) {
      notifyError("Veuillez remplir tous les champs.");
      return;
    }

    const payload = {
      course_id: selectedCourse.id,
      teacher_id: selectedTeacher.id,
      room_id: selectedRoom.id,
      level_id: selectedLevel.id,
      specialization_id: selectedSpecialization.id,
      day_of_week: parseInt(newScheduleData.dayOfWeek, 10),
      start_time: newScheduleData.startTime,
      end_time: newScheduleData.endTime,
      type: newScheduleData.type,
      color: "bg-indigo-500", // couleur par défaut, pourrait être paramétrable
    };

    try {
      const res = await apiService.createSchedule(payload);
      if (res.success) {
        success("Planification créée avec succès.");
        // Recharger les données
        await loadData();
        setShowAddModal(false);
        // Réinitialiser le formulaire
        setNewScheduleData({
          courseId: "",
          teacherId: "",
          roomId: "",
          level: "",
          specialization: "",
          dayOfWeek: "1",
          startTime: "08:00",
          endTime: "10:00",
          type: "Cours",
        });
      } else {
        notifyError(res.message || "Erreur lors de la création.");
      }
    } catch (err) {
      notifyError(err.message || "Erreur serveur.");
      console.error(err);
    }
  };

  const renderWeekView = () => (
    <div className="planning-grid bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900">
            <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-24 text-2xl">
              Heure
            </th>
            {daysOfWeek.map((day, index) => (
              <th
                key={day}
                className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300 text-xl"
              >
                <div>{day}</div>
                <div className="text-lg font-medium text-gray-500">
                  {formatDate(getWeekDates(currentDate)[index])}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((timeSlot) => (
            <tr key={timeSlot} className="border-t dark:border-gray-700">
              <td className="p-3 bg-gray-50 dark:bg-gray-900 font-medium text-gray-600 dark:text-gray-400 text-xl">
                {timeSlot}
              </td>
              {daysOfWeek.map((_, dayIndex) => {
                const schedule = filteredSchedules.find(
                  (s) =>
                    Number(s.day_of_week) === dayIndex + 1 && normalizeTime(s.start_time) === timeSlot
                );
                return (
                  <td
                    key={dayIndex}
                    className="px-2 py-2 border-l dark:border-gray-700 h-28 relative align-top"
                  >
                    {schedule && (
                      <div
                        onClick={() => handleEventClick(schedule)}
                        className={`${scheduleBackgroundClasses[schedule.color] || 'bg-indigo-500'} text-white text-xl p-2 rounded m-1 cursor-pointer hover:opacity-90`}
                      >
                        <div className="font-semibold truncate">
                          {schedule.course_name}
                        </div>
                        <div className="opacity-90">
                          {schedule.level_name} - {schedule.specialization_name}
                        </div>
                        <div className="flex items-center mt-1 opacity-90">
                          <User size={16} className="mr-1" />
                          {schedule.teacher_name}
                        </div>
                        <div className="flex items-center opacity-90">
                          <MapPin size={16} className="mr-1" />
                          {schedule.room_name}
                        </div>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderDayView = () => {
    const dayIndex = currentDate.getDay(); // 0 for Sun, 1 for Mon...
    const schedulesForDay = filteredSchedules
      .filter((s) => Number(s.day_of_week) === (dayIndex === 0 ? 7 : dayIndex))
      .sort((a, b) => normalizeTime(a.start_time).localeCompare(normalizeTime(b.start_time)));
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
        <h2 className="text-2xl font-bold text-center mb-4">
          {formatDate(currentDate, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h2>
        <div className="space-y-3">
          {schedulesForDay.length > 0 ? (
            schedulesForDay.map((s) => (
              <div
                key={s.id}
                onClick={() => handleEventClick(s)}
                className={`p-4 rounded-lg text-white ${scheduleBackgroundClasses[s.color] || 'bg-indigo-500'} cursor-pointer`}
              >
                <div className="font-bold text-xl">{s.course_name}</div>
                <div className="text-xl">
                  {s.level_name} - {s.specialization_name}
                </div>
                <div className="flex items-center mt-2 text-xl">
                  <Clock size={16} className="mr-2" />
                  {normalizeTime(s.start_time)} - {normalizeTime(s.end_time)}
                </div>
                <div className="flex items-center text-xl">
                  <User size={16} className="mr-2" />
                  {s.teacher_name}
                </div>
                <div className="flex items-center text-xl">
                  <MapPin size={16} className="mr-2" />
                  {s.room_name}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500 text-lg">
              Aucun cours planifié pour ce jour.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="planning-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Planification des Cours
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Gérez l'emploi du temps et la planification des cours
        </p>
      </div>

      <div className="toolbar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateDate("prev")}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="text-2xl font-semibold">
              {viewType === "week"
                ? `Semaine du ${getCurrentWeekRange()}`
                : formatDate(currentDate, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
            </div>
            <button
              onClick={() => navigateDate("next")}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="flex items-center space-x-2">
            {canManagePlanning && (
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 text-xl font-semibold"
              >
                <Plus className="font-semibold" size={22} />
                Nouvelle planification
              </button>
            )}
            <button
              onClick={() => setViewType(viewType === "week" ? "day" : "week")}
              className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 px-4 py-2 rounded-lg flex items-center gap-2 text-2xl font-semibold"
            >
              <CalIcon size={25} />
              {viewType === "week" ? "Vue Jour" : "Vue Semaine"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4">
          <Filter size={20} className="text-gray-500" />
          <select
            value={selectedFilters.level}
            onChange={(e) => handleFilterChange("level", e.target.value)}
            className="border dark:border-gray-700 rounded-lg px-3 py-1 text-xl font-semibold"
          >
            <option value="">Tous les niveaux</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>{level.name}</option>
            ))}
          </select>
          <select
            value={selectedFilters.specialization}
            onChange={(e) => handleFilterChange("specialization", e.target.value)}
            className="border dark:border-gray-700 rounded-lg px-3 py-1 text-xl font-semibold"
          >
            <option value="">Toutes les spécialisations</option>
            {specializations.map((spec) => (
              <option key={spec.id} value={spec.id}>{spec.name}</option>
            ))}
          </select>
          <select
            value={selectedFilters.teacher}
            onChange={(e) => handleFilterChange("teacher", e.target.value)}
            className="border dark:border-gray-700 rounded-lg px-3 py-1 text-xl font-semibold"
          >
            <option value="">Tous les enseignants</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || `${t.first_name || ''} ${t.last_name || ''}`.trim()}
              </option>
            ))}
          </select>
          <select
            value={selectedFilters.room}
            onChange={(e) => handleFilterChange("room", e.target.value)}
            className="border dark:border-gray-700 rounded-lg px-3 py-1 text-xl font-semibold"
          >
            <option value="">Toutes les salles</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={clearFilters}
            className="text-blue-600 hover:text-blue-800 text-xl font-semibold"
          >
            Effacer les filtres
          </button>
        </div>
      </div>

      {viewType === "week" ? renderWeekView() : renderDayView()}

      {/* Modal Détails */}
      {showDetailModal && selectedSchedule && (
        <div
          className="modal-overlay app-modal-layer bg-black bg-opacity-50"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="modal-content bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`border-l-8 px-4 py-4 rounded-lg ${scheduleBorderClasses[selectedSchedule.color] || 'border-indigo-500'} pl-4`}
            >
              <h2 className="text-2xl font-bold mb-1">
                {selectedSchedule.course_name}
              </h2>
              <p className="text-xl font-medium text-gray-600 dark:text-gray-400">
                {selectedSchedule.type}
              </p>
            </div>
            <div className="space-y-3 mt-6 text-xl font-medium text-gray-700 dark:text-gray-300">
              <p className="flex items-center">
                <BookOpen size={20} className="mr-3 text-gray-500" />
                {selectedSchedule.level_name} - {selectedSchedule.specialization_name}
              </p>
              <p className="flex items-center">
                <Clock size={20} className="mr-3 text-gray-500" />
                {normalizeTime(selectedSchedule.start_time)} jusqu'à {normalizeTime(selectedSchedule.end_time)}
              </p>
              <p className="flex items-center">
                <User size={20} className="mr-3 text-gray-500" />
                {selectedSchedule.teacher_name}
              </p>
              <p className="flex items-center">
                <MapPin size={20} className="mr-3 text-gray-500" />
                {selectedSchedule.room_name}
              </p>
            </div>
            <div className="flex justify-end pt-6 mt-6">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-5 py-2 bg-blue-600 text-gray-800 dark:text-blue-100 rounded-lg hover:bg-blue-500 text-xl font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajout (ADD MODAL) */}
      {showAddModal && (
        <div className="app-modal-layer bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 w-full max-w-7xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                Nouvelle Planification
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-200 rounded-full"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Cours
                  </label>
                  <select
                    name="courseId"
                    value={newScheduleData.courseId}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    <option value="">Sélectionner un cours</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Enseignant
                  </label>
                  <select
                    name="teacherId"
                    value={newScheduleData.teacherId}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    <option value="">Sélectionner un enseignant</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || `${t.first_name || ''} ${t.last_name || ''}`.trim()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Salle
                  </label>
                  <select
                    name="roomId"
                    value={newScheduleData.roomId}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    <option value="">Sélectionner une salle</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Jour de la semaine
                  </label>
                  <select
                    name="dayOfWeek"
                    value={newScheduleData.dayOfWeek}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    {daysOfWeek.map((day, index) => (
                      <option key={index} value={index + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Heure de début
                  </label>
                  <select
                    name="startTime"
                    value={newScheduleData.startTime}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    {timeSlots.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Heure de fin
                  </label>
                  <select
                    name="endTime"
                    value={newScheduleData.endTime}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    {timeSlots.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Niveau
                  </label>
                  <select
                    name="level"
                    value={newScheduleData.level}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    <option value="">Sélectionner un niveau</option>
                    {levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xl font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Spécialisation
                  </label>
                  <select
                    name="specialization"
                    value={newScheduleData.specialization}
                    onChange={handleNewScheduleChange}
                    required
                    className="w-full border dark:border-gray-700 rounded-lg px-3 py-2 text-xl font-medium"
                  >
                    <option value="">Sélectionner une spécialisation</option>
                    {specializations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg
               text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900
               hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Save size={18} /> Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Planning;
