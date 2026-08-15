// src/services/api.js
//
// Fichier unique fusionné (remplace l'ancien duo api.js / api.jsx).
// Raison de la fusion : api.js n'envoyait pas `credentials: 'include'`,
// donc le cookie de session PHP (PHPSESSID) n'était jamais renvoyé au
// backend après le login -> auth_guard.php voyait $_SESSION['user_id']
// vide et renvoyait 401 en boucle sur toutes les routes protégées
// (dashboard.php, student.php, etc.), même après une connexion réussie.
//
// Ce fichier expose à la fois :
//   - un export par défaut `apiService` (classe ApiService), utilisé par
//     Auth.jsx et AppContext.jsx
//   - des fonctions nommées (getStats, getActivities, getUpcoming, ...),
//     utilisées par Dashboard.jsx
// afin qu'un seul fichier serve de source de vérité pour tous les appels API.

const DEFAULT_API_BASE_URL = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8000/api'
  : '/api';
const CONFIGURED_API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || '',
).trim();
// Une valeur relative comme `/api` convient au navigateur, mais pas à une
// page Electron chargée en file:// (elle deviendrait file:///api). Dans ce
// cas, le serveur PHP local reste la cible correcte.
const API_BASE_URL = window.location.protocol === 'file:'
  && CONFIGURED_API_BASE_URL
  && !/^https?:\/\//i.test(CONFIGURED_API_BASE_URL)
  ? DEFAULT_API_BASE_URL
  : (CONFIGURED_API_BASE_URL || DEFAULT_API_BASE_URL);

function resolvePublicAssetUrl(assetUrl) {
  if (!assetUrl || /^(https?:|data:|blob:)/i.test(assetUrl)) return assetUrl || '';
  try {
    const resolvedApiBase = new URL(API_BASE_URL, window.location.href);
    return new URL(assetUrl, resolvedApiBase).href;
  } catch {
    return assetUrl;
  }
}

function normalizePayloadAssets(value) {
  if (Array.isArray(value)) return value.map(normalizePayloadAssets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (['photo_url', 'avatar_url'].includes(key) && typeof item === 'string') {
      return [key, resolvePublicAssetUrl(item)];
    }
    return [key, normalizePayloadAssets(item)];
  }));
}

// Clé sessionStorage : isolée par onglet (contrairement à localStorage, partagé
// par tout le navigateur), ce qui permet d'avoir un utilisateur différent
// connecté dans chaque onglet.
const AUTH_TOKEN_KEY = 'auth_token';

function getAuthToken() {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {
    // sessionStorage indisponible (mode privé strict, etc.) -> on continue
    // sans persister ; l'utilisateur devra se reconnecter après un F5.
  }
}

// Protection CSRF (Task #5) : le Bearer token ci-dessus est déjà
// intrinsèquement sûr contre le CSRF (un site tiers ne peut pas lire ce
// sessionStorage), donc csrf_guard.php côté backend n'exige ce token que
// pour les requêtes authentifiées en mode cookie-only. On le transmet dans
// tous les cas par simplicité : le backend l'ignore quand un Bearer valide
// est déjà présent.
const CSRF_TOKEN_KEY = 'csrf_token';

