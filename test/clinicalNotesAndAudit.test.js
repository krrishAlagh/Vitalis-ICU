const test = require('node:test');
const assert = require('node:assert');
const { getDatabase, initSchema } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');
const { logAudit, getAuditLogs } = require('../server/services/auditService');

test('Clinical Notes and Audit Logging Tests', async (t) => {
  const db = getDatabase();
  initSchema(db);
  seedDatabase(db);

  await t.test('Records clinical note with proper attribution', () => {
    const stmt = db.prepare(`
      INSERT INTO clinical_notes (patient_id, author_id, author_name, author_role, category, note_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const info = stmt.run(
      'PAT-101',
      'USR-STAFF-1',
      'Sarah Connor, RN',
      'staff',
      'intervention',
      'Administered IV analgesia; patient resting comfortably with pain scale reduced from 7 to 2.'
    );

    assert.ok(info.lastInsertRowid);
    const note = db.prepare('SELECT * FROM clinical_notes WHERE id = ?').get(info.lastInsertRowid);
    assert.strictEqual(note.author_role, 'staff');
    assert.strictEqual(note.category, 'intervention');
  });

  await t.test('Creates and queries audit logs with filters', () => {
    logAudit({
      eventType: 'SECURITY_TEST_EVENT',
      actorId: 'USR-ADMIN-1',
      actorUsername: 'admin',
      actorRole: 'admin',
      targetEntity: 'security',
      actionSummary: 'Automated audit log verification test',
      details: { check: 'passed' }
    });

    const logs = getAuditLogs({ eventType: 'SECURITY_TEST_EVENT' });
    assert.ok(logs.length >= 1);
    assert.strictEqual(logs[0].actor_username, 'admin');
    assert.strictEqual(logs[0].action_summary, 'Automated audit log verification test');
  });
});
