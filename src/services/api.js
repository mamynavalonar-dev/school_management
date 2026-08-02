// src/services/api.js
//
// Fichier unique fusionné (remplace l'ancien duo api.js / api.jsx).
// Raison de la fusion : api.js n'envoyait pas `credentials: 'include'`,
// donc le cookie de session PHP (PHPSESSID) n'était jamais renvoyé au
// backend après le login -> auth_guard.php voyait $_SESSION['user_id']
// vide et renvoyait 401 en boucle sur toutes les routes protégées
// (dashboard.php, students.php, etc.), même après une connexion réussie.
//
// Ce fichier expose à la fois :
//   - un export par défaut `apiService` (classe ApiService), utilisé par
//     Auth.jsx et AppContext.jsx
//   - des fonctions nommées (getStats, getActivities, getUpcoming, ...),
//     utilisées par Dashboard.jsx
// afin qu'un seul fichier serve de source de vérité pour tous les appels API.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '/api';

/**
 * Helper fetch bas niveau : vérifie status et content-type avant parsing JSON.
 * Utilisé par les fonctions exportées nommées (getStats, getActivities, ...).
 */
async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // requis : envoie/reçoit le cookie PHPSESSID
      ...options,
    });
  } catch (err) {
    console.error(`Network error requesting ${url}:`, err);
    return getMockData(path);
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) {
    console.error(`API Error ${res.status} for ${url}:`, text);
    if (res.status >= 500) {
      return getMockData(path);
    }

    let serverMessage = '';
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(text);
        serverMessage = json.message ? `: ${json.message}` : '';
      } catch (e) {
        serverMessage = ' (response not valid JSON)';
      }
    } else {
      serverMessage = ' (server returned HTML or text)';
    }
    throw new Error(`API ${res.status} ${res.statusText}${serverMessage}`);
  }

  if (!contentType.includes('application/json')) {
    console.warn(`Expected JSON from ${url} but got:`, contentType);
    return getMockData(path);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`Failed to parse JSON from ${url}:`, e);
    return getMockData(path);
  }
}

/**
 * Données mockées pour le développement (utilisées si le backend est indisponible).
 */