function getCsrfToken() {
  try {
    return sessionStorage.getItem(CSRF_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

function setCsrfToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(CSRF_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(CSRF_TOKEN_KEY);
    }
  } catch (e) {
    // idem sessionStorage indisponible
  }
}

function getAuthHeaders() {
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  return {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  };
}

function handleSessionExpiration(response) {
  if (response?.status !== 401 || !getAuthToken()) return;
  setAuthToken(null);
  setCsrfToken(null);
  window.dispatchEvent(new Event('school-session-expired'));
}

/**
 * Petite pause, utilisée par le retry réseau ci-dessous.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper fetch bas niveau : vérifie status et content-type avant parsing JSON.
 * Utilisé par les fonctions exportées nommées (getStats, getActivities, ...).
 */
async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  const { body, headers: requestHeaders = {}, ...restOptions } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const serializedBody = isFormData ? body : (body && typeof body === 'object' ? JSON.stringify(body) : body);

  const requestMethod = String(restOptions.method || 'GET').toUpperCase();
  // Rejouer un POST après une coupure peut créer deux messages, paiements ou
  // comptes si le serveur avait bien traité la première requête. Seules les
  // lectures, idempotentes, bénéficient donc d'une nouvelle tentative.
  const maxNetworkRetries = ['GET', 'HEAD'].includes(requestMethod) ? 2 : 0;
  const retryDelayMs = 500;

  let res;
  let lastNetworkError;
  for (let attempt = 0; attempt <= maxNetworkRetries; attempt++) {
    try {
      res = await fetch(url, {
        ...restOptions,
        headers: {
          'Accept': 'application/json',
          ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
          ...getAuthHeaders(),
          ...requestHeaders,
        },
        credentials: 'include',
        body: serializedBody,
      });
      lastNetworkError = null;
      break;
    } catch (err) {
      lastNetworkError = err;
      if (attempt < maxNetworkRetries) {
        console.warn(`Network error requesting ${url} (attempt ${attempt + 1}/${maxNetworkRetries + 1}), retrying...`, err);
        await sleep(retryDelayMs);
      }
    }
  }

  if (lastNetworkError) {
    console.error(`Network error requesting ${url} after ${maxNetworkRetries + 1} attempts:`, lastNetworkError);
    throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion puis réessayez.');
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!res.ok) {
    handleSessionExpiration(res);
    console.error(`API Error ${res.status} for ${url}:`, text);
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
    console.error(`Expected JSON from ${url} but got:`, contentType);
    throw new Error('Le serveur a renvoyé une réponse invalide.');
  }

  let data;
  try {
    data = normalizePayloadAssets(JSON.parse(text));
  } catch (e) {
    console.error(`Failed to parse JSON from ${url}:`, e);
    throw new Error('La réponse du serveur ne peut pas être lue.');
  }

  if (data?.success === false) {
    throw new Error(data.message || 'La requête a échoué.');
  }

  return data;
}

/**
 * Fonctions publiques exportées (nommées) — utilisées par Dashboard.jsx.
 */
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

export async function getAdminUsers(filters = {}) {
  const queryParams = new URLSearchParams(filters).toString();
  const path = queryParams ? `/admin_users.php?${queryParams}` : '/admin_users.php';
  const res = await apiRequest(path);
  return res.data ?? res;
}

export async function getAdminUser(id) {
  const res = await apiRequest(`/admin_users.php?id=${id}`);
  return res.data ?? res;
}

export async function createAdminUser(userData) {
  const res = await apiRequest('/admin_users.php', { method: 'POST', body: userData });
  return res.data ?? res;
}

export async function updateAdminUser(id, userData) {
  const res = await apiRequest(`/admin_users.php?id=${id}`, { method: 'PUT', body: userData });
  return res.data ?? res;
}

export async function deleteAdminUser(id) {
  const res = await apiRequest(`/admin_users.php?id=${id}`, { method: 'DELETE' });
  return res.data ?? res;
}

export async function getAdminStats() {
  const res = await apiRequest('/admin_stats.php');
  return res.data ?? res;
}

export async function getAdminUserStats() {
  const res = await apiRequest('/admin_stats.php?type=users');
  return res.data ?? res;
}

export async function getAdminSystemInfo() {
  const res = await apiRequest('/admin_stats.php?type=system-info');
  return res.data ?? res;
}

export async function getDirectorDashboard() {
  const res = await apiRequest('/director_dashboard.php');
  return res.data ?? res;
}

export async function getTeacherDashboard() {
  const res = await apiRequest('/teacher_dashboard.php');
  return res.data ?? res;
}

export async function getStudentDashboard() {
  const res = await apiRequest('/student_dashboard.php');
  return res.data ?? res;
}

// --- Seuils d'alerte (enseignant) ---

export async function getAlertThresholds() {
  const res = await apiRequest('/teacher_dashboard.php?section=thresholds');
  return res.data ?? res;
}

export async function saveAlertThreshold(threshold) {
  const res = await apiRequest('/teacher_dashboard.php?section=thresholds', {
    method: 'POST',
    body: threshold,
  });
  return res.data ?? res;
}

