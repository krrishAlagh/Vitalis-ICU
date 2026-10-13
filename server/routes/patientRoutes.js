const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { authenticate, verifyPatientAccess } = require('../middleware/authMiddleware');
const { getHistoricalVitals, getPatientPrivacySummaryForFamily } = require('../services/vitalService');
const { logAudit } = require('../services/auditService');

// GET /api/patients - Scoped strictly by role in SQL query
router.get('/', authenticate, (req, res) => {
  const db = getDatabase();
  const { role, userId } = req.user;

  if (role === 'admin') {
    // Admin sees all beds with thresholds and latest vitals
    const patients = db.prepare(`
      SELECT p.*, pt.hr_min, pt.hr_max, pt.bp_sys_min, pt.bp_sys_max, pt.spo2_min,
             v.heart_rate, v.blood_pressure_sys, v.blood_pressure_dia, v.spo2, v.respiration_rate, v.temperature, v.recorded_at as last_vital_time,
             (SELECT COUNT(*) FROM alerts WHERE patient_id = p.id AND status = 'active') as active_alerts_count
      FROM patients p
      LEFT JOIN patient_thresholds pt ON p.id = pt.patient_id
      LEFT JOIN vitals v ON v.id = (SELECT MAX(id) FROM vitals WHERE patient_id = p.id)
      ORDER BY p.bed_no ASC
    `).all();
    return res.json({ patients });
  }

  if (role === 'staff') {
    // Staff query includes assignment flag
    const patients = db.prepare(`
      SELECT p.*, pt.hr_min, pt.hr_max, pt.bp_sys_min, pt.bp_sys_max, pt.spo2_min,
             v.heart_rate, v.blood_pressure_sys, v.blood_pressure_dia, v.spo2, v.respiration_rate, v.temperature, v.recorded_at as last_vital_time,
             CASE WHEN sa.staff_id IS NOT NULL THEN 1 ELSE 0 END as is_assigned,
             (SELECT COUNT(*) FROM alerts WHERE patient_id = p.id AND status = 'active') as active_alerts_count
      FROM patients p
      LEFT JOIN patient_thresholds pt ON p.id = pt.patient_id
      LEFT JOIN staff_assignments sa ON p.id = sa.patient_id AND sa.staff_id = ?
      LEFT JOIN vitals v ON v.id = (SELECT MAX(id) FROM vitals WHERE patient_id = p.id)
      ORDER BY p.bed_no ASC
    `).all(userId);
    return res.json({ patients });
  }

  if (role === 'family') {
    // Family query: STRICT database-level constraint: ONLY linked patients!
    const linkedPatients = db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.bed_no, p.admission_date, p.condition_status,
             fl.relationship,
             (SELECT COUNT(*) FROM alerts WHERE patient_id = p.id AND status = 'active') as active_alerts_count
      FROM patients p
      JOIN family_links fl ON p.id = fl.patient_id
      WHERE fl.family_user_id = ?
      ORDER BY p.bed_no ASC
    `).all(userId);

    return res.json({ patients: linkedPatients });
  }

  res.status(403).json({ error: 'Unauthorized role.' });
});

// GET /api/patients/:patientId - Full patient details with access verification
router.get('/:patientId', authenticate, verifyPatientAccess, (req, res) => {
  const { patientId } = req.params;
  const db = getDatabase();

  const patient = db.prepare(`
    SELECT p.*, pt.hr_min, pt.hr_max, pt.bp_sys_min, pt.bp_sys_max, pt.bp_dia_min, pt.bp_dia_max,
           pt.spo2_min, pt.resp_rate_min, pt.resp_rate_max, pt.temp_min, pt.temp_max
    FROM patients p
    LEFT JOIN patient_thresholds pt ON p.id = pt.patient_id
    WHERE p.id = ?
  `).get(patientId);

  if (!patient) {
    return res.status(404).json({ error: 'Patient not found.' });
  }

  // If role is family, redirect/return the privacy summary instead of raw telemetry internals
  if (req.user.role === 'family') {
    const familySummary = getPatientPrivacySummaryForFamily(patientId, req.user.userId);
    return res.json({ familySummary });
  }

  // Get assigned staff
  const staff = db.prepare(`
    SELECT u.id, u.full_name, u.role, u.title_or_relation, sa.shift
    FROM staff_assignments sa
    JOIN users u ON sa.staff_id = u.id
    WHERE sa.patient_id = ?
  `).all(patientId);

  // Get active alerts
  const alerts = db.prepare(`
    SELECT * FROM alerts WHERE patient_id = ? AND status = 'active' ORDER BY triggered_at DESC
  `).all(patientId);

  // Get latest vital
  const latestVital = db.prepare(`
    SELECT * FROM vitals WHERE patient_id = ? ORDER BY id DESC LIMIT 1
  `).get(patientId);

  logAudit({
    eventType: 'PATIENT_CHART_ACCESSED',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: req.user.role,
    targetEntity: 'patient',
    targetId: patientId,
    actionSummary: `${req.user.fullName || req.user.username} viewed telemetry chart for Bed ${patient.bed_no} (${patient.id})`
  });

  res.json({
    patient,
    assignedStaff: staff,
    activeAlerts: alerts,
    latestVital: latestVital || null
  });
});

// GET /api/patients/:patientId/vitals - Historical vitals for telemetry wave/chart
router.get('/:patientId/vitals', authenticate, verifyPatientAccess, (req, res) => {
  // Family members do not receive raw historical clinical series to avoid misinterpretation
  if (req.user.role === 'family') {
    return res.status(403).json({ error: 'Family portal provides a curated condition summary. Detailed raw telemetry series is restricted to clinical staff.' });
  }

  const { patientId } = req.params;
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 30));
  const history = getHistoricalVitals(patientId, limit);

  res.json({ patientId, history });
});

// GET /api/patients/:patientId/family-summary - Explicit endpoint for family portal
router.get('/:patientId/family-summary', authenticate, verifyPatientAccess, (req, res) => {
  const { patientId } = req.params;
  const summary = getPatientPrivacySummaryForFamily(patientId, req.user.userId);

  if (!summary) {
    return res.status(403).json({ error: 'No authorized family linkage found for this patient.' });
  }

  logAudit({
    eventType: 'FAMILY_PORTAL_ACCESSED',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: 'family',
    targetEntity: 'patient',
    targetId: patientId,
    actionSummary: `Family member ${req.user.fullName || req.user.username} viewed care summary for Bed ${summary.patient.bedNumber}`
  });

  res.json(summary);
});

module.exports = router;
