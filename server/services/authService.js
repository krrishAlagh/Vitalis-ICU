const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../db/database');
const { logAudit } = require('./auditService');

const JWT_SECRET = process.env.JWT_SECRET || 'icu-monitor-enterprise-secure-jwt-secret-key-2026';
const TOKEN_EXPIRY = '12h';

function authenticateUser(identifier, password, ipAddress = '127.0.0.1') {
  const db = getDatabase();
  const user = db.prepare(`
    SELECT * FROM users 
    WHERE (username = ? OR email = ?) AND is_active = 1
  `).get(identifier, identifier);

  if (!user) {
    logAudit({
      eventType: 'AUTH_FAILED',
      actorUsername: identifier,
      actorRole: 'unauthenticated',
      targetEntity: 'auth',
      actionSummary: `Failed login attempt for identifier: ${identifier}`,
      ipAddress
    });
    return { success: false, error: 'Invalid username/email or password.' };
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordValid) {
    logAudit({
      eventType: 'AUTH_FAILED',
      actorId: user.id,
      actorUsername: user.username,
      actorRole: user.role,
      targetEntity: 'auth',
      actionSummary: `Failed password validation for user: ${user.username}`,
      ipAddress
    });
    return { success: false, error: 'Invalid username/email or password.' };
  }

  // Update last login
  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);

  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    titleOrRelation: user.title_or_relation
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

  logAudit({
    eventType: 'LOGIN_SUCCESS',
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    targetEntity: 'auth',
    actionSummary: `User ${user.username} (${user.role}) logged in successfully`,
    ipAddress
  });

  return {
    success: true,
    token,
    user: payload
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function getUserProfile(userId) {
  const db = getDatabase();
  const user = db.prepare(`
    SELECT id, username, email, role, full_name, phone, title_or_relation, is_active, created_at, last_login_at
    FROM users WHERE id = ?
  `).get(userId);
  return user || null;
}

module.exports = {
  authenticateUser,
  verifyToken,
  getUserProfile,
  JWT_SECRET
};
