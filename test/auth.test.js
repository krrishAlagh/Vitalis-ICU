const test = require('node:test');
const assert = require('node:assert');
const { authenticateUser, verifyToken } = require('../server/services/authService');
const { getDatabase, initSchema } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');

test('Auth Service Tests', async (t) => {
  const db = getDatabase();
  initSchema(db);
  seedDatabase(db);

  await t.test('Successfully authenticates admin user', () => {
    const res = authenticateUser('admin', 'AdminPass123!');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.user.role, 'admin');
    assert.ok(res.token);

    const verified = verifyToken(res.token);
    assert.strictEqual(verified.username, 'admin');
    assert.strictEqual(verified.role, 'admin');
  });

  await t.test('Successfully authenticates staff user by email', () => {
    const res = authenticateUser('nurse.sarah@hospital.icu', 'StaffPass123!');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.user.role, 'staff');
    assert.strictEqual(res.user.username, 'nurse.sarah');
  });

  await t.test('Successfully authenticates family user', () => {
    const res = authenticateUser('family.dent', 'FamilyPass123!');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.user.role, 'family');
  });

  await t.test('Rejects invalid password', () => {
    const res = authenticateUser('admin', 'WrongPassword123');
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Invalid'));
  });

  await t.test('Rejects nonexistent user', () => {
    const res = authenticateUser('unknown.doctor', 'AnyPassword');
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Invalid'));
  });
});
