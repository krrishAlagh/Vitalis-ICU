const { getDatabase } = require('../db/database');
const { evaluateVitalsAndTriggerAlerts } = require('./alertService');

function recordVitalReading(patientId, vitals, isSimulated = 1) {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO vitals (
      patient_id, heart_rate, blood_pressure_sys, blood_pressure_dia,
      spo2, respiration_rate, temperature, is_simulated, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const info = stmt.run(
    patientId,
    Math.round(vitals.heart_rate),
    Math.round(vitals.blood_pressure_sys),
    Math.round(vitals.blood_pressure_dia),
    Math.round(vitals.spo2),
    Math.round(vitals.respiration_rate),
    Number(vitals.temperature.toFixed(1)),
    isSimulated ? 1 : 0
  );

  const vitalId = Number(info.lastInsertRowid);
  const createdRecord = {
    id: vitalId,
    patient_id: patientId,
    ...vitals,
    is_simulated: isSimulated,
    recorded_at: new Date().toISOString()
  };

  // Evaluate against thresholds
  const alertsTriggered = evaluateVitalsAndTriggerAlerts(patientId, createdRecord);

  return {
    vitalRecord: createdRecord,
    alertsTriggered
  };
}

function getLatestVitalsForPatients(patientIds = null) {
  const db = getDatabase();
  let query = `
    SELECT v.*, p.first_name, p.last_name, p.bed_no, p.condition_status, p.simulation_profile
    FROM vitals v
    JOIN patients p ON v.patient_id = p.id
    WHERE v.id IN (
      SELECT MAX(id) FROM vitals GROUP BY patient_id
    )
  `;

  if (patientIds && patientIds.length > 0) {
    const placeholders = patientIds.map(() => '?').join(',');
    query += ` AND v.patient_id IN (${placeholders})`;
    return db.prepare(query).all(...patientIds);
  }

  query += ` ORDER BY p.bed_no ASC`;
  return db.prepare(query).all();
}

function getHistoricalVitals(patientId, limit = 30) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM vitals
    WHERE patient_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).all(patientId, limit).reverse(); // reverse so chronologically ascending for charts
}

function getPatientPrivacySummaryForFamily(patientId, familyUserId) {
  const db = getDatabase();

  // Verify family link
  const link = db.prepare(`
    SELECT relationship FROM family_links 
    WHERE family_user_id = ? AND patient_id = ?
  `).get(familyUserId, patientId);

  if (!link) {
    return null;
  }

  const patient = db.prepare(`
    SELECT id, first_name, last_name, age, gender, bed_no, admission_date,
           diagnosis, attending_physician, condition_status, notes_summary
    FROM patients WHERE id = ?
  `).get(patientId);

  if (!patient) return null;

  // Latest vital to derive friendly status (without overwhelming clinical noise)
  const latestVital = db.prepare(`
    SELECT heart_rate, blood_pressure_sys, blood_pressure_dia, spo2, temperature, recorded_at
    FROM vitals WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 1
  `).get(patientId);

  // Active alerts count to indicate stability
  const activeAlertsCount = db.prepare(`
    SELECT COUNT(*) as count FROM alerts WHERE patient_id = ? AND status = 'active'
  `).get(patientId).count;

  // Recent notes categorized as family communication or general reassurance
  const recentFamilyNotes = db.prepare(`
    SELECT author_name, author_role, category, note_text, created_at
    FROM clinical_notes
    WHERE patient_id = ?
    ORDER BY created_at DESC LIMIT 5
  `).all(patientId);

  // Derive human-friendly status indicator
  let telemetrySummary = 'Stable & Monitored';
  let statusBadge = 'success';
  if (activeAlertsCount > 0) {
    telemetrySummary = 'Under Active Clinical Observation';
    statusBadge = 'warning';
  }

  return {
    patient: {
      id: patient.id,
      fullName: `${patient.first_name} ${patient.last_name}`,
      bedNumber: patient.bed_no,
      admissionDate: patient.admission_date,
      conditionStatus: patient.condition_status,
      attendingPhysician: patient.attending_physician,
      summary: patient.notes_summary
    },
    familyRelationship: link.relationship,
    careStatus: {
      telemetrySummary,
      statusBadge,
      lastTelemetryCheck: latestVital ? latestVital.recorded_at : null,
      comfortDescription: deriveComfortMessage(patient.condition_status, activeAlertsCount)
    },
    recentUpdates: recentFamilyNotes,
    visitingGuidelines: {
      visitingHours: '10:00 AM - 1:00 PM, 5:00 PM - 8:00 PM',
      bedsideContact: 'ICU Central Nursing Desk: Ext 4020 / +1-555-0199',
      unitGuidelines: 'Maximum two visitors at bedside. Please sanitize hands thoroughly before entering Bed area.'
    }
  };
}

function deriveComfortMessage(conditionStatus, activeAlerts) {
  if (activeAlerts > 0) {
    return 'The ICU care team is at the bedside actively managing and titrating care. The patient is monitored continuously.';
  }
  if (conditionStatus === 'recovering') {
    return 'The patient is making steady positive progress and resting comfortably.';
  }
  if (conditionStatus === 'stable') {
    return 'The patient is currently in stable condition and vitals remain within the physician’s expected target range.';
  }
  return 'The clinical team is providing around-the-clock intensive monitoring and individualized medical support.';
}

module.exports = {
  recordVitalReading,
  getLatestVitalsForPatients,
  getHistoricalVitals,
  getPatientPrivacySummaryForFamily
};
