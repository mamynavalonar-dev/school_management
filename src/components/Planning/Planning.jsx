// src/components/Planning/Planning.jsx
import { useState, useEffect } from 'react';
import { Calendar as CalIcon, Clock, MapPin, User, BookOpen, Plus, Filter, ChevronLeft, ChevronRight, AlertTriangle, Save, X } from 'lucide-react';
import { useUi } from '../../context/UiContext';

const Planning = () => {
  const [schedules, setSchedules] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState('week'); // 'week', 'day'
  const [selectedFilters, setSelectedFilters] = useState({ level: '', specialization: '', teacher: '', room: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const { intent, clearIntent } = useUi();

  // State for the new schedule form
  const [newScheduleData, setNewScheduleData] = useState({
    courseId: '',
    teacherId: '',
    roomId: '',
    level: '',
    specialization: '',
    dayOfWeek: '1',
    startTime: '08:00',
    endTime: '10:00',
    type: 'Cours',
  });

  useEffect(() => {
    if (intent?.action === 'add') {
      setShowAddModal(true);
      clearIntent();
    }
  }, [intent, clearIntent]);

  // RÃ©fÃ©rentiels (donnÃ©es de simulation)
  const [levels] = useState(['L1', 'L2', 'L3', 'M1', 'M2']);
  const [specializations] = useState(['Informatique', 'MathÃ©matiques', 'Physique', 'Chimie']);
  const [teachers] = useState([{ id: 1, name: 'Pierre Durand' }, { id: 2, name: 'Marie Leblanc' }, { id: 3, name: 'Jean Moreau' }]);
  const [rooms] = useState([{ id: 1, name: 'A101 - AmphithÃ©Ã¢tre' }, { id: 2, name: 'B201 - Salle Info 1' }, { id: 3, name: 'C301 - Lab Chimie' }]);
  const [courses] = useState([{ id: 1, name: 'Programmation Web', code: 'INFO301' }, { id: 2, name: 'Analyse NumÃ©rique', code: 'MATH201' }, { id: 3, name: 'MÃ©canique Quantique', code: 'PHYS401' }]);
  const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  useEffect(() => {
    const mockSchedules = [
        { id: 1, courseId: 1, courseName: 'Programmation Web', courseCode: 'INFO301', teacherId: 1, teacherName: 'Pierre Durand', roomId: 2, roomName: 'B201 - Salle Info 1', level: 'L3', specialization: 'Informatique', dayOfWeek: 1, startTime: '09:00', endTime: '11:00', type: 'Cours', color: 'bg-blue-500' },
        { id: 2, courseId: 2, courseName: 'Analyse NumÃ©rique', courseCode: 'MATH201', teacherId: 2, teacherName: 'Marie Leblanc', roomId: 1, roomName: 'A101 - AmphithÃ©Ã¢tre', level: 'L2', specialization: 'MathÃ©matiques', dayOfWeek: 2, startTime: '14:00', endTime: '16:00', type: 'Cours Magistral', color: 'bg-green-500' },
        { id: 3, courseId: 1, courseName: 'TP Programmation Web', courseCode: 'INFO301-TP', teacherId: 1, teacherName: 'Pierre Durand', roomId: 2, roomName: 'B201 - Salle Info 1', level: 'L3', specialization: 'Informatique', dayOfWeek: 3, startTime: '10:00', endTime: '12:00', type: 'TP', color: 'bg-purple-500' }
    ];
    setSchedules(mockSchedules);
  }, []);

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

  const filteredSchedules = schedules.filter(schedule => (
    (!selectedFilters.level || schedule.level === selectedFilters.level) &&
    (!selectedFilters.specialization || schedule.specialization === selectedFilters.specialization) &&
    (!selectedFilters.teacher || schedule.teacherId.toString() === selectedFilters.teacher) &&
    (!selectedFilters.room || schedule.roomId.toString() === selectedFilters.room)
  ));

  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);
    const increment = direction === 'next' ? 1 : -1;
    if (viewType === 'week') {
      newDate.setDate(currentDate.getDate() + (increment * 7));
    } else {
      newDate.setDate(currentDate.getDate() + increment);
    }
    setCurrentDate(newDate);
  };

  const formatDate = (date, options = { day: '2-digit', month: '2-digit' }) =>
    date.toLocaleDateString('fr-FR', options);

  const getCurrentWeekRange = () => {
    const weekDates = getWeekDates(currentDate);
    const start = weekDates[0];
    const end = weekDates[5];
    return `${formatDate(start)} - ${formatDate(end)}`;
  };
  
  const handleFilterChange = (filterType, value) => {
    setSelectedFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const clearFilters = () => {
    setSelectedFilters({ level: '', specialization: '', teacher: '', room: '' });
  };

  const handleNewScheduleChange = (e) => {
    const { name, value } = e.target;
    setNewScheduleData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateSchedule = (e) => {
    e.preventDefault();
    const course = courses.find(c => c.id.toString() === newScheduleData.courseId);
    const teacher = teachers.find(t => t.id.toString() === newScheduleData.teacherId);
    const room = rooms.find(r => r.id.toString() === newScheduleData.roomId);

    if (!course || !teacher || !room) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    const newSchedule = {
      id: Date.now(),
      courseId: course.id,
      courseName: course.name,
      teacherId: teacher.id,
      teacherName: teacher.name,
      roomId: room.id,
      roomName: room.name,
      level: newScheduleData.level,
      specialization: newScheduleData.specialization,
      dayOfWeek: parseInt(newScheduleData.dayOfWeek, 10),
      startTime: newScheduleData.startTime,
      endTime: newScheduleData.endTime,
      type: newScheduleData.type,
      color: 'bg-indigo-500', // Default color for new events
    };

    setSchedules(prev => [...prev, newSchedule]);
    setShowAddModal(false);
    // Reset form
    setNewScheduleData({
      courseId: '',
      teacherId: '',
      roomId: '',
      level: '',
      specialization: '',
      dayOfWeek: '1',
      startTime: '08:00',
      endTime: '10:00',
      type: 'Cours',
    });
  };
  
  const renderWeekView = () => (
    <div className="planning-grid bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900">
              <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-24 text-lg">Heure</th>
              {daysOfWeek.map((day, index) => (
                <th key={day} className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300 text-lg">
                  <div>{day}</div>
                  <div className="text-base font-normal text-gray-500">
                    {formatDate(getWeekDates(currentDate)[index])}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map(timeSlot => (
              <tr key={timeSlot} className="border dark:border-gray-700-t">
               <td className="p-3 bg-gray-50 dark:bg-gray-900 font-medium text-gray-600 dark:text-gray-400 text-base">{timeSlot}</td>
               {daysOfWeek.map((_, dayIndex) => {
                  const schedule = filteredSchedules.find(s => s.dayOfWeek === dayIndex + 1 && s.startTime === timeSlot);
                  return (
                    <td key={dayIndex} className="p-1 border dark:border-gray-700-l h-28 relative align-top">
                      {schedule && (
                        <div onClick={() => handleEventClick(schedule)} className={`${schedule.color} text-white text-base p-2 rounded m-1 cursor-pointer hover:opacity-90`}>
                          <div className="font-semibold truncate">{schedule.courseName}</div>
                          <div className="opacity-90">{schedule.level} - {schedule.specialization}</div>
                          <div className="flex items-center mt-1 opacity-90"><User size={16} className="mr-1" />{schedule.teacherName}</div>
                          <div className="flex items-center opacity-90"><MapPin size={16} className="mr-1" />{schedule.roomName.split(' - ')[0]}</div>
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
    const schedulesForDay = filteredSchedules.filter(s => s.dayOfWeek === (dayIndex === 0 ? 7 : dayIndex)).sort((a,b) => a.startTime.localeCompare(b.startTime));
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
            <h2 className="text-2xl font-bold text-center mb-4">{formatDate(currentDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <div className="space-y-3">
                {schedulesForDay.length > 0 ? schedulesForDay.map(s => (
                    <div key={s.id} onClick={() => handleEventClick(s)} className={`p-4 rounded-lg text-white ${s.color} cursor-pointer`}>
                        <div className="font-bold text-xl">{s.courseName}</div>
                        <div className="text-base">{s.level} - {s.specialization}</div>
                        <div className="flex items-center mt-2 text-base"><Clock size={16} className="mr-2"/>{s.startTime} - {s.endTime}</div>
                        <div className="flex items-center text-base"><User size={16} className="mr-2"/>{s.teacherName}</div>
                        <div className="flex items-center text-base"><MapPin size={16} className="mr-2"/>{s.roomName}</div>
                    </div>
                )) : (
                    <div className="text-center py-12 text-gray-500 text-lg">Aucun cours planifiÃ© pour ce jour.</div>
                )}
            </div>
        </div>
    );
  };
  
  return (
    <div className="planning-container p-6 animate-fade-in">
      <div className="header mb-6">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">Planification des Cours</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">GÃ©rez l'emploi du temps et la planification des cours</p>
      </div>

       <div className="toolbar bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigateDate('prev')} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={24} /></button>
            <div className="text-xl font-semibold">
              {viewType === 'week' ? `Semaine du ${getCurrentWeekRange()}` : formatDate(currentDate, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <button onClick={() => navigateDate('next')} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={24} /></button>
          </div>
           <div className="flex items-center space-x-2">
            <button onClick={() => setShowAddModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 text-base"><Plus size={22} />Nouvelle planification</button>
            <button 
              onClick={() => setViewType(viewType === 'week' ? 'day' : 'week')} 
              className="bg-white dark:bg-gray-800 dark:bg-gray-700 border dark:border-gray-700 border dark:border-gray-700-gray-300 dark:border dark:border-gray-700-gray-600 text-gray-800 dark:text-gray-100 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 px-4 py-2 rounded-lg flex items-center gap-2 text-base"
            >
              <CalIcon size={22} />{viewType === 'week' ? 'Vue Jour' : 'Vue Semaine'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border dark:border-gray-700-t">
          <Filter size={22} className="text-gray-500" />
          <select value={selectedFilters.level} onChange={(e) => handleFilterChange('level', e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-1 text-base"><option value="">Tous les niveaux</option>{levels.map(level => <option key={level} value={level}>{level}</option>)}</select>
          <select value={selectedFilters.specialization} onChange={(e) => handleFilterChange('specialization', e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-1 text-base"><option value="">Toutes les spÃ©cialisations</option>{specializations.map(spec => <option key={spec} value={spec}>{spec}</option>)}</select>
          <select value={selectedFilters.teacher} onChange={(e) => handleFilterChange('teacher', e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-1 text-base"><option value="">Tous les enseignants</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={selectedFilters.room} onChange={(e) => handleFilterChange('room', e.target.value)} className="border dark:border-gray-700 rounded-lg px-3 py-1 text-base"><option value="">Toutes les salles</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <button onClick={clearFilters} className="text-blue-600 hover:text-blue-800 text-base">Effacer les filtres</button>
        </div>
      </div>

      {viewType === 'week' ? renderWeekView() : renderDayView()}

      {/* Modal DÃ©tails */}
      {showDetailModal && selectedSchedule && (
        <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className={`border dark:border-gray-700-l-8 ${selectedSchedule.color.replace('bg-', 'border dark:border-gray-700-')} pl-4`}>
              <h2 className="text-2xl font-bold mb-1">{selectedSchedule.courseName}</h2>
               <p className="text-lg text-gray-600 dark:text-gray-400">{selectedSchedule.type}</p>
            </div>
            <div className="space-y-3 mt-6 text-lg">
              <p className="flex items-center"><BookOpen size={20} className="mr-3 text-gray-500"/>{selectedSchedule.level} - {selectedSchedule.specialization}</p>
              <p className="flex items-center"><Clock size={20} className="mr-3 text-gray-500"/>{selectedSchedule.startTime} - {selectedSchedule.endTime}</p>
              <p className="flex items-center"><User size={20} className="mr-3 text-gray-500"/>{selectedSchedule.teacherName}</p>
               <p className="flex items-center"><MapPin size={20} className="mr-3 text-gray-500"/>{selectedSchedule.roomName}</p>
            </div>
            <div className="flex justify-end pt-6 mt-6 border dark:border-gray-700-t">
              <button onClick={() => setShowDetailModal(false)} className="px-5 py-2 bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300 text-base">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajout (ADD MODAL) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Nouvelle Planification</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-200 rounded-full">
                    <X size={24} />
                </button>
            </div>
            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cours</label>
                  <select name="courseId" value={newScheduleData.courseId} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">SÃ©lectionner un cours</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enseignant</label>
                  <select name="teacherId" value={newScheduleData.teacherId} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">SÃ©lectionner un enseignant</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Salle</label>
                  <select name="roomId" value={newScheduleData.roomId} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">SÃ©lectionner une salle</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jour de la semaine</label>
                  <select name="dayOfWeek" value={newScheduleData.dayOfWeek} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    {daysOfWeek.map((day, index) => <option key={index} value={index + 1}>{day}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Heure de dÃ©but</label>
                  <select name="startTime" value={newScheduleData.startTime} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    {timeSlots.map(time => <option key={time} value={time}>{time}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Heure de fin</label>
                  <select name="endTime" value={newScheduleData.endTime} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    {timeSlots.map(time => <option key={time} value={time}>{time}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Niveau</label>
                  <select name="level" value={newScheduleData.level} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">SÃ©lectionner un niveau</option>
                    {levels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SpÃ©cialisation</label>
                  <select name="specialization" value={newScheduleData.specialization} onChange={handleNewScheduleChange} required className="w-full border dark:border-gray-700 rounded-lg px-3 py-2">
                    <option value="">SÃ©lectionner une spÃ©cialisation</option>
                    {specializations.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border dark:border-gray-700-t mt-6">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 border dark:border-gray-700 border dark:border-gray-700-gray-300 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:bg-gray-900">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Save size={18} /> CrÃ©er
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
