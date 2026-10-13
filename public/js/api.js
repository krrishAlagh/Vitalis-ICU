// Vitalis ICU API Client Wrapper

const API = {
  getToken() {
    return localStorage.getItem('icu_auth_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('icu_auth_token', token);
    } else {
      localStorage.removeItem('icu_auth_token');
    }
  },

  getUser() {
    const raw = localStorage.getItem('icu_auth_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('icu_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('icu_auth_user');
    }
  },

  clearSession() {
    localStorage.removeItem('icu_auth_token');
    localStorage.removeItem('icu_auth_user');
  },

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
    const headers = options.headers || {};
    const token = API.getToken();

    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    options.headers = headers;

    try {
      const response = await fetch(url, options);

      // Handle 401 Unauthorized
      if (response.status === 401 && !url.includes('/api/auth/login')) {
        const hadToken = !!API.getToken();
        API.clearSession();
        if (hadToken) {
          window.dispatchEvent(new CustomEvent('icu:auth_expired'));
        }
        throw new Error('Session expired or unauthorized.');
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: Request failed`);
      }
      return data;
    } catch (err) {
      console.error(`API Error [${url}]:`, err.message);
      throw err;
    }
  },

  // Auth
  login(identifier, password) {
    return API.request('/api/auth/login', {
      method: 'POST',
      body: { identifier, password }
    });
  },

  logout() {
    return API.request('/api/auth/logout', { method: 'POST' });
  },

  getDemoAccounts() {
    return API.request('/api/auth/demo-accounts');
  },

  getMe() {
    return API.request('/api/auth/me');
  },

  // Patients & Vitals
  getPatients() {
    return API.request('/api/patients');
  },

  getPatient(patientId) {
    return API.request(`/api/patients/${patientId}`);
  },

  getPatientVitalsHistory(patientId, limit = 30) {
    return API.request(`/api/patients/${patientId}/vitals?limit=${limit}`);
  },

  getFamilySummary(patientId) {
    return API.request(`/api/patients/${patientId}/family-summary`);
  },

  // Alerts
  getAlerts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return API.request(`/api/alerts${query ? '?' + query : ''}`);
  },

  acknowledgeAlert(alertId, notes = '') {
    return API.request(`/api/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: { notes }
    });
  },

  resolveAlert(alertId, resolutionNotes = '') {
    return API.request(`/api/alerts/${alertId}/resolve`, {
      method: 'POST',
      body: { resolutionNotes }
    });
  },

  // Clinical Notes
  getClinicalNotes(patientId) {
    return API.request(`/api/clinical-notes/${patientId}`);
  },

  addClinicalNote(patientId, noteText, category = 'observation') {
    return API.request(`/api/clinical-notes/${patientId}`, {
      method: 'POST',
      body: { noteText, category }
    });
  },

  // Admin
  getAdminUsers() {
    return API.request('/api/admin/users');
  },

  createAdminUser(userData) {
    return API.request('/api/admin/users', {
      method: 'POST',
      body: userData
    });
  },

  updateUserStatus(userId, isActive) {
    return API.request(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: { isActive }
    });
  },

  admitPatient(patientData) {
    return API.request('/api/admin/patients', {
      method: 'POST',
      body: patientData
    });
  },

  getPatientThresholds(patientId) {
    return API.request(`/api/admin/thresholds/${patientId}`);
  },

  updatePatientThresholds(patientId, thresholds) {
    return API.request(`/api/admin/thresholds/${patientId}`, {
      method: 'PUT',
      body: thresholds
    });
  },

  getStaffAssignments() {
    return API.request('/api/admin/assignments');
  },

  assignStaff(staffId, patientId, shift = 'all') {
    return API.request('/api/admin/assignments', {
      method: 'POST',
      body: { staffId, patientId, shift }
    });
  },

  removeStaffAssignment(assignmentId) {
    return API.request(`/api/admin/assignments/${assignmentId}`, {
      method: 'DELETE'
    });
  },

  getFamilyLinks() {
    return API.request('/api/admin/family-links');
  },

  linkFamily(familyUserId, patientId, relationship) {
    return API.request('/api/admin/family-links', {
      method: 'POST',
      body: { familyUserId, patientId, relationship }
    });
  },

  removeFamilyLink(linkId) {
    return API.request(`/api/admin/family-links/${linkId}`, {
      method: 'DELETE'
    });
  },

  getAuditLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return API.request(`/api/admin/audit-logs${query ? '?' + query : ''}`);
  },

  // Simulator
  getSimulatorStatus() {
    return API.request('/api/simulator/status');
  },

  startSimulator() {
    return API.request('/api/simulator/start', { method: 'POST' });
  },

  stopSimulator() {
    return API.request('/api/simulator/stop', { method: 'POST' });
  },

  setSimulatorInterval(intervalMs) {
    return API.request('/api/simulator/interval', {
      method: 'POST',
      body: { intervalMs }
    });
  },

  triggerDemoBreach(patientId = 'PAT-115', parameter = 'blood_pressure_sys') {
    return API.request('/api/simulator/trigger-breach', {
      method: 'POST',
      body: { patientId, parameter }
    });
  }
};

window.API = API;
