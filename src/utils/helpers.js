import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export const formatDate = (date, formatStr = 'dd/MM/yyyy') => {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr, { locale: fr });
};

export const formatDateTime = (date, time) => {
  if (!date || !time) return '';
  const dateTime = new Date(`${date}T${time}`);
  return format(dateTime, 'EEEE dd MMMM yyyy à HH:mm', { locale: fr });
};

export const formatDuration = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}`;
  }
  return `${mins}min`;
};

export const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};

export const getGradeColor = (score, maxScore) => {
  if (!score && score !== 0) return 'text-gray-500';
  const percentage = (score / maxScore) * 100;
  if (percentage >= 80) return 'text-green-600';
  if (percentage >= 60) return 'text-blue-600';
  if (percentage >= 40) return 'text-orange-600';
  return 'text-red-600';
};

export const formatGrade = (score, maxScore) => {
  if (!score && score !== 0) return '-';
  return `${score}/${maxScore}`;
};

export const calculateAverage = (grades) => {
  if (!grades.length) return 0;
  const sum = grades.reduce((total, grade) => total + grade.score, 0);
  return sum / grades.length;
};

export const generateStudentNumber = (year = new Date().getFullYear()) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `STU${year}${random}`;
};

export const generateTeacherNumber = (year = new Date().getFullYear()) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `TEA${year}${random}`;
};

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone) => {
  const phoneRegex = /^[0-9+\-\s()]+$/;
  return phoneRegex.test(phone);
};

export const exportToCSV = (data, filename) => {
  if (!data.length) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const getWeekDates = (date) => {
  const week = [];
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);

  for (let i = 0; i < 6; i++) {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);
    week.push(day);
  }
  return week;
};

export const detectScheduleConflicts = (schedules) => {
  const conflicts = [];
  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const schedule1 = schedules[i];
      const schedule2 = schedules[j];
      
      // Même jour
      if (schedule1.dayOfWeek === schedule2.dayOfWeek) {
        // Conflit de salle
        if (schedule1.roomId === schedule2.roomId &&
            timeSlotsOverlap(schedule1, schedule2)) {
          conflicts.push({
            type: 'room',
            schedule1,
            schedule2,
            message: `Conflit de salle: ${schedule1.roomName}`
          });
        }
        
        // Conflit d'enseignant
        if (schedule1.teacherId === schedule2.teacherId &&
            timeSlotsOverlap(schedule1, schedule2)) {
          conflicts.push({
            type: 'teacher',
            schedule1,
            schedule2,
            message: `Conflit d'enseignant: ${schedule1.teacherName}`
          });
        }
      }
    }
  }
  
  return conflicts;
};

const timeSlotsOverlap = (schedule1, schedule2) => {
  const start1 = timeToMinutes(schedule1.startTime);
  const end1 = timeToMinutes(schedule1.endTime);
  const start2 = timeToMinutes(schedule2.startTime);
  const end2 = timeToMinutes(schedule2.endTime);
  
  return start1 < end2 && start2 < end1;
};

const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};


