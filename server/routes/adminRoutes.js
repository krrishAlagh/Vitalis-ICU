const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { logAudit, getAuditLogs } = require('../services/auditService');

// All endpoints in this router strictly require 'admin' role
router.use(authenticate, requireRole('admin'));

// GET /api/admin/users
router.get('/users', (req, res) => {
  const db = getDatabase();
  const users = db.prepare(`
    SELECT id, username, email, role, full_name, phone, title_or_relation, is_active, created_at, last_login_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  res.json({ users });
});

// POST /api/admin/users
router.post('/users', (req, res) => {
  const { username, email, password, role, fullName, phone, titleOrRelation } = req.body;
  if (!username || !email || !password || !role || !fullName) {
    return res.status(400).json({ error: 'Username, email, password, role, and full name are required.' });
  }

  if (!['admin', 'staff', 'family'].includes(role)) {
    return res.status(400).json({ error: 'Role must be one of: admin, staff, family.' });
  }

  const db = getDatabase();
  // Check collision
  const existing = db.prepare(`SELECT id FROM users WHERE username = ? OR email = ?`).get(username, email);
  if (existing) {
    return res.status(400).json({ error: 'A user with that username or email already exists.' });
  }

  const newId = `USR-${role.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, full_name, phone, title_or_relation, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(newId, username, email, passwordHash, role, fullName, phone || null, titleOrRelation || null);

  logAudit({
    eventType: 'USER_CREATED',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: 'admin',
    targetEntity: 'user',
    targetId: newId,
    actionSummary: `Admin created user ${username} with role ${role}`
  });

  const created = db.prepare(`
    SELECT id, username, email, role, full_name, phone, title_or_relation, is_active, created_at
    FROM users WHERE id = ?
  `).get(newId);

  res.status(201).json({ message: 'User created successfully.', user: created });
});

// PATCH /api/admin/users/:userId/status
router.patch('/users/:userId/status', (req, res) => {
  const { userId } = req.params;
  const { isActive } = req.body;

  if (userId === req.user.userId) {
    return res.status(400).json({ error: 'Admins cannot deactivate their own active account.' });
  }

  const db = getDatabase();
  db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, userId);

  logAudit({
    eventType: 'USER_STATUS_UPDATED',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: 'admin',
    targetEntity: 'user',
    targetId: userId,
    actionSummary: `Admin set status of user ${userId} to ${isActive ? 'Active' : 'Disabled'}`
  });

  res.json({ message: 'User status updated successfully.' });
});

// POST /api/admin/patients (Admit new patient)
router.post('/patients', (req, res) => {
  const { firstName, lastName, age, gender, bedNo, diagnosis, attendingPhysician, conditionStatus, notesSummary, simulationProfile } = req.body;

  if (!firstName || !lastName || !age || !gender || !bedNo || !diagnosis) {
    return res.status(400).json({ error: 'First name, last name, age, gender, bed number, and diagnosis are required.' });
  }

  const db = getDatabase();
  // Check bed collision
  const bedUsed = db.prepare(`SELECT id FROM patients WHERE bed_no = ?`).get(Number(bedNo));
  if (bedUsed) {
    return res.status(400).json({ error: `Bed ${bedNo} is already occupied by patient ${bedUsed.id}.` });
  }

  const patientId = `PAT-${bedNo}`;
  const profile = simulationProfile || 'standard';

  db.prepare(`
    INSERT INTO patients (id, first_name, last_name, age, gender, bed_no, diagnosis, attending_physician, condition_status, notes_summary, is_simulated, simulation_profile)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    patientId, firstName, lastName, Number(age), gender, Number(bedNo),
    diagnosis, attendingPhysician || 'ICU Attending', conditionStatus || 'serious',
    notesSummary || '', profile
  );

  // Initialize standard safe thresholds
  db.prepare(`
    INSERT INTO patient_thresholds (patient_id, hr_min, hr_max, bp_sys_min, bp_sys_max, bp_dia_min, bp_dia_max, spo2_min, resp_rate_min, resp_rate_max, temp_min, temp_max, updated_by)
    VALUES (?, 55, 105, 90, 140, 60, 90, 92, 12, 24, 36.0, 38.0, ?)
  `).run(patientId, req.user.userId);

  // Add initial vital reading
  db.prepare(`
    INSERT INTO vitals (patient_id, heart_rate, blood_pressure_sys, blood_pressure_dia, spo2, respiration_rate, temperature, is_simulated, recorded_at)
    VALUES (?, 75, 120, 80, 98, 16, 36.8, 1, datetime('now'))
  `).run(patientId);

  logAudit({
    eventType: 'PATIENT_ADMITTED',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: 'admin',
    targetEntity: 'patient',
    targetId: patientId,
    actionSummary: `Admitted new patient ${firstName} ${lastName} to Bed ${bedNo}`
  });

  res.status(201).json({ message: 'Patient admitted successfully.', patientId });
});

// GET /api/admin/thresholds/:patientId
router.get('/thresholds/:patientId', (req, res) => {
  const { patientId } = req.params;
  const db = getDatabase();
  const thresholds = db.prepare(`SELECT * FROM patient_thresholds WHERE patient_id = ?`).get(patientId);
  if (!thresholds) {
    return res.status(404).json({ error: 'Thresholds not found for patient.' });
  }
  res.json({ thresholds });
});

// PUT /api/admin/thresholds/:patientId
router.put('/thresholds/:patientId', (req, res) => {
  const { patientId } = req.params;
  const { hr_min, hr_max, bp_sys_min, bp_sys_max, bp_dia_min, bp_dia_max, spo2_min, resp_rate_min, resp_rate_max, temp_min, temp_max } = req.body;

  const db = getDatabase();
  db.prepare(`
    UPDATE patient_thresholds
    SET hr_min = ?, hr_max = ?, bp_sys_min = ?, bp_sys_max = ?, bp_dia_min = ?, bp_dia_max = ?,
        spo2_min = ?, resp_rate_min = ?, resp_rate_max = ?, temp_min = ?, temp_max = ?,
        updated_at = datetime('now'), updated_by = ?
    WHERE patient_id = ?
  `).run(
    Number(hr_min), Number(hr_max), Number(bp_sys_min), Number(bp_sys_max),
    Number(bp_dia_min), Number(bp_dia_max), Number(spo2_min), Number(resp_rate_min),
    Number(resp_rate_max), Number(temp_min), Number(temp_max),
    req.user.userId, patientId
  );

  logAudit({
    eventType: 'THRESHOLDS_UPDATED',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: 'admin',
    targetEntity: 'thresholds',
    targetId: patientId,
    actionSummary: `Admin modified physiological alarm boundaries for patient ${patientId}`,
    details: req.body
  });

  res.json({ message: 'Thresholds updated successfully.' });
});

// Staff Assignments
router.get('/assignments', (req, res) => {
  const db = getDatabase();
  const assignments = db.prepare(`
    SELECT sa.id, sa.staff_id, sa.patient_id, sa.shift, sa.assigned_at,
           u.full_name as staff_name, u.email as staff_email,
           p.bed_no, p.first_name || ' ' || p.last_name as patient_name
    FROM staff_assignments sa
    JOIN users u ON sa.staff_id = u.id
    JOIN patients p ON sa.patient_id = p.id
    ORDER BY p.bed_no ASC
  `).all();
  res.json({ assignments });
});

router.post('/assignments', (req, res) => {
  const { staffId, patientId, shift } = req.body;
  if (!staffId || !patientId) {
    return res.status(400).json({ error: 'staffId and patientId are required.' });
  }

  const db = getDatabase();
  try {
    db.prepare(`
      INSERT INTO staff_assignments (staff_id, patient_id, shift, assigned_by)
      VALUES (?, ?, ?, ?)
    `).run(staffId, patientId, shift || 'all', req.user.userId);

    logAudit({
      eventType: 'STAFF_ASSIGNED',
      actorId: req.user.userId,
      actorUsername: req.user.username,
      actorRole: 'admin',
      targetEntity: 'staff_assignment',
      targetId: patientId,
      actionSummary: `Assigned staff ${staffId} to patient ${patientId}`
    });

    res.status(201).json({ message: 'Staff assigned successfully.' });
  } catch (err) {
    res.status(400).json({ error: 'Assignment already exists or invalid ID.' });
  }
});

router.delete('/assignments/:assignmentId', (req, res) => {
  const db = getDatabase();
  db.prepare(`DELETE FROM staff_assignments WHERE id = ?`).run(Number(req.params.assignmentId));
  res.json({ message: 'Assignment removed.' });
});

// Family Links
router.get('/family-links', (req, res) => {
  const db = getDatabase();
  const links = db.prepare(`
    SELECT fl.id, fl.family_user_id, fl.patient_id, fl.relationship, fl.verified_at,
           u.full_name as family_name, u.email as family_email,
           p.bed_no, p.first_name || ' ' || p.last_name as patient_name
    FROM family_links fl
    JOIN users u ON fl.family_user_id = u.id
    JOIN patients p ON fl.patient_id = p.id
    ORDER BY p.bed_no ASC
  `).all();
  res.json({ links });
});

router.post('/family-links', (req, res) => {
  const { familyUserId, patientId, relationship } = req.body;
  if (!familyUserId || !patientId || !relationship) {
    return res.status(400).json({ error: 'familyUserId, patientId, and relationship are required.' });
  }

  const db = getDatabase();
  try {
    db.prepare(`
      INSERT INTO family_links (family_user_id, patient_id, relationship, verified_by)
      VALUES (?, ?, ?, ?)
    `).run(familyUserId, patientId, relationship, req.user.userId);

    logAudit({
      eventType: 'FAMILY_LINK_CREATED',
      actorId: req.user.userId,
      actorUsername: req.user.username,
      actorRole: 'admin',
      targetEntity: 'family_link',
      targetId: patientId,
      actionSummary: `Linked family user ${familyUserId} to patient ${patientId} (${relationship})`
    });

    res.status(201).json({ message: 'Family member linked successfully.' });
  } catch (err) {
    res.status(400).json({ error: 'Linkage already exists or invalid ID.' });
  }
});

router.delete('/family-links/:linkId', (req, res) => {
  const db = getDatabase();
  db.prepare(`DELETE FROM family_links WHERE id = ?`).run(Number(req.params.linkId));
  res.json({ message: 'Family linkage removed.' });
});

// Audit Logs
router.get('/audit-logs', (req, res) => {
  const { limit, eventType, actorRole, search } = req.query;
  const logs = getAuditLogs({
    limit: limit ? Number(limit) : 100,
    eventType: eventType || null,
    actorRole: actorRole || null,
    search: search || null
  });
  res.json({ logs });
});

module.exports = router;
