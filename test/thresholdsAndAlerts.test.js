const test = require('node:test');
const assert = require('node:assert');
const { getDatabase, initSchema } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');
const { evaluateVitalsAndTriggerAlerts, acknowledgeAlert, resolveAlert, getAlerts } = require('../server/services/alertService');

test('Threshold Evaluation and Alert Lifecycle Tests', async (t) => {
  const db = getDatabase();
  initSchema(db);
  seedDatabase(db);

  await t.test('Triggers tachycardia warning and hypertension warning', () => {
    const abnormalReading = {
      id: 9999,
      heart_rate: 115, // > max 105
      blood_pressure_sys: 155, // > max 140
      blood_pressure_dia: 85,
      spo2: 97,
      respiration_rate: 18,
      temperature: 37.0
    };

    const alerts = evaluateVitalsAndTriggerAlerts('PAT-101', abnormalReading);
    assert.ok(alerts.length >= 2);
    
    const hrAlert = alerts.find(a => a.parameter === 'Heart Rate');
    assert.ok(hrAlert);
    assert.strictEqual(hrAlert.severity, 'warning');

    const bpAlert = alerts.find(a => a.parameter.includes('Blood Pressure'));
    assert.ok(bpAlert);
  });

  await t.test('Triggers critical alert when SpO2 drops severely', () => {
    const criticalReading = {
      id: 9998,
      heart_rate: 80,
      blood_pressure_sys: 120,
      blood_pressure_dia: 80,
      spo2: 86, // < 90 is critical
      respiration_rate: 20,
      temperature: 37.0
    };

    const alerts = evaluateVitalsAndTriggerAlerts('PAT-102', criticalReading);
    const spo2Alert = alerts.find(a => a.parameter.includes('SpO2'));
    assert.ok(spo2Alert);
    assert.strictEqual(spo2Alert.severity, 'critical');
  });

  await t.test('Allows staff to acknowledge active alert', () => {
    const activeAlerts = getAlerts({ patientId: 'PAT-115', status: 'active' });
    assert.ok(activeAlerts.length > 0);

    const targetAlert = activeAlerts[0];
    const staffUser = { userId: 'USR-STAFF-1', username: 'nurse.sarah', role: 'staff', fullName: 'Sarah Connor' };
    
    const ackResult = acknowledgeAlert(targetAlert.id, staffUser, 'Bedside assessment completed; oxygen titrated.');
    assert.strictEqual(ackResult.success, true);

    const updated = db.prepare('SELECT status, acknowledged_by, resolution_notes FROM alerts WHERE id = ?').get(targetAlert.id);
    assert.strictEqual(updated.status, 'acknowledged');
    assert.strictEqual(updated.acknowledged_by, 'USR-STAFF-1');
  });

  await t.test('Allows staff to resolve acknowledged or active alert', () => {
    const alerts = getAlerts({ patientId: 'PAT-115' });
    const targetAlert = alerts[0];
    const staffUser = { userId: 'USR-STAFF-1', username: 'nurse.sarah', role: 'staff' };

    const resolveResult = resolveAlert(targetAlert.id, staffUser, 'Patient vitals normalized post medication.');
    assert.strictEqual(resolveResult.success, true);

    const updated = db.prepare('SELECT status, resolved_by FROM alerts WHERE id = ?').get(targetAlert.id);
    assert.strictEqual(updated.status, 'resolved');
    assert.strictEqual(updated.resolved_by, 'USR-STAFF-1');
  });
});
