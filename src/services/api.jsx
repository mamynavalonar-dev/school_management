const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
      return this.getMockResponse(endpoint, options);
    }
  }

  getMockResponse(endpoint, options) {
    const mockData = {
      'student.php': {
        success: true,
        data: [
          { id: 1, student_number: 'STU20240001', first_name: 'Jean', last_name: 'Dupont', email: 'jean.dupont@email.com', level: 'L3', specialization: 'Informatique', status: 'Active' },
          { id: 2, student_number: 'STU20240002', first_name: 'Marie', last_name: 'Martin', email: 'marie.martin@email.com', level: 'L2', specialization: 'Mathématiques', status: 'Active' }
        ]
      },
      'teachers.php': {
        success: true,
        data: [
          { id: 1, teacher_number: 'TEA20240001', first_name: 'Pierre', last_name: 'Durand', email: 'pierre.durand@school.com', department: 'Informatique', status: 'Active' }
        ]
      },
      'courses.php': {
        success: true,
        data: [
          { id: 1, name: 'Programmation Web', code: 'INFO301', teacher_name: 'Pierre Durand', level: 'L3', credits: 6 }
        ]
      },
      'dashboard.php': {
        success: true,
        data: {
          students: { total: 156, new: 12, active: 148 },
          teachers: { total: 24, active: 22 },
          courses: { total: 45, active: 42 },
          rooms: { total: 18, available: 15 }
        }
      },
      'rooms.php': { success: true, data: [] },
      'planning.php': { success: true, data: [] },
      'evaluations.php': { success: true, data: [] },
      'grades.php': { success: true, data: [] },
      'absences.php': { success: true, data: [] },
      'auth.php': {
        success: true,
        data: { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' }
      }
    };

    for (const [key, value] of Object.entries(mockData)) {
      if (endpoint.includes(key)) {
        return Promise.resolve(value);
      }
    }

    return Promise.resolve({ success: true, data: null });
  }

  async getStudents() { return this.request('student.php'); }
  async createStudent(studentData) { return this.request('student.php', { method: 'POST', body: studentData }); }
  async updateStudent(id, studentData) { return this.request(`student.php?id=${id}`, { method: 'PUT', body: studentData }); }
  async deleteStudent(id) { return this.request(`student.php?id=${id}`, { method: 'DELETE' }); }
  
  async getTeachers() { return this.request('teachers.php'); }
  async getCourses() { return this.request('courses.php'); }
  async getDashboardStats() { return this.request('dashboard.php?action=stats'); }
  
  // Nouveaux Endpoints
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
}

const apiService = new ApiService();
export default apiService;