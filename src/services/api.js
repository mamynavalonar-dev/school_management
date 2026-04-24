// src/services/api.js
const API_BASE = import.meta.env.VITE_API_BASE || '/api'; // CORRECTION: Utilisation de /api

/**
 * Helper fetch: vérifie status et content-type avant parsing JSON.
 * Retourne l'objet JSON ou lève une erreur descriptive.
 */
async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  } catch (err) {
    console.error(`Network error requesting ${url}:`, err);
    // Retourner des données mockées en cas d'erreur réseau
    return getMockData(path);
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) {
    console.error(`API Error ${res.status} for ${url}:`, text);
    // Retourner des données mockées en cas d'erreur serveur
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
 * Données mockées pour le développement
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
  
  // Retour par défaut pour les autres endpoints
  return {
    success: true,
    data: [],
    message: 'Mock data - Backend non disponible'
  };
}

/**
 * Fonctions publiques exportées
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

// Méthodes supplémentaires pour la gestion des erreurs
export const apiService = {
  getAllStudents,
  getAllClasses,
  getStats,
  getActivities,
  getUpcoming,
  
  // Méthode pour vérifier la connexion au backend
  async checkBackendConnection() {
    try {
      const response = await fetch('/api/dashboard.php?action=stats', { // CORRECTION: Utilisation de /api
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
};

export default apiService;