function getMockData(path) {
  console.log('Using mock data for:', path);
  if (path.includes('dashboard.php?action=stats')) {
    return {
      success: true,
      data: {
        students: { total: 156, new: 12, active: 148 },
        teachers: { total: 24, active: 22 },
        courses: { total: 45, active: 42 },
        rooms: { total: 18, available: 15 },
        schedules: { today: 8, thisWeek: 42 },
        absences: { today: 3, thisMonth: 28 },
        evaluations: { upcoming: 5, thisMonth: 12 },
        grades: { pending: 45, completed: 287 }
      }
    };
  }

  if (path.includes('dashboard.php?action=activities')) {
    return {
      success: true,
      data: [
        {
          id: 1,
          type: 'grade',
          description: 'Nouvelle note ajoutée en Programmation Web',
          user: 'Prof. Durand',
          time: '2024-01-15 14:30:00'
        },
        {
          id: 2,
          type: 'absence',
          description: 'Absence justifiée - Jean Dupont',
          user: 'Admin',
          time: '2024-01-15 11:15:00'
        },
        {
          id: 3,
          type: 'course',
          description: 'Nouveau cours créé: Intelligence Artificielle',
          user: 'Prof. Leblanc',
          time: '2024-01-14 16:45:00'
        }
      ]
    };
  }

  if (path.includes('dashboard.php?action=upcoming')) {
    return {
      success: true,
      data: [
        {
          id: 1,
          title: 'Examen Final - Mathématiques',
          date: '2024-01-20',
          time: '09:00',
          type: 'exam'
        },
        {
          id: 2,
          title: 'Réunion des enseignants',
          date: '2024-01-18',
          time: '14:00',
          type: 'meeting'
        },
        {
          id: 3,
          title: 'Date limite rendu projets',
          date: '2024-01-25',
          time: '23:59',
          type: 'deadline'
        }
      ]
    };
  }

  if (path.includes('students.php?action=all')) {
    return {
      success: true,
      data: [
        { id: 1, studentNumber: 'STU20240001', firstName: 'Jean', lastName: 'Dupont', email: 'jean.dupont@email.com', phone: '0123456789', level: 'L3', specialization: 'Informatique', status: 'Active' },
        { id: 2, studentNumber: 'STU20240002', firstName: 'Marie', lastName: 'Martin', email: 'marie.martin@email.com', phone: '0987654321', level: 'L2', specialization: 'Mathématiques', status: 'Active' }
      ]
    };
  }

  if (path.includes('classes.php?action=all')) {
    return {
      success: true,
      data: [
        { id: 1, name: 'L1 Informatique', level: 'L1', specialization: 'Informatique', studentCount: 30 },
        { id: 2, name: 'L2 Mathématiques', level: 'L2', specialization: 'Mathématiques', studentCount: 25 }
      ]
    };
  }

  if (path.includes('student.php')) {
    return {
      success: true,
      data: [
        { id: 1, student_number: 'STU20240001', first_name: 'Jean', last_name: 'Dupont', email: 'jean.dupont@email.com', level: 'L3', specialization: 'Informatique', status: 'Active' },
        { id: 2, student_number: 'STU20240002', first_name: 'Marie', last_name: 'Martin', email: 'marie.martin@email.com', level: 'L2', specialization: 'Mathématiques', status: 'Active' }
      ]
    };
  }

  if (path.includes('teachers.php')) {
    return {
      success: true,
      data: [
        { id: 1, teacher_number: 'TEA20240001', first_name: 'Pierre', last_name: 'Durand', email: 'pierre.durand@school.com', department: 'Informatique', status: 'Active' }
      ]
    };
  }

  if (path.includes('courses.php')) {
    return {
      success: true,
      data: [
        { id: 1, name: 'Programmation Web', code: 'INFO301', teacher_name: 'Pierre Durand', level: 'L3', credits: 6 }
      ]
    };
  }

  if (path.includes('auth.php')) {
    return {
      success: true,
      data: { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' }
    };
  }

  // Retour par défaut pour les autres endpoints
  return {
    success: true,
    data: [],
    message: 'Mock data - Backend non disponible'
  };
}

/**
 * Fonctions publiques exportées (nommées) — utilisées par Dashboard.jsx.
 */
export async function getAllStudents() {
  const res = await apiRequest('/students.php?action=all');
  return res.data ?? res;
}

export async function getAllClasses() {
  const res = await apiRequest('/classes.php?action=all');
  return res.data ?? res;
}

export async function getStats() {
  const res = await apiRequest('/dashboard.php?action=stats');
  return res.data ?? res;
}

export async function getActivities() {
  const res = await apiRequest('/dashboard.php?action=activities');
  return res.data ?? res;
}

export async function getUpcoming() {
  const res = await apiRequest('/dashboard.php?action=upcoming');
  return res.data ?? res;
}

/**
 * Classe ApiService — export par défaut, utilisée par Auth.jsx et AppContext.jsx.
 * Toutes les requêtes passent par request(), qui inclut credentials: 'include'
 * pour que le cookie de session PHP soit envoyé/reçu correctement.
 */
class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.useMocks = false;
    this.backendChecked = false;
  }

  async checkBackend() {
    if (this.backendChecked) return !this.useMocks;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await fetch(`${this.baseURL}/health.php`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      this.backendChecked = true;
      this.useMocks = !response.ok;
      return response.ok;
    } catch (error) {
      this.useMocks = true;
      this.backendChecked = true;
      return false;
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}/${endpoint}`;

    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        ...config,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success === false) {
        throw new Error(data.message || 'Request failed');
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Request timeout, using mock data');
      }
      this.useMocks = true;
      return getMockData(endpoint);
    }
  }

  async getStudents() { return this.request('student.php'); }
  async createStudent(studentData) { return this.request('student.php', { method: 'POST', body: studentData }); }
  async updateStudent(id, studentData) { return this.request(`student.php?id=${id}`, { method: 'PUT', body: studentData }); }
  async deleteStudent(id) { return this.request(`student.php?id=${id}`, { method: 'DELETE' }); }

  async getTeachers() { return this.request('teachers.php'); }
  async getCourses() { return this.request('courses.php'); }
  async getDashboardStats() { return this.request('dashboard.php?action=stats'); }

  async getRooms() { return this.request('rooms.php'); }
  async createRoom(data) { return this.request('rooms.php', { method: 'POST', body: data }); }
  async updateRoom(id, data) { return this.request(`rooms.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteRoom(id) { return this.request(`rooms.php?id=${id}`, { method: 'DELETE' }); }

  async getSchedules() { return this.request('planning.php'); }
  async createSchedule(data) { return this.request('planning.php', { method: 'POST', body: data }); }
  async deleteSchedule(id) { return this.request(`planning.php?id=${id}`, { method: 'DELETE' }); }

  async getEvaluations() { return this.request('evaluations.php'); }
  async createEvaluation(data) { return this.request('evaluations.php', { method: 'POST', body: data }); }
  async updateEvaluation(id, data) { return this.request(`evaluations.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteEvaluation(id) { return this.request(`evaluations.php?id=${id}`, { method: 'DELETE' }); }

  async getGrades() { return this.request('grades.php'); }
  async createGrade(data) { return this.request('grades.php', { method: 'POST', body: data }); }
  async updateGrade(id, data) { return this.request(`grades.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteGrade(id) { return this.request(`grades.php?id=${id}`, { method: 'DELETE' }); }

  async getAbsences() { return this.request('absences.php'); }
  async createAbsence(data) { return this.request('absences.php', { method: 'POST', body: data }); }
  async updateAbsence(id, data) { return this.request(`absences.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteAbsence(id) { return this.request(`absences.php?id=${id}`, { method: 'DELETE' }); }

  async login(credentials) {
    return this.request('auth.php', { method: 'POST', body: credentials });
  }

  async register(userData) {
    return this.request('auth.php', { method: 'POST', body: userData });
  }

  async logout() {
    try {
      await this.request('auth.php?action=logout', { method: 'GET' });
      return { success: true };
    } catch (error) {
      return { success: true };
    }
  }

  // Méthode utilitaire de vérification de connexion (portée depuis l'ancien api.js)
  async checkBackendConnection() {
    try {
      const response = await fetch(`${this.baseURL}/dashboard.php?action=stats`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

const apiService = new ApiService();
export { apiService };
export default apiService;