export async function deleteAlertThreshold(id) {
  const res = await apiRequest(`/teacher_dashboard.php?section=thresholds&id=${id}`, {
    method: 'DELETE',
  });
  return res.data ?? res;
}

// --- Justificatifs d'absence (étudiant) ---

export async function uploadAbsenceJustification(absenceId, file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest(`/absence_justifications.php?absence_id=${absenceId}`, {
    method: 'POST',
    body: formData,
  });
}

// --- Documents/supports de cours (Task #4 - "resources") ---

export async function uploadCourseResource(courseId, title, file, resourceType = 'lesson') {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('resource_type', resourceType);
  formData.append('file', file);

  return apiRequest(`/course_resources.php?course_id=${courseId}`, {
    method: 'POST',
    body: formData,
  });
}

export async function downloadCourseResource(resourceId, suggestedFilename = 'document') {
  const url = `${API_BASE_URL}/course_resources.php?download=${resourceId}`;
  const res = await fetch(url, {
    headers: { ...getAuthHeaders() },
    credentials: 'include',
  });

  if (!res.ok) {
    handleSessionExpiration(res);
    let message = `Échec du téléchargement (HTTP ${res.status}).`;
    try {
      const json = await res.json();
      message = json.message || message;
    } catch {
      // La réponse d'erreur n'est pas nécessairement du JSON.
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = suggestedFilename || 'document';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}


export async function reviewCourseResource(resourceId, reviewStatus, reviewNote = '') {
  return apiRequest(`/course_resources.php?review_id=${resourceId}`, {
    method: 'PUT',
    body: { review_status: reviewStatus, review_note: reviewNote },
  });
}

export async function getCourseResourceAccessRoster(courseId) {
  const res = await apiRequest(`/course_resources.php?course_id=${courseId}&access_roster=1`);
  return res.data ?? res;
}

export async function setCourseResourceAccessOverride({ studentId, courseId, isAllowed, reason = '', expiresAt = '' }) {
  return apiRequest('/course_resources.php?action=override', {
    method: 'PUT',
    body: { student_id: studentId, course_id: courseId, is_allowed: isAllowed, reason, expires_at: expiresAt || null },
  });
}

// --- Sujets d'évaluation validés par la direction ---
export async function getEvaluationSubject(evaluationId) {
  const res = await apiRequest(`/evaluation_subjects.php?evaluation_id=${evaluationId}`);
  return res.data ?? null;
}

export async function uploadEvaluationSubject(evaluationId, file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest(`/evaluation_subjects.php?evaluation_id=${evaluationId}`, { method: 'POST', body: formData });
}

export async function reviewEvaluationSubject(evaluationId, reviewStatus, reviewNote = '') {
  return apiRequest(`/evaluation_subjects.php?evaluation_id=${evaluationId}`, {
    method: 'PUT',
    body: { review_status: reviewStatus, review_note: reviewNote },
  });
}

export async function deleteEvaluationSubject(evaluationId) {
  return apiRequest(`/evaluation_subjects.php?evaluation_id=${evaluationId}`, { method: 'DELETE' });
}

export async function downloadEvaluationSubject(subjectId, suggestedFilename = 'sujet-evaluation') {
  const res = await fetch(`${API_BASE_URL}/evaluation_subjects.php?download=${subjectId}`, {
    headers: { ...getAuthHeaders() }, credentials: 'include',
  });
  if (!res.ok) {
    handleSessionExpiration(res);
    let message = `Échec du téléchargement (HTTP ${res.status}).`;
    try { const data = await res.json(); message = data.message || message; } catch { /* flux non JSON */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl; link.download = suggestedFilename; document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function listAbsenceJustifications(absenceId) {
  const res = await apiRequest(`/absence_justifications.php?absence_id=${absenceId}`);
  return res.data ?? res;
}

export function getAbsenceJustificationUrl(fileId) {
  return `${API_BASE_URL}/absence_justifications.php?download=${fileId}`;
}

export async function downloadAbsenceJustification(fileId, suggestedFilename = 'justificatif') {
  const url = getAbsenceJustificationUrl(fileId);
  const res = await fetch(url, {
    headers: { ...getAuthHeaders() },
    credentials: 'include',
  });

  if (!res.ok) {
    handleSessionExpiration(res);
    throw new Error(`Échec du téléchargement (HTTP ${res.status}).`);
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = suggestedFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// --- Messagerie ---

export async function getConversations() {
  const res = await apiRequest('/messages.php?action=conversations');
  return res.data ?? res;
}

export async function createConversation({ participantIds, courseId } = {}) {
  const res = await apiRequest('/messages.php?action=conversations', {
    method: 'POST',
    body: { participant_ids: participantIds, course_id: courseId },
  });
  return res;
}

export async function getMessages(conversationId) {
  const res = await apiRequest(`/messages.php?action=messages&conversation_id=${conversationId}`);
  return res.data ?? res;
}

export async function getConversationDetails(conversationId) {
  const res = await apiRequest(`/messages.php?action=conversation_details&conversation_id=${conversationId}`);
  return res.data ?? res;
}

export async function getConversationCalls(conversationId) {
  const res = await apiRequest(`/messages.php?action=calls&conversation_id=${conversationId}`);
  return res.data ?? res;
}

export async function recordConversationCallEvent(conversationId, event) {
  const res = await apiRequest(`/messages.php?action=call_event&conversation_id=${conversationId}`, {
    method: 'POST',
    body: event,
  });
  return res.data ?? res;
}

export async function updateConversationSetting(conversationId, setting, value) {
  const res = await apiRequest(`/messages.php?action=conversation_setting&conversation_id=${conversationId}`, {
    method: 'POST',
    body: { setting, value },
  });
  return res.data ?? res;
}

export async function getPinnedMessages(conversationId) {
  const res = await apiRequest(`/messages.php?action=pins&conversation_id=${conversationId}`);
  return res.data ?? res;
}

export async function pinConversationMessage(conversationId, messageId) {
  return apiRequest(`/messages.php?action=pin&conversation_id=${conversationId}`, {
    method: 'POST',
    body: { message_id: messageId },
  });
}

export async function unpinConversationMessage(conversationId, messageId) {
  return apiRequest(`/messages.php?action=unpin&conversation_id=${conversationId}`, {
    method: 'POST',
    body: { message_id: messageId },
  });
}

export async function reportConversation(conversationId, { category, details }) {
  return apiRequest(`/messages.php?action=report&conversation_id=${conversationId}`, {
    method: 'POST',
    body: { category, details },
  });
}

export async function downloadMessageAttachment(attachmentId, suggestedFilename = 'piece-jointe') {
  const res = await fetch(`${API_BASE_URL}/messages.php?action=attachment&id=${attachmentId}`, {
    headers: { ...getAuthHeaders() },
    credentials: 'include',
  });
  if (!res.ok) {
    handleSessionExpiration(res);
    let message = `Échec du téléchargement (HTTP ${res.status}).`;
    try {
      const data = await res.json();
      message = data.message || message;
    } catch (error) {
      // La réponse peut être un flux ou une page d'erreur non JSON.
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = suggestedFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function sendMessage(conversationId, body) {
  const res = await apiRequest(`/messages.php?action=messages&conversation_id=${conversationId}`, {
    method: 'POST',
    body: { body },
  });
  return res;
}

export async function sendMessageWithAttachment(conversationId, { body, file }) {
  const formData = new FormData();
  if (body) formData.append('body', body);
  if (file) formData.append('file', file);

  return apiRequest(`/messages.php?action=messages&conversation_id=${conversationId}`, {
    method: 'POST',
    body: formData,
  });
}

export async function requestWsTicket() {
  const res = await apiRequest('/messages.php?action=ws_ticket', { method: 'POST' });
  return res.ticket;
}

export async function getAppNotifications() {
  const res = await apiRequest('/notifications.php');
  return res.data ?? res;
}


// --- Recherche globale / gouvernance / corbeille ---
export async function searchGlobal(query) {
  const res = await apiRequest(`/global_search.php?q=${encodeURIComponent(query)}`);
  return res.data ?? res;
}

export async function getAcademicPolicy() {
  const res = await apiRequest('/academic_policies.php');
  return res.data ?? res;
}
export async function saveAcademicPolicy(data) {
  const res = await apiRequest('/academic_policies.php', { method: 'PUT', body: data });
  return res.data ?? res;
}
export async function reactivateAcademicStudent(studentId) {
  return apiRequest('/academic_policies.php?action=reactivate', { method: 'POST', body: { student_id: studentId } });
}
export async function getTrashUsers() {
  const res = await apiRequest('/trash.php');
  return res.data ?? res;
}
export async function restoreTrashUser(id) {
  return apiRequest(`/trash.php?action=restore&id=${id}`, { method: 'POST', body: { id } });
}
export async function purgeTrashUser(id) {
  return apiRequest(`/trash.php?id=${id}`, { method: 'DELETE' });
}

/**
 * Liste les contacts que l'utilisateur courant peut contacter en
 * messagerie, groupés par rôle (endpoint dédié contacts.php, qui
 * applique côté serveur les mêmes règles de séparation des rôles que
 * createConversation()).
 * @param {{ search?: string, role?: string }} filters
 */
export async function getContacts(filters = {}) {
  const queryParams = new URLSearchParams();
  if (filters.search) queryParams.set('search', filters.search);
  if (filters.role) queryParams.set('role', filters.role);
  const qs = queryParams.toString();
  const path = qs ? `/contacts.php?action=list&${qs}` : '/contacts.php?action=list';
  const res = await apiRequest(path);
  return { list: res.data ?? [], grouped: res.grouped ?? {} };
}

/**
 * Classe ApiService — export par défaut, utilisée par Auth.jsx et AppContext.jsx.
 */
class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async checkBackend() {
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
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async request(endpoint, options = {}) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return apiRequest(path, options);
  }

  // --- Étudiants ---
  async getStudents() { return this.request('student.php'); }
  async createStudent(studentData) { return this.request('student.php', { method: 'POST', body: studentData }); }
  async updateStudent(id, studentData) { return this.request(`student.php?id=${id}`, { method: 'PUT', body: studentData }); }
  async deleteStudent(id) { return this.request(`student.php?id=${id}`, { method: 'DELETE' }); }

  // --- Inscriptions ---
  async getEnrollments(studentId = null) {
    const qs = studentId ? `?student_id=${studentId}` : '';
    return this.request(`enrollments.php${qs}`);
  }
  async createEnrollment(data) { return this.request('enrollments.php', { method: 'POST', body: data }); }
  async updateEnrollment(id, data) { return this.request(`enrollments.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteEnrollment(id) { return this.request(`enrollments.php?id=${id}`, { method: 'DELETE' }); }

  // --- Scolarité : années, groupes, dossiers, paiements et appels ---
  async getSchoolResource(resource, filters = {}) {
    const params = new URLSearchParams({ resource });
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    return this.request(`school_operations.php?${params.toString()}`);
  }
  async createSchoolResource(resource, data) {
    return this.request(`school_operations.php?resource=${encodeURIComponent(resource)}`, { method: 'POST', body: data });
  }
  async updateSchoolResource(resource, id, data) {
    return this.request(`school_operations.php?resource=${encodeURIComponent(resource)}&id=${id}`, { method: 'PUT', body: data });
  }
  async deleteSchoolResource(resource, id) {
    return this.request(`school_operations.php?resource=${encodeURIComponent(resource)}&id=${id}`, { method: 'DELETE' });
  }
  async getStudentDossier(studentId) { return this.getSchoolResource('student_dossier', { student_id: studentId }); }
  async getGroupRoster(groupId, sessionId = null) { return this.getSchoolResource('roster', { group_id: groupId, session_id: sessionId }); }
  async saveAttendance(data) { return this.createSchoolResource('attendance', data); }

  // --- Photos de profil (URL publique ou fichier local) ---
  async uploadProfilePhoto(file) {
    const form = new FormData();
    form.append('photo', file);
    const response = await this.request('upload_photo.php', { method: 'POST', body: form });
    if (response?.data?.url) response.data.url = resolvePublicAssetUrl(response.data.url);
    return response;
  }

  // --- Enseignants ---
  async getTeachers() { return this.request('teachers.php'); }
  async updateTeacher(id, data) { return this.request(`teachers.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteTeacher(id) { return this.request(`teachers.php?id=${id}`, { method: 'DELETE' }); }

  // --- Cours ---
  async getCourses() { return this.request('courses.php'); }
  async createCourse(data) { return this.request('courses.php', { method: 'POST', body: data }); }
  async updateCourse(id, data) { return this.request(`courses.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteCourse(id) { return this.request(`courses.php?id=${id}`, { method: 'DELETE' }); }

  // --- Dashboard ---
  async getDashboardStats() { return this.request('dashboard.php?action=stats'); }

  // --- Salles ---
  async getRooms() { return this.request('rooms.php'); }
  async createRoom(data) { return this.request('rooms.php', { method: 'POST', body: data }); }
  async updateRoom(id, data) { return this.request(`rooms.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteRoom(id) { return this.request(`rooms.php?id=${id}`, { method: 'DELETE' }); }

  // --- Réservations de salles ---
  async getRoomBookings(roomId, date) {
    const params = new URLSearchParams();
    if (roomId) params.set('room_id', roomId);
    if (date) params.set('date', date);
    const qs = params.toString();
    return this.request(`room_bookings.php${qs ? `?${qs}` : ''}`);
  }
  async createRoomBooking(data) { return this.request('room_bookings.php', { method: 'POST', body: data }); }
  async cancelRoomBooking(id) { return this.request(`room_bookings.php?id=${id}`, { method: 'DELETE' }); }

  // --- Documents de cours ---
  async getCourseResources(courseId) { return this.request(`course_resources.php?course_id=${courseId}`); }
  async deleteCourseResource(id) { return this.request(`course_resources.php?id=${id}`, { method: 'DELETE' }); }

  // --- Planification ---
  async getSchedules() { return this.request('planning.php'); }
  async createSchedule(data) { return this.request('planning.php', { method: 'POST', body: data }); }
  async updateSchedule(id, data) { return this.request(`planning.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteSchedule(id) { return this.request(`planning.php?id=${id}`, { method: 'DELETE' }); }

  // --- Référentiels ---
  async getLevels() { return this.request('levels.php'); }
  async createLevel(data) { return this.request('levels.php', { method: 'POST', body: data }); }
  async updateLevel(id, data) { return this.request(`levels.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteLevel(id) { return this.request(`levels.php?id=${id}`, { method: 'DELETE' }); }

  async getSpecializations() { return this.request('specializations.php'); }
  async createSpecialization(data) { return this.request('specializations.php', { method: 'POST', body: data }); }
  async updateSpecialization(id, data) { return this.request(`specializations.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteSpecialization(id) { return this.request(`specializations.php?id=${id}`, { method: 'DELETE' }); }

  async getEvaluationTypes() { return this.request('evaluation_types.php'); }
  async createEvaluationType(data) { return this.request('evaluation_types.php', { method: 'POST', body: data }); }
  async updateEvaluationType(id, data) { return this.request(`evaluation_types.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteEvaluationType(id) { return this.request(`evaluation_types.php?id=${id}`, { method: 'DELETE' }); }

  async getBuildings() { return this.request('buildings.php'); }
  async createBuilding(data) { return this.request('buildings.php', { method: 'POST', body: data }); }
  async updateBuilding(id, data) { return this.request(`buildings.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteBuilding(id) { return this.request(`buildings.php?id=${id}`, { method: 'DELETE' }); }

  async getRoomTypes() { return this.request('room_types.php'); }
  async createRoomType(data) { return this.request('room_types.php', { method: 'POST', body: data }); }
  async updateRoomType(id, data) { return this.request(`room_types.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteRoomType(id) { return this.request(`room_types.php?id=${id}`, { method: 'DELETE' }); }

  // --- Évaluations ---
  async getEvaluations() { return this.request('evaluations.php'); }
  async createEvaluation(data) { return this.request('evaluations.php', { method: 'POST', body: data }); }
  async updateEvaluation(id, data) { return this.request(`evaluations.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteEvaluation(id) { return this.request(`evaluations.php?id=${id}`, { method: 'DELETE' }); }

  // --- Notes ---
  async getGrades() { return this.request('grades.php'); }
  async getGradeReferences() { return this.request('grades.php?resource=references'); }
  async createGrade(data) { return this.request('grades.php', { method: 'POST', body: data }); }
  async updateGrade(id, data) { return this.request(`grades.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteGrade(id) { return this.request(`grades.php?id=${id}`, { method: 'DELETE' }); }

  // --- Bulletins ---
  async getReportCardReferences() { return this.request('report_cards.php?resource=references'); }
  async getReportCard(filters) {
    const params = new URLSearchParams({ resource: 'bulletin' });
    Object.entries(filters || {}).forEach(([key, value]) => value !== '' && value != null && params.set(key, value));
    return this.request(`report_cards.php?${params.toString()}`);
  }
  async saveReportCard(data) { return this.request('report_cards.php', { method: 'POST', body: data }); }

  // --- Présence du personnel et paie ---
  async getPayroll(resource = 'overview', filters = {}) {
    const params = new URLSearchParams({ resource });
    Object.entries(filters).forEach(([key, value]) => value !== '' && value != null && params.set(key, value));
    return this.request(`payroll.php?${params.toString()}`);
  }
  async createPayroll(resource, data) { return this.request(`payroll.php?resource=${encodeURIComponent(resource)}`, { method: 'POST', body: data }); }
  async updatePayroll(resource, id, data) { return this.request(`payroll.php?resource=${encodeURIComponent(resource)}&id=${id}`, { method: 'PUT', body: data }); }
  async deletePayroll(resource, id) { return this.request(`payroll.php?resource=${encodeURIComponent(resource)}&id=${id}`, { method: 'DELETE' }); }

  // --- Absences ---
  async getAbsences() { return this.request('absences.php'); }
  async createAbsence(data) { return this.request('absences.php', { method: 'POST', body: data }); }
  async updateAbsence(id, data) { return this.request(`absences.php?id=${id}`, { method: 'PUT', body: data }); }
  async deleteAbsence(id) { return this.request(`absences.php?id=${id}`, { method: 'DELETE' }); }

  // --- Admin ---
  async getAdminUsers(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const path = queryParams ? `/admin_users.php?${queryParams}` : '/admin_users.php';
    return this.request(path);
  }

  async getAdminUser(id) {
    return this.request(`/admin_users.php?id=${id}`);
  }

  async createAdminUser(userData) {
    return this.request('/admin_users.php', { method: 'POST', body: userData });
  }

  async updateAdminUser(id, userData) {
    return this.request(`/admin_users.php?id=${id}`, { method: 'PUT', body: userData });
  }

  async deleteAdminUser(id) {
    return this.request(`/admin_users.php?id=${id}`, { method: 'DELETE' });
  }

  async getAdminStats() {
    return this.request('/admin_stats.php');
  }

  async getAdminUserStats() {
    return this.request('/admin_stats.php?type=users');
  }

  async getAdminSystemInfo() {
    return this.request('/admin_stats.php?type=system-info');
  }

  // --- Authentification ---
  async login(credentials) {
    const result = await this.request('auth.php', { method: 'POST', body: credentials });
    if (result?.success && result?.data?.token) {
      setAuthToken(result.data.token);
      setCsrfToken(result.data.csrf_token);
    }
    return result;
  }

  async logout() {
    try {
      return await this.request('auth.php?action=logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
      setCsrfToken(null);
    }
  }

  async checkSession() {
    const token = getAuthToken();
    if (!token) {
      return { success: false };
    }
    try {
      const result = await this.request('auth.php?action=me', { method: 'GET' });
      if (result?.success && result?.data?.csrf_token) {
        setCsrfToken(result.data.csrf_token);
      }
      return result;
    } catch (error) {
      return { success: false };
    }
  }

  async checkBackendConnection() {
    try {
      const response = await fetch(`${this.baseURL}/dashboard.php?action=stats`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', ...getAuthHeaders() },
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
