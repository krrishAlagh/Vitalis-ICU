const { getDatabase } = require('../db/database');
const { logAudit } = require('./auditService');

function evaluateVitalsAndTriggerAlerts(patientId, vitalRecord, thresholds = null) {
  const db = getDatabase();

  let targetThresholds = thresholds;
  if (!targetThresholds) {
    targetThresholds = db.prepare(`
      SELECT * FROM patient_thresholds WHERE patient_id = ?
    `).get(patientId);
  }

  if (!targetThresholds) {
    // Default safe physiological boundaries if none set
    targetThresholds = {
      hr_min: 55, hr_max: 105,
      bp_sys_min: 90, bp_sys_max: 140,
      bp_dia_min: 60, bp_dia_max: 90,
      spo2_min: 92,
      resp_rate_min: 12, resp_rate_max: 22,
      temp_min: 36.0, temp_max: 38.0
    };
  }

  const patient = db.prepare(`SELECT bed_no, first_name, last_name FROM patients WHERE id = ?`).get(patientId);
  const patientLabel = patient ? `Bed ${patient.bed_no} (${patient.first_name} ${patient.last_name})` : patientId;

  const generatedAlerts = [];
  const checks = [];

  // Heart Rate
  if (vitalRecord.heart_rate < targetThresholds.hr_min) {
    const isCritical = vitalRecord.heart_rate < 45;
    checks.push({
      parameter: 'Heart Rate',
      value: `${vitalRecord.heart_rate} bpm`,
      threshold: `< ${targetThresholds.hr_min} bpm`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'CRITICAL BRADYCARDIA' : 'Bradycardia Warning'}: Heart rate ${vitalRecord.heart_rate} bpm dropped below minimum safe threshold of ${targetThresholds.hr_min} bpm on ${patientLabel}`
    });
  } else if (vitalRecord.heart_rate > targetThresholds.hr_max) {
    const isCritical = vitalRecord.heart_rate > 130;
    checks.push({
      parameter: 'Heart Rate',
      value: `${vitalRecord.heart_rate} bpm`,
      threshold: `> ${targetThresholds.hr_max} bpm`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'CRITICAL TACHYCARDIA' : 'Tachycardia Warning'}: Heart rate ${vitalRecord.heart_rate} bpm exceeded maximum safe threshold of ${targetThresholds.hr_max} bpm on ${patientLabel}`
    });
  }

  // Blood Pressure Systolic
  if (vitalRecord.blood_pressure_sys > targetThresholds.bp_sys_max) {
    const isCritical = vitalRecord.blood_pressure_sys >= 170;
    checks.push({
      parameter: 'Blood Pressure (Systolic)',
      value: `${vitalRecord.blood_pressure_sys} mmHg`,
      threshold: `> ${targetThresholds.bp_sys_max} mmHg`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'CRITICAL HYPERTENSION' : 'Hypertension Warning'}: Systolic BP ${vitalRecord.blood_pressure_sys} mmHg exceeded safe threshold of ${targetThresholds.bp_sys_max} mmHg on ${patientLabel}`
    });
  } else if (vitalRecord.blood_pressure_sys < targetThresholds.bp_sys_min) {
    const isCritical = vitalRecord.blood_pressure_sys <= 80;
    checks.push({
      parameter: 'Blood Pressure (Systolic)',
      value: `${vitalRecord.blood_pressure_sys} mmHg`,
      threshold: `< ${targetThresholds.bp_sys_min} mmHg`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'CRITICAL HYPOTENSION' : 'Hypotension Warning'}: Systolic BP ${vitalRecord.blood_pressure_sys} mmHg dropped below safe threshold of ${targetThresholds.bp_sys_min} mmHg on ${patientLabel}`
    });
  }

  // SpO2
  if (vitalRecord.spo2 < targetThresholds.spo2_min) {
    const isCritical = vitalRecord.spo2 < 90;
    checks.push({
      parameter: 'SpO2 (Pulse Oximetry)',
      value: `${vitalRecord.spo2}%`,
      threshold: `< ${targetThresholds.spo2_min}%`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'CRITICAL DESATURATION' : 'Desaturation Warning'}: Oxygen saturation ${vitalRecord.spo2}% is below safe limit of ${targetThresholds.spo2_min}% on ${patientLabel}`
    });
  }

  // Respiration Rate
  if (vitalRecord.respiration_rate > targetThresholds.resp_rate_max) {
    const isCritical = vitalRecord.respiration_rate >= 30;
    checks.push({
      parameter: 'Respiration Rate',
      value: `${vitalRecord.respiration_rate} bpm`,
      threshold: `> ${targetThresholds.resp_rate_max} bpm`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'CRITICAL TACHYPNEA' : 'Tachypnea Warning'}: Respiration rate ${vitalRecord.respiration_rate} bpm exceeded safe limit of ${targetThresholds.resp_rate_max} bpm on ${patientLabel}`
    });
  } else if (vitalRecord.respiration_rate < targetThresholds.resp_rate_min) {
    const isCritical = vitalRecord.respiration_rate <= 8;
    checks.push({
      parameter: 'Respiration Rate',
      value: `${vitalRecord.respiration_rate} bpm`,
      threshold: `< ${targetThresholds.resp_rate_min} bpm`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'CRITICAL RESPIRATORY DEPRESSION' : 'Bradypnea Warning'}: Respiration rate ${vitalRecord.respiration_rate} bpm is below safe limit of ${targetThresholds.resp_rate_min} bpm on ${patientLabel}`
    });
  }

  // Temperature
  if (vitalRecord.temperature > targetThresholds.temp_max) {
    const isCritical = vitalRecord.temperature >= 39.2;
    checks.push({
      parameter: 'Body Temperature',
      value: `${vitalRecord.temperature.toFixed(1)} °C`,
      threshold: `> ${targetThresholds.temp_max} °C`,
      severity: isCritical ? 'critical' : 'warning',
      message: `${isCritical ? 'HIGH HYPERTHERMIA / FEVER' : 'Elevated Temperature'}: Core temp ${vitalRecord.temperature.toFixed(1)} °C exceeds safe limit of ${targetThresholds.temp_max} °C on ${patientLabel}`
    });
  } else if (vitalRecord.temperature < targetThresholds.temp_min) {
    checks.push({
      parameter: 'Body Temperature',
      value: `${vitalRecord.temperature.toFixed(1)} °C`,
      threshold: `< ${targetThresholds.temp_min} °C`,
      severity: 'warning',
      message: `Hypothermia Alert: Core temp ${vitalRecord.temperature.toFixed(1)} °C is below safe threshold of ${targetThresholds.temp_min} °C on ${patientLabel}`
    });
  }

  // Insert or update alerts (avoid duplicate spamming if an active alert exists)
  const checkActiveAlert = db.prepare(`
    SELECT id, severity FROM alerts 
    WHERE patient_id = ? AND parameter_name = ? AND status = 'active'
    ORDER BY triggered_at DESC LIMIT 1
  `);

  const insertAlertStmt = db.prepare(`
    INSERT INTO alerts (
      patient_id, vital_id, parameter_name, reading_value, threshold_breached,
      severity, status, message, triggered_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'))
  `);

  const updateAlertValueStmt = db.prepare(`
    UPDATE alerts 
    SET reading_value = ?, severity = ?, message = ?, triggered_at = datetime('now')
    WHERE id = ?
  `);

  for (const check of checks) {
    const existing = checkActiveAlert.get(patientId, check.parameter);
    if (existing) {
      // If escalated to critical or changed, update the active alert
      updateAlertValueStmt.run(check.value, check.severity, check.message, existing.id);
      generatedAlerts.push({ id: existing.id, isNew: false, ...check });
    } else {
      let validVitalId = null;
      if (vitalRecord && vitalRecord.id) {
        const vExists = db.prepare(`SELECT 1 FROM vitals WHERE id = ?`).get(vitalRecord.id);
        if (vExists) {
          validVitalId = vitalRecord.id;
        }
      }

      const info = insertAlertStmt.run(
        patientId,
        validVitalId,
        check.parameter,
        check.value,
        check.threshold,
        check.severity,
        check.message
      );
      generatedAlerts.push({ id: Number(info.lastInsertRowid), isNew: true, ...check });

      // Audit log alert generation
      logAudit({
        eventType: 'ALERT_TRIGGERED',
        targetEntity: 'alert',
        targetId: info.lastInsertRowid,
        actionSummary: check.message,
        details: { patientId, parameter: check.parameter, value: check.value, severity: check.severity }
      });
    }
  }

  return generatedAlerts;
}

function getAlerts({ patientId = null, status = null, severity = null, limit = 50 } = {}) {
  const db = getDatabase();
  let query = `
    SELECT a.*, p.first_name, p.last_name, p.bed_no,
           u1.full_name as acknowledged_by_name,
           u2.full_name as resolved_by_name
    FROM alerts a
    JOIN patients p ON a.patient_id = p.id
    LEFT JOIN users u1 ON a.acknowledged_by = u1.id
    LEFT JOIN users u2 ON a.resolved_by = u2.id
    WHERE 1=1
  `;
  const params = [];

  if (patientId) {
    query += ` AND a.patient_id = ?`;
    params.push(patientId);
  }
  if (status) {
    query += ` AND a.status = ?`;
    params.push(status);
  }
  if (severity) {
    query += ` AND a.severity = ?`;
    params.push(severity);
  }

  query += ` ORDER BY 
    CASE a.status 
      WHEN 'active' THEN 1 
      WHEN 'acknowledged' THEN 2 
      ELSE 3 
    END ASC,
    CASE a.severity
      WHEN 'critical' THEN 1
      WHEN 'warning' THEN 2
      ELSE 3
    END ASC,
    a.triggered_at DESC
    LIMIT ?`;
  params.push(limit);

  return db.prepare(query).all(...params);
}

function acknowledgeAlert(alertId, user, notes = '') {
  const db = getDatabase();
  const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alertId);
  if (!alert) {
    return { success: false, error: 'Alert not found.' };
  }

  if (alert.status !== 'active') {
    return { success: false, error: `Alert cannot be acknowledged because its status is already '${alert.status}'.` };
  }

  db.prepare(`
    UPDATE alerts
    SET status = 'acknowledged',
        acknowledged_at = datetime('now'),
        acknowledged_by = ?,
        resolution_notes = ?
    WHERE id = ?
  `).run(user.userId, notes || 'Acknowledged by clinical staff', alertId);

  logAudit({
    eventType: 'ALERT_ACKNOWLEDGED',
    actorId: user.userId,
    actorUsername: user.username,
    actorRole: user.role,
    targetEntity: 'alert',
    targetId: alertId,
    actionSummary: `${user.fullName || user.username} acknowledged alert #${alertId}: ${alert.parameter_name} for patient ${alert.patient_id}`,
    details: { notes }
  });

  return { success: true };
}

function resolveAlert(alertId, user, resolutionNotes = '') {
  const db = getDatabase();
  const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alertId);
  if (!alert) {
    return { success: false, error: 'Alert not found.' };
  }

  if (alert.status === 'resolved') {
    return { success: false, error: 'Alert is already resolved.' };
  }

  db.prepare(`
    UPDATE alerts
    SET status = 'resolved',
        resolved_at = datetime('now'),
        resolved_by = ?,
        resolution_notes = ?
    WHERE id = ?
  `).run(user.userId, resolutionNotes || 'Resolved - vitals normalized or clinical intervention completed', alertId);

  logAudit({
    eventType: 'ALERT_RESOLVED',
    actorId: user.userId,
    actorUsername: user.username,
    actorRole: user.role,
    targetEntity: 'alert',
    targetId: alertId,
    actionSummary: `${user.fullName || user.username} resolved alert #${alertId}: ${alert.parameter_name} for patient ${alert.patient_id}`,
    details: { resolutionNotes }
  });

  return { success: true };
}

module.exports = {
  evaluateVitalsAndTriggerAlerts,
  getAlerts,
  acknowledgeAlert,
  resolveAlert
};
