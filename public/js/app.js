// Vitalis ICU Main Application Controller

(function () {
  'use strict';

  const AppState = {
    currentUser: null,
    currentView: 'dashboard',
    patients: [],
    alerts: [],
    activeFilter: 'all',
    searchQuery: '',
    selectedPatientId: null,
    selectedPatientData: null,
    simulatorStatus: { isRunning: true, intervalMs: 4000 },
    ecgAnimationId: null,
    ecgPhase: 0,
    audioMuted: false,
    currentTheme: localStorage.getItem('icu_theme') || 'dark'
  };

  // DOM Elements Cache
  const UI = {
    app: document.getElementById('app'),
    mainNav: document.getElementById('main-nav'),
    headerBrandLink: document.getElementById('header-brand-link'),
    navLanding: document.getElementById('nav-landing'),
    navDashboard: document.getElementById('nav-dashboard'),
    navAlerts: document.getElementById('nav-alerts'),
    navAdmin: document.getElementById('nav-admin'),
    navFamily: document.getElementById('nav-family'),
    headerAlertCount: document.getElementById('header-alert-count'),
    userProfileBadge: document.getElementById('user-profile-badge'),
    userAvatar: document.getElementById('user-avatar-initials'),
    userDisplayName: document.getElementById('user-display-name'),
    userRoleTag: document.getElementById('user-role-tag'),
    btnLogout: document.getElementById('btn-logout'),
    btnShowLogin: document.getElementById('btn-show-login'),
    btnAudioToggle: document.getElementById('btn-audio-toggle'),
    audioIcon: document.getElementById('audio-icon'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),

    // Simulator Bar
    simulatorBar: document.getElementById('simulator-bar'),
    btnSimToggle: document.getElementById('btn-sim-toggle'),
    simStatusIcon: document.getElementById('sim-status-icon'),
    simToggleText: document.getElementById('sim-toggle-text'),
    simSpeedSelect: document.getElementById('sim-speed-select'),
    btnTriggerDemoBreach: document.getElementById('btn-trigger-demo-breach'),

    // Loading & Views
    globalLoading: document.getElementById('global-loading'),
    viewLanding: document.getElementById('view-landing'),
    landingBtnSignin: document.getElementById('landing-btn-signin'),
    landingBtnExplore: document.getElementById('landing-btn-explore'),
    landingBtnBottomLogin: document.getElementById('landing-btn-bottom-login'),
    btnBackToLanding: document.getElementById('btn-back-to-landing'),
    viewLogin: document.getElementById('view-login'),
    viewDashboard: document.getElementById('view-dashboard'),
    viewAlerts: document.getElementById('view-alerts'),
    viewFamily: document.getElementById('view-family'),
    viewAdmin: document.getElementById('view-admin'),

    // Dashboard
    telemetryBedsContainer: document.getElementById('telemetry-beds-container'),
    dashSearchInput: document.getElementById('dash-search-input'),
    chipAssignedFilter: document.getElementById('chip-assigned-filter'),
    statTotalBeds: document.getElementById('stat-total-beds'),
    statCriticalCount: document.getElementById('stat-critical-count'),

    // Alerts
    alertsTableBody: document.getElementById('alerts-table-body'),
    alertsEmptyState: document.getElementById('alerts-empty-state'),
    countTabActive: document.getElementById('count-tab-active'),
    countTabAck: document.getElementById('count-tab-ack'),

    // Family
    familyContainer: document.getElementById('family-container'),

    // Modals
    patientModal: document.getElementById('patient-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    ecgCanvas: document.getElementById('ecg-canvas'),
    historyChartCanvas: document.getElementById('history-chart-canvas'),
    modalVitalsRow: document.getElementById('modal-vitals-row'),
    formAddClinicalNote: document.getElementById('form-add-clinical-note'),
    modalNotesTimeline: document.getElementById('modal-notes-timeline'),
    modalThresholdsDisplay: document.getElementById('modal-thresholds-display'),

    // Acknowledge Modal
    ackModal: document.getElementById('ack-modal'),
    btnCloseAckModal: document.getElementById('btn-close-ack-modal'),
    btnCancelAck: document.getElementById('btn-cancel-ack'),
    btnConfirmAck: document.getElementById('btn-confirm-ack'),
    ackAlertDesc: document.getElementById('ack-alert-desc'),
    ackNotesInput: document.getElementById('ack-notes-input'),

    // Admin Modals & Panels
    addUserModal: document.getElementById('add-user-modal'),
    admitPatientModal: document.getElementById('admit-patient-modal'),
    assignStaffModal: document.getElementById('assign-staff-modal'),
    linkFamilyModal: document.getElementById('link-family-modal')
  };

  let pendingAckAlertId = null;

  // Initialize
  async function init() {
    setupTheme();
    setupEventListeners();
    setupAudioState();
    loadSession();

    // Render all SVG icons in document
    if (window.renderIcons) {
      window.renderIcons();
    }

    // Connect SSE Stream
    TelemetryStream.connect();
    TelemetryStream.on('vital_tick', handleVitalTick);
    TelemetryStream.on('simulator_state', handleSimulatorStateChange);

    // Initial Data Sync
    await syncSimulatorStatus();
    await checkInitialView();
  }

  function setupTheme() {
    const saved = localStorage.getItem('icu_theme') || 'dark';
    AppState.currentTheme = saved;
    applyTheme(saved);
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      if (UI.themeIcon) UI.themeIcon.innerHTML = window.getIconSvg('sun', 'icon-sm');
      if (UI.btnThemeToggle) UI.btnThemeToggle.title = 'Light Mode Active (Click for Dark Mode)';
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      if (UI.themeIcon) UI.themeIcon.innerHTML = window.getIconSvg('moon', 'icon-sm');
      if (UI.btnThemeToggle) UI.btnThemeToggle.title = 'Dark Mode Active (Click for Light Mode)';
    }
  }

  function toggleTheme() {
    const nextTheme = AppState.currentTheme === 'light' ? 'dark' : 'light';
    AppState.currentTheme = nextTheme;
    localStorage.setItem('icu_theme', nextTheme);
    applyTheme(nextTheme);

    // Redraw canvases with new light/dark background
    if (AppState.patients.length > 0) {
      AppState.patients.forEach(p => drawMiniEcg(p.bed_no, p.heart_rate || 75));
    }
    if (AppState.selectedPatientId) {
      renderTrendsChart(AppState.selectedPatientId);
    }
  }

  function setupAudioState() {
    AppState.audioMuted = TelemetryAudio.isMuted;
    if (UI.audioIcon) {
      UI.audioIcon.innerHTML = window.getIconSvg(AppState.audioMuted ? 'bell-off' : 'bell', 'icon-sm');
    }
    UI.btnAudioToggle.title = AppState.audioMuted ? 'Alarms Muted (Click to Unmute)' : 'Alarms Active (Click to Mute)';
  }

  function loadSession() {
    const user = API.getUser();
    const token = API.getToken();
    if (token && user) {
      AppState.currentUser = user;
      updateUserUI();
    } else {
      AppState.currentUser = null;
      updateUserUI();
    }
  }

  function updateUserUI() {
    if (AppState.currentUser) {
      UI.userProfileBadge.style.display = 'flex';
      UI.btnShowLogin.style.display = 'none';
      UI.userDisplayName.textContent = AppState.currentUser.fullName || AppState.currentUser.username;
      UI.userRoleTag.textContent = AppState.currentUser.role;
      UI.userAvatar.textContent = (AppState.currentUser.username || 'U').substring(0, 2).toUpperCase();

      // Show/hide role-specific nav tabs
      const role = AppState.currentUser.role;
      if (UI.navLanding) UI.navLanding.style.display = 'flex';
      UI.navAdmin.style.display = role === 'admin' ? 'flex' : 'none';
      UI.navFamily.style.display = role === 'family' ? 'flex' : 'none';
      UI.navDashboard.style.display = role === 'family' ? 'none' : 'flex';
      UI.navAlerts.style.display = role === 'family' ? 'none' : 'flex';
      UI.chipAssignedFilter.style.display = role === 'staff' ? 'inline-block' : 'none';

      // Simulator bar display:
      if (UI.simulatorBar) {
        UI.simulatorBar.style.display = (role === 'family' || AppState.currentView === 'landing' || AppState.currentView === 'login') ? 'none' : 'flex';
      }

      // Update Landing hero CTA button text when logged in
      const heroBtn = document.getElementById('landing-btn-signin');
      const bottomCtaBtn = document.getElementById('landing-btn-bottom-login');
      const ctaText = role === 'family' 
        ? `Go to Family Sharing Portal ${window.getIconSvg('arrow-right', 'icon-sm')}`
        : `Go to Telemetry Dashboard ${window.getIconSvg('arrow-right', 'icon-sm')}`;
      if (heroBtn) heroBtn.innerHTML = ctaText;
      if (bottomCtaBtn) bottomCtaBtn.innerHTML = ctaText;
    } else {
      UI.userProfileBadge.style.display = 'none';
      UI.btnShowLogin.style.display = 'block';
      if (UI.navLanding) UI.navLanding.style.display = 'flex';
      UI.navAdmin.style.display = 'none';
      UI.navFamily.style.display = 'none';
      UI.navDashboard.style.display = 'none';
      UI.navAlerts.style.display = 'none';
      UI.chipAssignedFilter.style.display = 'none';

      if (UI.simulatorBar) {
        UI.simulatorBar.style.display = 'none';
      }

      const heroBtn = document.getElementById('landing-btn-signin');
      const bottomCtaBtn = document.getElementById('landing-btn-bottom-login');
      const defaultCta = `Sign In to Vitalis ICU ${window.getIconSvg('arrow-right', 'icon-sm')}`;
      if (heroBtn) heroBtn.innerHTML = defaultCta;
      if (bottomCtaBtn) bottomCtaBtn.innerHTML = defaultCta;
    }
  }

  async function checkInitialView() {
    // Always start on Landing Page so the user can explore the platform
    switchView('landing');
  }

  // View Switching Router with strict role gating
  function switchView(viewName) {
    // Role protection & redirection
    if (!AppState.currentUser) {
      if (viewName !== 'landing' && viewName !== 'login') {
        viewName = 'landing';
      }
    } else {
      const role = AppState.currentUser.role;
      if (role === 'family') {
        // Family cannot view raw dashboard, alerts, or admin
        if (viewName === 'dashboard' || viewName === 'alerts' || viewName === 'admin') {
          viewName = 'family';
        }
      } else if (role === 'staff') {
        // Staff cannot view admin or family portal
        if (viewName === 'admin' || viewName === 'family') {
          viewName = 'dashboard';
        }
      }
    }

    AppState.currentView = viewName;

    // Update nav tabs active state
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    // Hide all view panels
    if (UI.viewLanding) UI.viewLanding.style.display = 'none';
    UI.viewLogin.style.display = 'none';
    UI.viewDashboard.style.display = 'none';
    UI.viewAlerts.style.display = 'none';
    UI.viewFamily.style.display = 'none';
    UI.viewAdmin.style.display = 'none';

    // Simulator bar visibility
    if (UI.simulatorBar) {
      if (!AppState.currentUser || (AppState.currentUser && AppState.currentUser.role === 'family') || viewName === 'landing' || viewName === 'login') {
        UI.simulatorBar.style.display = 'none';
      } else {
        UI.simulatorBar.style.display = 'flex';
      }
    }

    // Show target view panel
    switch (viewName) {
      case 'landing':
        if (UI.viewLanding) UI.viewLanding.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'login':
        UI.viewLogin.style.display = 'block';
        loadDemoAccounts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'dashboard':
        UI.viewDashboard.style.display = 'block';
        refreshPatients();
        break;
      case 'alerts':
        UI.viewAlerts.style.display = 'block';
        refreshAlerts();
        break;
      case 'family':
        UI.viewFamily.style.display = 'block';
        loadFamilyPortal();
        break;
      case 'admin':
        UI.viewAdmin.style.display = 'block';
        loadAdminPanel('users');
        break;
      case 'benefits':
        if (UI.viewLanding) UI.viewLanding.style.display = 'block';
        const advSection = document.getElementById('landing-advantages-section');
        if (advSection) advSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
    }
  }

  // =========================================================================
  // Telemetry Dashboard
  // =========================================================================
  async function refreshPatients() {
    if (!AppState.currentUser || AppState.currentUser.role === 'family') {
      return;
    }
    try {
      const data = await API.getPatients();
      AppState.patients = data.patients || [];
      renderTelemetryGrid();
      updateDashboardStats();
    } catch (err) {
      console.error('Failed to load patients:', err);
    }
  }

  function updateDashboardStats() {
    UI.statTotalBeds.textContent = AppState.patients.length;
    const criticalCount = AppState.patients.filter(p => p.active_alerts_count > 0 || p.condition_status === 'critical').length;
    UI.statCriticalCount.textContent = criticalCount;

    // Calculate Apple Health Highlights averages
    if (AppState.patients.length > 0) {
      const validHrs = AppState.patients.filter(p => p.heart_rate).map(p => p.heart_rate);
      const avgHr = validHrs.length ? Math.round(validHrs.reduce((a, b) => a + b, 0) / validHrs.length) : 74;

      const validBps = AppState.patients.filter(p => p.blood_pressure_sys).map(p => ({ sys: p.blood_pressure_sys, dia: p.blood_pressure_dia }));
      const avgSys = validBps.length ? Math.round(validBps.reduce((a, b) => a + b.sys, 0) / validBps.length) : 120;
      const avgDia = validBps.length ? Math.round(validBps.reduce((a, b) => a + b.dia, 0) / validBps.length) : 78;

      const validSpo2 = AppState.patients.filter(p => p.spo2).map(p => p.spo2);
      const avgSpo2 = validSpo2.length ? Math.round(validSpo2.reduce((a, b) => a + b, 0) / validSpo2.length) : 97;

      const inRangeCount = AppState.patients.length - criticalCount;

      const elHr = document.getElementById('hl-hr-avg');
      const elBp = document.getElementById('hl-bp-avg');
      const elSpo2 = document.getElementById('hl-spo2-avg');
      const elStatus = document.getElementById('hl-status-count');

      if (elHr) elHr.textContent = avgHr;
      if (elBp) elBp.textContent = `${avgSys}/${avgDia}`;
      if (elSpo2) elSpo2.textContent = `${avgSpo2}%`;
      if (elStatus) elStatus.textContent = `${inRangeCount} In Safe Range`;
    }
  }

  function renderTelemetryGrid() {
    const container = UI.telemetryBedsContainer;
    container.innerHTML = '';

    // Apply Filter & Search
    let filtered = AppState.patients.filter(p => {
      if (AppState.activeFilter === 'assigned' && !p.is_assigned) return false;
      if (AppState.activeFilter === 'critical' && p.active_alerts_count === 0 && p.condition_status !== 'critical') return false;

      if (AppState.searchQuery) {
        const q = AppState.searchQuery.toLowerCase();
        const matchesName = `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
        const matchesBed = String(p.bed_no).includes(q);
        const matchesDiag = (p.diagnosis || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBed && !matchesDiag) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <div class="empty-icon">${window.getIconSvg('search', '', 36)}</div>
          <h3>No Beds Matching Filter</h3>
          <p>Try clearing your search query or selecting 'All Beds'.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(p => {
      const hasCriticalAlert = p.active_alerts_count > 0;
      const card = document.createElement('div');
      card.className = `bed-card ${hasCriticalAlert ? 'has-critical-alert' : ''}`;
      card.id = `card-bed-${p.bed_no}`;

      const conditionClass = `condition-${p.condition_status || 'serious'}`;
      const isUnlucky = p.simulation_profile === 'critical_demo';

      card.innerHTML = `
        <div class="bed-card-header">
          <div class="bed-badge-wrap">
            <span class="bed-number-pill">BED ${p.bed_no}</span>
            <span class="bed-patient-name" title="${p.first_name} ${p.last_name}">${p.first_name} ${p.last_name}</span>
          </div>
          <span class="bed-condition-badge ${conditionClass}">
            <span class="stat-dot ${p.condition_status === 'critical' ? 'red' : 'green'}"></span>
            ${p.condition_status}
          </span>
        </div>

        <div class="bed-diagnosis-bar">
          ${isUnlucky ? `<span class="badge-unlucky">${window.getIconSvg('alert-triangle', 'icon-xs', 13)} EXCURSIONS ACTIVE</span>` : ''}${p.diagnosis}
        </div>

        <div class="card-mini-ecg-wrap">
          <canvas class="card-mini-ecg-canvas" id="mini-ecg-${p.bed_no}" width="300" height="44"></canvas>
        </div>

        <div class="telemetry-values">
          <div class="vital-metric ${p.heart_rate && (p.heart_rate < p.hr_min || p.heart_rate > p.hr_max) ? 'abnormal' : ''}">
            <div class="vital-metric-label">
              <div class="vital-label-group">
                <span class="vital-glyph heart" style="color:var(--health-heart);">${window.getIconSvg('heart', 'icon-sm', 14)}</span>
                <span class="vital-name">Heart Rate</span>
              </div>
              <span class="vital-range">${p.hr_min || 55}-${p.hr_max || 105}</span>
            </div>
            <div class="vital-metric-value val-hr" id="val-hr-${p.id}">${p.heart_rate || '--'}<span class="vital-metric-unit">bpm</span></div>
          </div>

          <div class="vital-metric ${p.blood_pressure_sys && (p.blood_pressure_sys < p.bp_sys_min || p.blood_pressure_sys > p.bp_sys_max) ? 'abnormal' : ''}">
            <div class="vital-metric-label">
              <div class="vital-label-group">
                <span class="vital-glyph bp" style="color:var(--health-bp);">${window.getIconSvg('activity', 'icon-sm', 14)}</span>
                <span class="vital-name">Blood Pressure</span>
              </div>
              <span class="vital-range">${p.bp_sys_min || 90}-${p.bp_sys_max || 140}</span>
            </div>
            <div class="vital-metric-value val-bp" id="val-bp-${p.id}">
              ${p.blood_pressure_sys || '--'}/${p.blood_pressure_dia || '--'}<span class="vital-metric-unit">mmHg</span>
            </div>
          </div>

          <div class="vital-metric ${p.spo2 && p.spo2 < (p.spo2_min || 92) ? 'abnormal' : ''}">
            <div class="vital-metric-label">
              <div class="vital-label-group">
                <span class="vital-glyph oxygen" style="color:var(--health-oxygen);">${window.getIconSvg('droplet', 'icon-sm', 14)}</span>
                <span class="vital-name">Oxygen (SpO2)</span>
              </div>
              <span class="vital-range">&gt; ${p.spo2_min || 92}%</span>
            </div>
            <div class="vital-metric-value val-spo2" id="val-spo2-${p.id}">${p.spo2 || '--'}%</div>
          </div>

          <div class="vital-metric">
            <div class="vital-metric-label">
              <div class="vital-label-group">
                <span class="vital-glyph resp" style="color:var(--health-respiration);">${window.getIconSvg('wind', 'icon-sm', 14)}</span>
                <span class="vital-name">Respiration</span>
              </div>
              <span class="vital-range">${p.resp_rate_min || 12}-${p.resp_rate_max || 22}</span>
            </div>
            <div class="vital-metric-value val-resp" id="val-resp-${p.id}">${p.respiration_rate || '--'}<span class="vital-metric-unit">bpm</span></div>
          </div>
        </div>

        ${hasCriticalAlert ? `
          <div class="bed-alert-ribbon">
            <span>${window.getIconSvg('alert-triangle', 'icon-xs', 14)} THRESHOLD EXCURSION ACTIVE</span>
            <span class="text-xs">${p.active_alerts_count} Active</span>
          </div>
        ` : ''}

        <div class="bed-card-footer">
          <span class="bed-footer-meta">${p.attending_physician || 'ICU Care Team'}</span>
          <button class="btn-inspect" data-patient-id="${p.id}">Details ›</button>
        </div>
      `;

      card.querySelector('.btn-inspect').addEventListener('click', () => openPatientModal(p.id));
      container.appendChild(card);

      // Draw mini ECG rhythm line on canvas with Apple Health Coral
      drawMiniEcg(p.bed_no, p.heart_rate || 75);
    });
  }

  function drawMiniEcg(bedNo, heartRate) {
    const canvas = document.getElementById(`mini-ecg-${bedNo}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    // Apple Health coral line
    ctx.strokeStyle = '#ff2d55';
    ctx.lineWidth = 1.75;
    ctx.beginPath();

    const midY = h / 2;
    const period = Math.max(30, Math.floor(1800 / heartRate));

    for (let x = 0; x < w; x++) {
      const cyclePos = x % period;
      let y = midY;

      // Draw P-Q-R-S-T wave pattern
      if (cyclePos === 10) y = midY - 3; // P wave
      else if (cyclePos === 15) y = midY + 4; // Q wave
      else if (cyclePos === 18) y = midY - 16; // R wave (sharp peak)
      else if (cyclePos === 21) y = midY + 8; // S wave
      else if (cyclePos === 28) y = midY - 5; // T wave

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // =========================================================================
  // Real-time SSE Handler
  // =========================================================================
  function handleVitalTick(tickData) {
    if (!tickData || !tickData.updates) return;

    tickData.updates.forEach(u => {
      const p = AppState.patients.find(pt => pt.id === u.patientId);
      if (p) {
        p.heart_rate = u.vitals.heart_rate;
        p.blood_pressure_sys = u.vitals.blood_pressure_sys;
        p.blood_pressure_dia = u.vitals.blood_pressure_dia;
        p.spo2 = u.vitals.spo2;
        p.respiration_rate = u.vitals.respiration_rate;
        p.temperature = u.vitals.temperature;

        // Update DOM element directly if visible on screen for super smooth 60fps feel
        const elHr = document.getElementById(`val-hr-${p.id}`);
        const elBp = document.getElementById(`val-bp-${p.id}`);
        const elSpo2 = document.getElementById(`val-spo2-${p.id}`);
        const elResp = document.getElementById(`val-resp-${p.id}`);

        if (elHr) elHr.textContent = u.vitals.heart_rate;
        if (elBp) elBp.textContent = `${u.vitals.blood_pressure_sys}/${u.vitals.blood_pressure_dia}`;
        if (elSpo2) elSpo2.textContent = `${u.vitals.spo2}%`;
        if (elResp) elResp.textContent = u.vitals.respiration_rate;
      }

      // If this is the patient currently inspected in the modal, update modal fields
      if (AppState.selectedPatientId === u.patientId) {
        updateModalLiveVitals(u.vitals);
      }
    });

    // Check for critical alerts to play alarm sound (only for authenticated staff / admin)
    if (tickData.newAlerts && tickData.newAlerts.length > 0) {
      if (AppState.currentUser && (AppState.currentUser.role === 'staff' || AppState.currentUser.role === 'admin')) {
        const hasCritical = tickData.newAlerts.some(a => a.severity === 'critical');
        if (hasCritical) {
          TelemetryAudio.playCriticalAlarm();
        } else {
          TelemetryAudio.playWarningChime();
        }
        refreshAlerts();
      }
    }
  }

  function handleSimulatorStateChange(state) {
    AppState.simulatorStatus.isRunning = state.isRunning;
    if (state.intervalMs) AppState.simulatorStatus.intervalMs = state.intervalMs;

    if (UI.simStatusIcon) UI.simStatusIcon.innerHTML = window.getIconSvg(state.isRunning ? 'pause' : 'play', 'icon-xs', 14);
    UI.simToggleText.textContent = state.isRunning ? 'Pause Simulation' : 'Resume Simulation';
  }

  async function syncSimulatorStatus() {
    try {
      const status = await API.getSimulatorStatus();
      AppState.simulatorStatus.isRunning = status.isRunning;
      AppState.simulatorStatus.intervalMs = status.intervalMs;
      if (UI.simStatusIcon) UI.simStatusIcon.innerHTML = window.getIconSvg(status.isRunning ? 'pause' : 'play', 'icon-xs', 14);
      UI.simToggleText.textContent = status.isRunning ? 'Pause Simulation' : 'Resume Simulation';
      UI.simSpeedSelect.value = String(status.intervalMs);
    } catch (e) {}
  }

  // =========================================================================
  // Patient Modal (Detailed Telemetry, Trends, & Notes)
  // =========================================================================
  async function openPatientModal(patientId) {
    AppState.selectedPatientId = patientId;
    UI.patientModal.style.display = 'flex';

    try {
      const data = await API.getPatient(patientId);
      AppState.selectedPatientData = data;
      const p = data.patient;

      document.getElementById('modal-bed-badge').textContent = `BED ${p.bed_no}`;
      document.getElementById('modal-patient-name').textContent = `${p.first_name} ${p.last_name}`;
      document.getElementById('modal-patient-sub').textContent = `ID: ${p.id} • Age ${p.age} • ${p.gender} • Admitted: ${new Date(p.admission_date).toLocaleDateString()}`;

      if (data.latestVital) {
        updateModalLiveVitals(data.latestVital);
      }

      // Render Thresholds Info Tab
      renderModalThresholds(p);

      // Load Clinical Notes Tab
      loadClinicalNotes(patientId);

      // Start Animated ECG Canvas
      startEcgAnimation();

      // Render Trends Chart
      renderTrendsChart(patientId);
    } catch (err) {
      console.error('Failed to load patient chart:', err);
    }
  }

  function closePatientModal() {
    UI.patientModal.style.display = 'none';
    AppState.selectedPatientId = null;
    if (AppState.ecgAnimationId) {
      cancelAnimationFrame(AppState.ecgAnimationId);
      AppState.ecgAnimationId = null;
    }
  }

  function updateModalLiveVitals(vitals) {
    const row = UI.modalVitalsRow;
    row.innerHTML = `
      <div class="m-vital-box">
        <div class="m-vital-label">Heart Rate</div>
        <div class="m-vital-val val-hr">${vitals.heart_rate} <span class="vital-metric-unit">bpm</span></div>
      </div>
      <div class="m-vital-box">
        <div class="m-vital-label">Blood Pressure</div>
        <div class="m-vital-val val-bp">${vitals.blood_pressure_sys}/${vitals.blood_pressure_dia} <span class="vital-metric-unit">mmHg</span></div>
      </div>
      <div class="m-vital-box">
        <div class="m-vital-label">SpO2 Oxygen</div>
        <div class="m-vital-val val-spo2">${vitals.spo2}%</div>
      </div>
      <div class="m-vital-box">
        <div class="m-vital-label">Respiration</div>
        <div class="m-vital-val val-resp">${vitals.respiration_rate} <span class="vital-metric-unit">bpm</span></div>
      </div>
      <div class="m-vital-box">
        <div class="m-vital-label">Core Temp</div>
        <div class="m-vital-val val-temp">${Number(vitals.temperature).toFixed(1)}°C</div>
      </div>
    `;
  }

  function renderModalThresholds(p) {
    UI.modalThresholdsDisplay.innerHTML = `
      <div class="threshold-card-info p-3 bg-surface rounded">
        <h4 class="font-bold text-sm text-cyan mb-2">Physiological Safety Threshold Limits</h4>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>Heart Rate Safe Range: <strong>${p.hr_min} - ${p.hr_max} bpm</strong></div>
          <div>Systolic BP Safe Range: <strong>${p.bp_sys_min} - ${p.bp_sys_max} mmHg</strong></div>
          <div>Diastolic BP Safe Range: <strong>${p.bp_dia_min} - ${p.bp_dia_max} mmHg</strong></div>
          <div>Min Safe SpO2: <strong>${p.spo2_min}%</strong></div>
          <div>Respiration Rate Range: <strong>${p.resp_rate_min} - ${p.resp_rate_max} bpm</strong></div>
          <div>Core Temperature Range: <strong>${p.temp_min}°C - ${p.temp_max}°C</strong></div>
        </div>
      </div>
    `;
  }

  async function loadClinicalNotes(patientId) {
    try {
      const res = await API.getClinicalNotes(patientId);
      const notes = res.notes || [];
      const timeline = UI.modalNotesTimeline;
      timeline.innerHTML = '';

      if (notes.length === 0) {
        timeline.innerHTML = '<p class="text-xs text-muted">No clinical notes recorded yet.</p>';
        return;
      }

      notes.forEach(n => {
        const item = document.createElement('div');
        item.className = 'note-item';
        item.innerHTML = `
          <div class="note-meta">
            <span><strong>${n.author_name}</strong> (${n.author_role.toUpperCase()}) — <em class="text-cyan">${n.category}</em></span>
            <span>${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="note-text">${n.note_text}</div>
        `;
        timeline.appendChild(item);
      });
    } catch (e) {
      console.error(e);
    }
  }

  // Live Canvas ECG Animation (Apple Watch ECG Lead II Oscilloscope)
  function startEcgAnimation() {
    const canvas = UI.ecgCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    let sweepX = 0;

    function renderEcgFrame() {
      const isLight = AppState.currentTheme === 'light';
      // Semi-transparent sweep clearing effect
      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.14)' : 'rgba(10, 10, 12, 0.08)';
      ctx.fillRect(sweepX, 0, 14, height);

      // Apple Watch ECG graph paper millimeter grid dots
      ctx.fillStyle = isLight ? 'rgba(255, 45, 85, 0.16)' : 'rgba(255, 45, 85, 0.08)';
      for (let y = 8; y < height; y += 16) {
        ctx.fillRect(sweepX, y, 1.2, 1.2);
      }

      // ECG rhythm waveform algorithm
      const midY = height / 2;
      const phase = sweepX % 90;
      let waveY = midY;

      if (phase === 25) waveY = midY - 8; // P wave
      else if (phase === 38) waveY = midY + 10; // Q wave
      else if (phase === 44) waveY = midY - 48; // R sharp peak
      else if (phase === 50) waveY = midY + 24; // S deep dip
      else if (phase === 68) waveY = midY - 14; // T recovery wave

      // Apple Watch ECG coral line with luminous shadow
      ctx.strokeStyle = '#ff2d55';
      ctx.shadowColor = '#ff2d55';
      ctx.shadowBlur = isLight ? 2 : 5;
      ctx.lineWidth = 2.4;

      ctx.beginPath();
      ctx.moveTo(sweepX - 2, midY);
      ctx.lineTo(sweepX, waveY);
      ctx.stroke();

      sweepX = (sweepX + 2) % width;
      AppState.ecgAnimationId = requestAnimationFrame(renderEcgFrame);
    }

    ctx.fillStyle = AppState.currentTheme === 'light' ? '#ffffff' : '#0a0a0c';
    ctx.fillRect(0, 0, width, height);
    renderEcgFrame();
  }

  // Historical Multi-Line Trend Chart (Apple Health Smooth Curve Design)
  async function renderTrendsChart(patientId) {
    try {
      const data = await API.getPatientVitalsHistory(patientId, 25);
      const history = data.history || [];
      const canvas = UI.historyChartCanvas;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      const isLight = AppState.currentTheme === 'light';
      ctx.clearRect(0, 0, w, h);
      if (isLight) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }

      if (history.length < 2) {
        ctx.fillStyle = isLight ? '#6c6c70' : '#8e8e93';
        ctx.font = '14px -apple-system, sans-serif';
        ctx.fillText('Accumulating telemetry trends...', 280, 110);
        return;
      }

      // Draw Apple iOS Subdued Horizontal Separators
      ctx.strokeStyle = isLight ? 'rgba(60, 60, 67, 0.1)' : 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let y = 35; y < h - 25; y += 42) {
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(w - 20, y);
        ctx.stroke();
      }

      // Apple Health Category Legend
      ctx.font = '600 12px -apple-system, sans-serif';
      ctx.fillStyle = '#ff2d55';
      ctx.fillText('● Heart Rate (bpm)', 50, 22);
      ctx.fillStyle = '#ff9500';
      ctx.fillText('● Blood Pressure (mmHg)', 210, 22);
      ctx.fillStyle = '#00c7be';
      ctx.fillText('● Oxygen SpO2 (%)', 410, 22);

      // Plot smooth curves with gradient area fill
      const plotSmoothAreaSeries = (values, minVal, maxVal, strokeColor, fillColor) => {
        if (!values.length) return;
        const stepX = (w - 70) / (values.length - 1);
        const points = values.map((val, i) => {
          const x = 50 + i * stepX;
          const normalized = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
          const y = (h - 32) - normalized * (h - 78);
          return { x, y };
        });

        // 1. Draw soft gradient area underneath curve
        const gradient = ctx.createLinearGradient(0, 30, 0, h - 30);
        gradient.addColorStop(0, fillColor);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(points[0].x, h - 30);
        ctx.lineTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.lineTo(points[points.length - 1].x, h - 30);
        ctx.closePath();
        ctx.fill();

        // 2. Draw smooth stroke curve
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Data point circles
        points.forEach(pt => {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      const hrs = history.map(v => v.heart_rate);
      const bps = history.map(v => v.blood_pressure_sys);
      const spo2s = history.map(v => v.spo2);

      plotSmoothAreaSeries(hrs, 40, 160, '#ff2d55', 'rgba(255, 45, 85, 0.15)');
      plotSmoothAreaSeries(bps, 70, 200, '#ff9500', 'rgba(255, 149, 0, 0.12)');
      plotSmoothAreaSeries(spo2s, 80, 100, '#00c7be', 'rgba(0, 199, 190, 0.12)');
    } catch (e) {
      console.error(e);
    }
  }

  // =========================================================================
  // Alert Triage Center
  // =========================================================================
  async function refreshAlerts(statusFilter = 'active') {
    if (!AppState.currentUser || AppState.currentUser.role === 'family') {
      return;
    }
    try {
      const data = await API.getAlerts({ status: statusFilter === 'all' ? null : statusFilter });
      AppState.alerts = data.alerts || [];

      // Update header alert count badge
      const activeAlerts = AppState.alerts.filter(a => a.status === 'active');
      UI.headerAlertCount.textContent = activeAlerts.length;
      UI.headerAlertCount.style.display = activeAlerts.length > 0 ? 'inline-block' : 'none';

      UI.countTabActive.textContent = activeAlerts.length;
      const ackAlerts = AppState.alerts.filter(a => a.status === 'acknowledged');
      UI.countTabAck.textContent = ackAlerts.length;

      renderAlertsTable();
    } catch (err) {
      console.error('Failed to load alerts:', err);
    }
  }

  function renderAlertsTable() {
    const tbody = UI.alertsTableBody;
    tbody.innerHTML = '';

    if (AppState.alerts.length === 0) {
      UI.alertsEmptyState.style.display = 'block';
      return;
    }
    UI.alertsEmptyState.style.display = 'none';

    AppState.alerts.forEach(a => {
      const tr = document.createElement('tr');
      const sevClass = `severity-${a.severity}`;
      const statClass = `status-${a.status}`;

      tr.innerHTML = `
        <td><span class="severity-pill ${sevClass}">${a.severity}</span></td>
        <td><strong>Bed ${a.bed_no}</strong> (${a.first_name} ${a.last_name})</td>
        <td><strong>${a.parameter_name}</strong></td>
        <td><span class="font-mono font-bold">${a.reading_value}</span></td>
        <td class="text-xs text-dim">${a.threshold_breached}</td>
        <td class="text-xs text-muted">${new Date(a.triggered_at).toLocaleTimeString()}</td>
        <td><span class="status-tag ${statClass}">${a.status}</span></td>
        <td>
          ${a.status === 'active' ? `
            <button class="btn-primary-sm btn-ack" data-alert-id="${a.id}" data-desc="${a.message}">Acknowledge</button>
          ` : a.status === 'acknowledged' ? `
            <button class="btn-secondary-sm btn-resolve" data-alert-id="${a.id}">Resolve</button>
          ` : `
            <span class="text-xs text-dim">Resolved</span>
          `}
        </td>
      `;

      const btnAck = tr.querySelector('.btn-ack');
      if (btnAck) {
        btnAck.addEventListener('click', () => {
          pendingAckAlertId = a.id;
          UI.ackAlertDesc.textContent = a.message;
          UI.ackNotesInput.value = '';
          UI.ackModal.style.display = 'flex';
        });
      }

      const btnResolve = tr.querySelector('.btn-resolve');
      if (btnResolve) {
        btnResolve.addEventListener('click', async () => {
          if (confirm(`Mark alert #${a.id} (${a.parameter_name}) as Resolved?`)) {
            await API.resolveAlert(a.id, 'Resolved by bedside staff');
            await refreshAlerts();
            await refreshPatients();
          }
        });
      }

      tbody.appendChild(tr);
    });
  }

  // =========================================================================
  // Family Portal (Compassionate, Privacy-Preserving View)
  // =========================================================================
  async function loadFamilyPortal() {
    const container = UI.familyContainer;
    container.innerHTML = '<div class="loading-label">Loading linked family patient details...</div>';

    try {
      // Query patients available to this user (filtered by backend SQL)
      const res = await API.getPatients();
      const linked = res.patients || [];

      if (linked.length === 0) {
        container.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-icon">${window.getIconSvg('shield-alert', '', 40)}</div>
            <h3>No Verified Patient Linkage</h3>
            <p>Your family account is currently awaiting verification by the ICU administrative desk.</p>
          </div>
        `;
        return;
      }

      const patientId = linked[0].id;
      const summary = await API.getFamilySummary(patientId);

      container.innerHTML = `
        <div class="family-hero-card">
          <div class="family-avatar-large">${(summary.patient.fullName || 'P').substring(0, 2).toUpperCase()}</div>
          <div>
            <h2 class="family-welcome-title">Health Sharing • ${summary.patient.fullName}</h2>
            <div class="family-patient-sub">
              Connected as <strong>${summary.familyRelationship}</strong> to Bed ${summary.patient.bedNumber}
            </div>
          </div>
        </div>

        <div class="family-status-card">
          <div class="status-callout ${summary.careStatus.statusBadge}">
            <div class="status-callout-icon">${summary.careStatus.statusBadge === 'warning' ? window.getIconSvg('activity', '', 24) : window.getIconSvg('heart', '', 24)}</div>
            <div>
              <div class="status-callout-title">${summary.careStatus.telemetrySummary}</div>
              <div class="status-callout-desc">${summary.careStatus.comfortDescription}</div>
            </div>
          </div>

          <div class="family-info-grid">
            <div class="family-info-box">
              <h4>Attending Physician</h4>
              <p>${summary.patient.attendingPhysician || 'ICU Intensivist Team'}</p>
            </div>
            <div class="family-info-box">
              <h4>Continuous Telemetry Status</h4>
              <p>Active 24/7 Bedside Monitoring</p>
            </div>
            <div class="family-info-box">
              <h4>Last Clinical Check</h4>
              <p>${summary.careStatus.lastTelemetryCheck ? new Date(summary.careStatus.lastTelemetryCheck).toLocaleTimeString() : 'Recent'}</p>
            </div>
          </div>
        </div>

        <div class="family-notes-box">
          <h3 class="font-bold text-base mb-3">Care Team Messages & Updates</h3>
          <div class="notes-timeline">
            ${summary.recentUpdates && summary.recentUpdates.length > 0 ? summary.recentUpdates.map(u => `
              <div class="note-item">
                <div class="note-meta">
                  <span>${u.author_name} (${u.author_role.toUpperCase()})</span>
                  <span>${new Date(u.created_at).toLocaleDateString()} ${new Date(u.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="note-text">${u.note_text}</div>
              </div>
            `).join('') : '<p class="text-sm text-muted">No family notes entered at this time.</p>'}
          </div>
        </div>

        <div class="card-bordered p-4 rounded-lg bg-surface mb-4">
          <h4 class="font-bold text-sm text-cyan mb-2">Visiting Hours & Bedside Communication</h4>
          <p class="text-sm text-muted mb-2">${summary.visitingGuidelines.visitingHours}</p>
          <p class="text-xs text-dim">${summary.visitingGuidelines.unitGuidelines}</p>
          <div class="mt-3 text-xs text-cyan font-bold">${summary.visitingGuidelines.bedsideContact}</div>
        </div>

        <div class="text-center text-xs text-dim mt-4" style="display:flex; align-items:center; justify-content:center; gap:0.4rem;">
          ${window.getIconSvg('lock', 'icon-xs', 14)} Strict Patient Privacy Protocol: You have access solely to verified telemetry for ${summary.patient.fullName}. Other hospital beds remain securely isolated.
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-banner">Failed to load family care summary: ${err.message}</div>`;
    }
  }

  // =========================================================================
  // Admin Console
  // =========================================================================
  async function loadAdminPanel(subView) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.adminView === subView);
    });

    ['users', 'patients', 'thresholds', 'assignments', 'family-links', 'audit'].forEach(p => {
      const el = document.getElementById(`admin-panel-${p}`);
      if (el) el.style.display = p === subView ? 'block' : 'none';
    });

    switch (subView) {
      case 'users':
        await loadAdminUsers();
        break;
      case 'patients':
        await loadAdminPatients();
        break;
      case 'thresholds':
        await loadAdminThresholdsView();
        break;
      case 'assignments':
        await loadAdminAssignments();
        break;
      case 'family-links':
        await loadAdminFamilyLinks();
        break;
      case 'audit':
        await loadAdminAuditLogs();
        break;
    }
  }

  async function loadAdminUsers() {
    const res = await API.getAdminUsers();
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = '';

    res.users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${u.username}</strong></td>
        <td>${u.full_name}</td>
        <td>${u.email}</td>
        <td><span class="severity-pill severity-${u.role === 'admin' ? 'critical' : u.role === 'staff' ? 'info' : 'warning'}">${u.role}</span></td>
        <td class="text-xs">${u.title_or_relation || '--'}</td>
        <td><span class="status-tag ${u.is_active ? 'status-resolved' : 'status-active'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
        <td class="text-xs text-muted">${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn-secondary-sm btn-toggle-user" data-id="${u.id}" data-active="${u.is_active}">
            ${u.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      `;

      tr.querySelector('.btn-toggle-user').addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        const currentActive = e.target.dataset.active === '1' || e.target.dataset.active === 'true';
        await API.updateUserStatus(id, !currentActive);
        loadAdminUsers();
      });

      tbody.appendChild(tr);
    });
  }

  async function loadAdminPatients() {
    const res = await API.getPatients();
    const tbody = document.getElementById('admin-patients-tbody');
    tbody.innerHTML = '';

    res.patients.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong class="font-mono text-cyan">BED ${p.bed_no}</strong></td>
        <td>${p.id}</td>
        <td><strong>${p.first_name} ${p.last_name}</strong></td>
        <td>${p.age} / ${p.gender}</td>
        <td class="text-xs">${p.diagnosis}</td>
        <td><span class="bed-condition-badge condition-${p.condition_status}">${p.condition_status}</span></td>
        <td class="text-xs">${p.attending_physician || 'ICU Team'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadAdminThresholdsView() {
    const select = document.getElementById('select-threshold-patient');
    select.innerHTML = '';

    AppState.patients.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `Bed ${p.bed_no}: ${p.first_name} ${p.last_name}`;
      select.appendChild(opt);
    });

    select.onchange = () => loadPatientThresholdForm(select.value);
    if (AppState.patients.length > 0) {
      loadPatientThresholdForm(AppState.patients[0].id);
    }
  }

  async function loadPatientThresholdForm(patientId) {
    const container = document.getElementById('threshold-editor-container');
    const res = await API.getPatientThresholds(patientId);
    const t = res.thresholds;

    container.innerHTML = `
      <form id="form-save-thresholds" class="space-y-4">
        <h4 class="font-bold text-sm text-cyan mb-3">Adjust Physiological Alarm Limits for ${patientId}</h4>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group">
            <label>Heart Rate Safe Min (bpm)</label>
            <input type="number" id="th-hr-min" class="form-input" value="${t.hr_min}" required>
          </div>
          <div class="form-group">
            <label>Heart Rate Safe Max (bpm)</label>
            <input type="number" id="th-hr-max" class="form-input" value="${t.hr_max}" required>
          </div>
          <div class="form-group">
            <label>Systolic BP Safe Min (mmHg)</label>
            <input type="number" id="th-sys-min" class="form-input" value="${t.bp_sys_min}" required>
          </div>
          <div class="form-group">
            <label>Systolic BP Safe Max (mmHg)</label>
            <input type="number" id="th-sys-max" class="form-input" value="${t.bp_sys_max}" required>
          </div>
          <div class="form-group">
            <label>Minimum Safe SpO2 (%)</label>
            <input type="number" id="th-spo2-min" class="form-input" value="${t.spo2_min}" required>
          </div>
          <div class="form-group">
            <label>Respiration Rate Max (bpm)</label>
            <input type="number" id="th-resp-max" class="form-input" value="${t.resp_rate_max}" required>
          </div>
        </div>
        <button type="submit" class="btn-primary-sm mt-3">Save Alarm Boundaries</button>
      </form>
    `;

    document.getElementById('form-save-thresholds').onsubmit = async (e) => {
      e.preventDefault();
      await API.updatePatientThresholds(patientId, {
        hr_min: Number(document.getElementById('th-hr-min').value),
        hr_max: Number(document.getElementById('th-hr-max').value),
        bp_sys_min: Number(document.getElementById('th-sys-min').value),
        bp_sys_max: Number(document.getElementById('th-sys-max').value),
        bp_dia_min: t.bp_dia_min,
        bp_dia_max: t.bp_dia_max,
        spo2_min: Number(document.getElementById('th-spo2-min').value),
        resp_rate_min: t.resp_rate_min,
        resp_rate_max: Number(document.getElementById('th-resp-max').value),
        temp_min: t.temp_min,
        temp_max: t.temp_max
      });
      alert('Alarm boundaries successfully updated and logged in security audit.');
      await refreshPatients();
    };
  }

  async function loadAdminAssignments() {
    const res = await API.getStaffAssignments();
    const tbody = document.getElementById('admin-assignments-tbody');
    tbody.innerHTML = '';

    res.assignments.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${a.staff_name}</strong></td>
        <td>${a.staff_email}</td>
        <td><strong class="font-mono text-cyan">BED ${a.bed_no}</strong></td>
        <td>${a.patient_name}</td>
        <td><span class="status-tag status-resolved">${a.shift}</span></td>
        <td class="text-xs text-muted">${new Date(a.assigned_at).toLocaleDateString()}</td>
        <td><button class="btn-secondary-sm btn-del-assign" data-id="${a.id}">Unassign</button></td>
      `;

      tr.querySelector('.btn-del-assign').onclick = async () => {
        await API.removeStaffAssignment(a.id);
        loadAdminAssignments();
      };
      tbody.appendChild(tr);
    });
  }

  async function loadAdminFamilyLinks() {
    const res = await API.getFamilyLinks();
    const tbody = document.getElementById('admin-family-tbody');
    tbody.innerHTML = '';

    res.links.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${l.family_name}</strong></td>
        <td>${l.family_email}</td>
        <td><span class="severity-pill severity-info">${l.relationship}</span></td>
        <td><strong class="font-mono text-cyan">BED ${l.bed_no}</strong></td>
        <td>${l.patient_name}</td>
        <td class="text-xs text-muted">${new Date(l.verified_at).toLocaleDateString()}</td>
        <td><button class="btn-secondary-sm btn-del-link" data-id="${l.id}">Remove Link</button></td>
      `;

      tr.querySelector('.btn-del-link').onclick = async () => {
        await API.removeFamilyLink(l.id);
        loadAdminFamilyLinks();
      };
      tbody.appendChild(tr);
    });
  }

  async function loadAdminAuditLogs() {
    const search = document.getElementById('audit-search').value;
    const role = document.getElementById('audit-filter-role').value;
    const res = await API.getAuditLogs({ search, actorRole: role, limit: 75 });
    const tbody = document.getElementById('admin-audit-tbody');
    tbody.innerHTML = '';

    res.logs.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-xs font-mono">${new Date(l.timestamp).toLocaleTimeString()}</td>
        <td><span class="status-tag status-acknowledged">${l.event_type}</span></td>
        <td><strong>${l.actor_username}</strong></td>
        <td><span class="text-xs text-cyan uppercase font-bold">${l.actor_role}</span></td>
        <td class="text-xs">${l.target_entity}</td>
        <td class="text-xs">${l.action_summary}</td>
        <td class="text-xs font-mono text-dim">${l.ip_address || '127.0.0.1'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // =========================================================================
  // Login & 1-Click Demo Accounts
  // =========================================================================
  async function loadDemoAccounts() {
    const container = document.getElementById('demo-accounts-buttons');
    if (!container) return;

    try {
      const res = await API.getDemoAccounts();
      container.innerHTML = '';

      res.accounts.forEach(acc => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-demo-account';
        const roleIcon = acc.role === 'admin' ? 'settings' : acc.role === 'family' ? 'heart-handshake' : 'activity';
        btn.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <div style="color:var(--text-muted); display:flex; align-items:center;">${window.getIconSvg(roleIcon, 'icon-sm', 16)}</div>
            <div>
              <div class="demo-btn-label">${acc.roleLabel}</div>
              <div class="text-xs text-dim">${acc.email}</div>
            </div>
          </div>
          <span class="demo-btn-role">${acc.role}</span>
        `;

        btn.addEventListener('click', async () => {
          document.getElementById('login-identifier').value = acc.email;
          document.getElementById('login-password').value = acc.password;
          await submitLogin(acc.email, acc.password);
        });

        container.appendChild(btn);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function submitLogin(identifier, password) {
    const errorBox = document.getElementById('login-error-msg');
    errorBox.style.display = 'none';

    try {
      const res = await API.login(identifier, password);
      API.setToken(res.token);
      API.setUser(res.user);
      AppState.currentUser = res.user;

      updateUserUI();
      // Reconnect SSE with new token
      TelemetryStream.connect();

      if (res.user.role === 'family') {
        switchView('family');
      } else {
        switchView('dashboard');
      }
    } catch (err) {
      errorBox.textContent = err.message || 'Login failed.';
      errorBox.style.display = 'block';
    }
  }

  // =========================================================================
  // Event Listeners Setup
  // =========================================================================
  function setupEventListeners() {
    // Branding Logo click -> Go home / dashboard
    if (UI.headerBrandLink) {
      UI.headerBrandLink.addEventListener('click', () => {
        if (!AppState.currentUser) {
          switchView('landing');
        } else if (AppState.currentUser.role === 'family') {
          switchView('family');
        } else {
          switchView('dashboard');
        }
      });
    }

    // Landing Page CTAs
    if (UI.landingBtnSignin) {
      UI.landingBtnSignin.addEventListener('click', () => {
        if (!AppState.currentUser) {
          switchView('login');
        } else if (AppState.currentUser.role === 'family') {
          switchView('family');
        } else {
          switchView('dashboard');
        }
      });
    }
    if (UI.landingBtnExplore) {
      UI.landingBtnExplore.addEventListener('click', () => {
        const advSection = document.getElementById('landing-advantages-section');
        if (advSection) {
          advSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    if (UI.landingBtnBottomLogin) {
      UI.landingBtnBottomLogin.addEventListener('click', () => {
        if (!AppState.currentUser) {
          switchView('login');
        } else if (AppState.currentUser.role === 'family') {
          switchView('family');
        } else {
          switchView('dashboard');
        }
      });
    }
    if (UI.btnBackToLanding) {
      UI.btnBackToLanding.addEventListener('click', () => switchView('landing'));
    }

    // Role-specific CTAs on landing page
    document.querySelectorAll('.btn-role-cta').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetRole = btn.dataset.targetRole;
        switchView('login');
        const roleTab = document.querySelector(`.role-tab-btn[data-role="${targetRole}"]`);
        if (roleTab) {
          roleTab.click();
        }
      });
    });

    // Nav tabs
    UI.mainNav.addEventListener('click', (e) => {
      const tab = e.target.closest('.nav-tab');
      if (tab) {
        switchView(tab.dataset.view);
      }
    });

    // Theme Mode Toggle (Apple Health Light / Dark)
    if (UI.btnThemeToggle) {
      UI.btnThemeToggle.addEventListener('click', toggleTheme);
    }

    // Audio Alarm Toggle
    UI.btnAudioToggle.addEventListener('click', () => {
      AppState.audioMuted = TelemetryAudio.toggleMute();
      setupAudioState();
    });

    // Session sign in / out
    UI.btnLogout.addEventListener('click', async () => {
      try { await API.logout(); } catch (e) {}
      API.clearSession();
      AppState.currentUser = null;
      updateUserUI();
      switchView('landing');
    });

    UI.btnShowLogin.addEventListener('click', () => switchView('login'));

    // Login Form Submit
    document.getElementById('form-login').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('login-identifier').value;
      const pw = document.getElementById('login-password').value;
      submitLogin(id, pw);
    });

    // Role Tab filter in login card
    document.querySelectorAll('.role-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.role-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const role = btn.dataset.role;
        if (role === 'admin') document.getElementById('login-identifier').value = 'admin@hospital.icu';
        else if (role === 'family') document.getElementById('login-identifier').value = 'family.sharma@hospital.icu';
        else document.getElementById('login-identifier').value = 'nurse.kavitha@hospital.icu';
        document.getElementById('login-password').value = role === 'admin' ? 'AdminPass123!' : role === 'family' ? 'FamilyPass123!' : 'StaffPass123!';
      });
    });

    // Simulator Controls
    UI.btnSimToggle.addEventListener('click', async () => {
      if (AppState.simulatorStatus.isRunning) {
        await API.stopSimulator();
      } else {
        await API.startSimulator();
      }
    });

    UI.simSpeedSelect.addEventListener('change', async (e) => {
      await API.setSimulatorInterval(Number(e.target.value));
    });

    UI.btnTriggerDemoBreach.addEventListener('click', async () => {
      try {
        await API.triggerDemoBreach('PAT-115', 'blood_pressure_sys');
        TelemetryAudio.playCriticalAlarm();
        await refreshPatients();
        await refreshAlerts();
      } catch (e) {
        alert('Could not trigger breach: ' + e.message);
      }
    });

    // Dashboard Search & Filters
    UI.dashSearchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      renderTelemetryGrid();
    });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        AppState.activeFilter = chip.dataset.filter;
        renderTelemetryGrid();
      });
    });

    // Alert Status Tabs
    document.querySelectorAll('.alert-tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.alert-tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        refreshAlerts(tab.dataset.status);
      });
    });

    // Modal Close
    UI.btnCloseModal.addEventListener('click', closePatientModal);
    UI.patientModal.addEventListener('click', (e) => {
      if (e.target === UI.patientModal) closePatientModal();
    });

    // Modal Tabs (History / Notes / Thresholds)
    document.querySelectorAll('.m-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById('modal-tab-history').style.display = target === 'history' ? 'block' : 'none';
        document.getElementById('modal-tab-notes').style.display = target === 'notes' ? 'block' : 'none';
        document.getElementById('modal-tab-thresholds').style.display = target === 'thresholds' ? 'block' : 'none';
      });
    });

    // Add Clinical Note Form
    UI.formAddClinicalNote.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('note-text-input').value;
      const cat = document.getElementById('note-category-select').value;
      if (!AppState.selectedPatientId || !text) return;

      await API.addClinicalNote(AppState.selectedPatientId, text, cat);
      document.getElementById('note-text-input').value = '';
      loadClinicalNotes(AppState.selectedPatientId);
    });

    // Acknowledge Modal Handlers
    UI.btnCloseAckModal.addEventListener('click', () => UI.ackModal.style.display = 'none');
    UI.btnCancelAck.addEventListener('click', () => UI.ackModal.style.display = 'none');
    UI.btnConfirmAck.addEventListener('click', async () => {
      if (!pendingAckAlertId) return;
      const notes = UI.ackNotesInput.value;
      await API.acknowledgeAlert(pendingAckAlertId, notes);
      UI.ackModal.style.display = 'none';
      pendingAckAlertId = null;
      await refreshAlerts();
      await refreshPatients();
    });

    // Admin Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => loadAdminPanel(btn.dataset.adminView));
    });

    document.getElementById('btn-refresh-audit').addEventListener('click', loadAdminAuditLogs);
    document.getElementById('audit-search').addEventListener('input', loadAdminAuditLogs);
    document.getElementById('audit-filter-role').addEventListener('change', loadAdminAuditLogs);

    // Admin Action Buttons
    document.getElementById('btn-open-add-user').onclick = () => UI.addUserModal.style.display = 'flex';
    document.getElementById('btn-close-user-modal').onclick = () => UI.addUserModal.style.display = 'none';
    document.getElementById('btn-cancel-user').onclick = () => UI.addUserModal.style.display = 'none';

    document.getElementById('form-create-user').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await API.createAdminUser({
          fullName: document.getElementById('new-user-fullname').value,
          username: document.getElementById('new-user-username').value,
          email: document.getElementById('new-user-email').value,
          role: document.getElementById('new-user-role').value,
          password: document.getElementById('new-user-password').value,
          titleOrRelation: document.getElementById('new-user-title').value
        });
        UI.addUserModal.style.display = 'none';
        loadAdminUsers();
      } catch (err) {
        alert(err.message);
      }
    };

    document.getElementById('btn-open-admit-patient').onclick = () => UI.admitPatientModal.style.display = 'flex';
    document.getElementById('btn-close-admit-modal').onclick = () => UI.admitPatientModal.style.display = 'none';
    document.getElementById('btn-cancel-admit').onclick = () => UI.admitPatientModal.style.display = 'none';

    document.getElementById('form-admit-patient').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await API.admitPatient({
          firstName: document.getElementById('admit-first-name').value,
          lastName: document.getElementById('admit-last-name').value,
          bedNo: Number(document.getElementById('admit-bed-no').value),
          age: Number(document.getElementById('admit-age').value),
          gender: document.getElementById('admit-gender').value,
          diagnosis: document.getElementById('admit-diagnosis').value,
          attendingPhysician: document.getElementById('admit-physician').value,
          conditionStatus: document.getElementById('admit-condition').value,
          simulationProfile: document.getElementById('admit-profile').value
        });
        UI.admitPatientModal.style.display = 'none';
        await refreshPatients();
        loadAdminPatients();
      } catch (err) {
        alert(err.message);
      }
    };

    // Staff Assign Modal
    document.getElementById('btn-open-assign-staff').onclick = async () => {
      const usersRes = await API.getAdminUsers();
      const staffUsers = usersRes.users.filter(u => u.role === 'staff');
      const staffSelect = document.getElementById('assign-select-staff');
      staffSelect.innerHTML = staffUsers.map(u => `<option value="${u.id}">${u.full_name} (${u.username})</option>`).join('');

      const patSelect = document.getElementById('assign-select-patient');
      patSelect.innerHTML = AppState.patients.map(p => `<option value="${p.id}">Bed ${p.bed_no} - ${p.first_name} ${p.last_name}</option>`).join('');

      UI.assignStaffModal.style.display = 'flex';
    };
    document.getElementById('btn-close-assign-modal').onclick = () => UI.assignStaffModal.style.display = 'none';
    document.getElementById('btn-cancel-assign').onclick = () => UI.assignStaffModal.style.display = 'none';

    document.getElementById('form-assign-staff').onsubmit = async (e) => {
      e.preventDefault();
      const staffId = document.getElementById('assign-select-staff').value;
      const patientId = document.getElementById('assign-select-patient').value;
      const shift = document.getElementById('assign-select-shift').value;
      await API.assignStaff(staffId, patientId, shift);
      UI.assignStaffModal.style.display = 'none';
      loadAdminAssignments();
    };

    // Family Link Modal
    document.getElementById('btn-open-link-family').onclick = async () => {
      const usersRes = await API.getAdminUsers();
      const famUsers = usersRes.users.filter(u => u.role === 'family');
      const famSelect = document.getElementById('link-select-user');
      famSelect.innerHTML = famUsers.map(u => `<option value="${u.id}">${u.full_name} (${u.username})</option>`).join('');

      const patSelect = document.getElementById('link-select-patient');
      patSelect.innerHTML = AppState.patients.map(p => `<option value="${p.id}">Bed ${p.bed_no} - ${p.first_name} ${p.last_name}</option>`).join('');

      UI.linkFamilyModal.style.display = 'flex';
    };
    document.getElementById('btn-close-link-modal').onclick = () => UI.linkFamilyModal.style.display = 'none';
    document.getElementById('btn-cancel-link').onclick = () => UI.linkFamilyModal.style.display = 'none';

    document.getElementById('form-link-family').onsubmit = async (e) => {
      e.preventDefault();
      const familyUserId = document.getElementById('link-select-user').value;
      const patientId = document.getElementById('link-select-patient').value;
      const rel = document.getElementById('link-input-relationship').value;
      await API.linkFamily(familyUserId, patientId, rel);
      UI.linkFamilyModal.style.display = 'none';
      loadAdminFamilyLinks();
    };

    // Listen for auth expiration
    window.addEventListener('icu:auth_expired', () => {
      AppState.currentUser = null;
      updateUserUI();
      // Only redirect away from authenticated dashboard views — never close landing or login!
      if (AppState.currentView !== 'landing' && AppState.currentView !== 'login') {
        switchView('landing');
      }
    });
  }

  // Boot Application
  window.addEventListener('DOMContentLoaded', init);
})();
