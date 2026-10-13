const test = require('node:test');
const assert = require('node:assert');
const { getDatabase, initSchema } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');
const { getPatientPrivacySummaryForFamily } = require('../server/services/vitalService');

test('Family Privacy and Data Isolation Tests', async (t) => {
  const db = getDatabase();
  initSchema(db);
  seedDatabase(db);

  await t.test('Family user can access summary for explicitly linked patient', () => {
    // USR-FAM-1 is linked to PAT-101 (Arthur Dent)
    const summary = getPatientPrivacySummaryForFamily('PAT-101', 'USR-FAM-1');
    assert.ok(summary);
    assert.strictEqual(summary.patient.fullName, 'Arthur Dent');
    assert.strictEqual(summary.patient.bedNumber, 101);
    assert.strictEqual(summary.familyRelationship, 'Spouse');
    assert.ok(summary.careStatus.comfortDescription);
    assert.ok(summary.visitingGuidelines);
  });

  await t.test('Family user is BLOCKED from accessing non-linked patient', () => {
    // USR-FAM-1 is NOT linked to PAT-102 (Eleanor Rigby)
    const summary = getPatientPrivacySummaryForFamily('PAT-102', 'USR-FAM-1');
    assert.strictEqual(summary, null);
  });

  await t.test('Database-level query for family patients returns ONLY linked records', () => {
    const familyUserId = 'USR-FAM-1';
    const rows = db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.bed_no
      FROM patients p
      JOIN family_links fl ON p.id = fl.patient_id
      WHERE fl.family_user_id = ?
    `).all(familyUserId);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, 'PAT-101');
  });

  await t.test('Staff query reflects assigned patient flag', () => {
    const staffId = 'USR-STAFF-1';
    const assigned = db.prepare(`
      SELECT patient_id FROM staff_assignments WHERE staff_id = ?
    `).all(staffId);

    assert.ok(assigned.length > 0);
    const assignedIds = assigned.map(a => a.patient_id);
    assert.ok(assignedIds.includes('PAT-101'));
    assert.ok(assignedIds.includes('PAT-115')); // Unlucky Guy assigned to Nurse Sarah
  });
});
