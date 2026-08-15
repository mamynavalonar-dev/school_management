export const USER_ROLES = {
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  STAFF: 'Staff'
};

export const STUDENT_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  GRADUATED: 'Graduated'
};

export const TEACHER_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  RETIRED: 'Retired'
};

export const COURSE_TYPES = {
  THEORY: 'Theory',
  PRACTICE: 'Practice',
  MIXED: 'Mixed'
};

export const ROOM_TYPES = {
  CLASSROOM: 'Classroom',
  LABORATORY: 'Laboratory',
  AMPHITHEATER: 'Amphitheater',
  CONFERENCE: 'Conference',
  COMPUTER: 'Computer'
};

export const EVALUATION_TYPES = {
  CONTINUOUS: 'Contrôle Continu',
  PARTIAL: 'Examen Partiel',
  FINAL: 'Examen Final',
  PROJECT: 'Projet',
  PRACTICAL: 'TP'
};

export const GRADE_STATUS = {
  GRADED: 'graded',
  PENDING: 'pending',
  ABSENT: 'absent'
};

export const ABSENCE_STATUS = {
  JUSTIFIED: 'justified',
  UNJUSTIFIED: 'unjustified',
  PENDING: 'pending'
};

export const LEVELS = [
  { id: 1, name: 'L1', description: 'Première année de Licence' },
  { id: 2, name: 'L2', description: 'Deuxième année de Licence' },
  { id: 3, name: 'L3', description: 'Troisième année de Licence' },
  { id: 4, name: 'M1', description: 'Première année de Master' },
  { id: 5, name: 'M2', description: 'Deuxième année de Master' }
];

export const SPECIALIZATIONS = [
  { id: 1, name: 'Informatique', code: 'INFO' },
  { id: 2, name: 'Mathématiques', code: 'MATH' },
  { id: 3, name: 'Physique', code: 'PHYS' },
  { id: 4, name: 'Chimie', code: 'CHIM' }
];

export const DAYS_OF_WEEK = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
];

export const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
];
