const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = 'http://localhost:3000';

test('End-to-End Live HTTP API System Verification', async (t) => {
  let adminToken = '';
  let staffToken = '';
  let familyToken = '';

  // 1. Health check
  await t.test('Health check endpoint is live', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.simulatorActive, true);
  });

  // 2. Demo accounts endpoint
  await t.test('Demo accounts list returned for quick sign-in', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/demo-accounts`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.accounts.length >= 4);
  });

  // 3. Authenticate Admin
  await t.test('Admin login succeeds', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hospital.icu', password: 'AdminPass123!' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.role, 'admin');
    assert.ok(data.token);
    adminToken = data.token;
  });

  // 4. Authenticate Staff
  await t.test('Staff login succeeds', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nurse.sarah@hospital.icu', password: 'StaffPass123!' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.role, 'staff');
    assert.ok(data.token);
    staffToken = data.token;
  });

  // 5. Authenticate Family
  await t.test('Family login succeeds', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'family.dent@hospital.icu', password: 'FamilyPass123!' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.role, 'family');
    assert.ok(data.token);
    familyToken = data.token;
  });

  // 6. Role-Based Scoped Patient Queries
  await t.test('Staff sees all 15 beds on telemetry wall', async () => {
    const res = await fetch(`${BASE_URL}/api/patients`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.patients.length, 15);
    const unlucky = data.patients.find(p => p.bed_no === 115);
    assert.ok(unlucky);
    assert.strictEqual(unlucky.simulation_profile, 'critical_demo');
  });

  await t.test('Family user query strictly returns ONLY their linked patient (Data Isolation)', async () => {
    const res = await fetch(`${BASE_URL}/api/patients`, {
      headers: { Authorization: `Bearer ${familyToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    // Family Dent is linked ONLY to Arthur Dent (Bed 101)
    assert.strictEqual(data.patients.length, 1);
    assert.strictEqual(data.patients[0].id, 'PAT-101');
    assert.strictEqual(data.patients[0].bed_no, 101);
  });

  await t.test('Family user is BLOCKED from accessing non-linked patient chart (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/patients/PAT-102`, {
      headers: { Authorization: `Bearer ${familyToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  await t.test('Family summary endpoint returns privacy-preserving status', async () => {
    const res = await fetch(`${BASE_URL}/api/patients/PAT-101/family-summary`, {
      headers: { Authorization: `Bearer ${familyToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.patient.fullName, 'Arthur Dent');
    assert.ok(data.careStatus.telemetrySummary);
    assert.ok(data.visitingGuidelines);
  });

  // 7. Clinical Notes
  await t.test('Staff can record a clinical progress note', async () => {
    const res = await fetch(`${BASE_URL}/api/clinical-notes/PAT-101`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`
      },
      body: JSON.stringify({
        noteText: 'Patient resting comfortably. Oxygen saturation verified at 98%.',
        category: 'observation'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.note.patient_id, 'PAT-101');
    assert.strictEqual(data.note.author_role, 'staff');
  });

  // 8. Alert Triage
  await t.test('Staff can query alerts and acknowledge active alarms', async () => {
    const res = await fetch(`${BASE_URL}/api/alerts?status=active`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.alerts.length >= 1);

    const alertToAck = data.alerts[0];
    const ackRes = await fetch(`${BASE_URL}/api/alerts/${alertToAck.id}/acknowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`
      },
      body: JSON.stringify({ notes: 'Verified on telemetry monitor by charge nurse.' })
    });
    assert.strictEqual(ackRes.status, 200);
  });

  // 9. Admin Authorization & Security
  await t.test('Staff is FORBIDDEN from accessing admin user management (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  await t.test('Admin can access audit logs with recorded events', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.logs.length >= 5);
    const loginLog = data.logs.find(l => l.event_type === 'LOGIN_SUCCESS');
    assert.ok(loginLog);
  });

  // 10. Simulator Breach Injection
  await t.test('Can trigger telemetry breach on Bed 115 demo patient', async () => {
    const res = await fetch(`${BASE_URL}/api/simulator/trigger-breach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffToken}`
      },
      body: JSON.stringify({ patientId: 'PAT-115', parameter: 'blood_pressure_sys' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.vitalRecord);
    assert.strictEqual(data.vitalRecord.blood_pressure_sys, 185);
  });
});
