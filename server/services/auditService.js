const { getDatabase } = require('../db/database');

function logAudit({
  eventType,
  actorId = null,
  actorUsername = 'system',
  actorRole = 'system',
  targetEntity,
  targetId = null,
  actionSummary,
  details = null,
  ipAddress = '127.0.0.1'
}) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        event_type, actor_id, actor_username, actor_role,
        target_entity, target_id, action_summary, details_json, ip_address, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    const detailsJson = details ? JSON.stringify(details) : null;
    stmt.run(
      eventType,
      actorId,
      actorUsername,
      actorRole,
      targetEntity,
      targetId ? String(targetId) : null,
      actionSummary,
      detailsJson,
      ipAddress
    );
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

function getAuditLogs({ limit = 100, eventType = null, actorRole = null, search = null } = {}) {
  const db = getDatabase();
  let query = `SELECT * FROM audit_logs WHERE 1=1`;
  const params = [];

  if (eventType) {
    query += ` AND event_type = ?`;
    params.push(eventType);
  }

  if (actorRole) {
    query += ` AND actor_role = ?`;
    params.push(actorRole);
  }

  if (search) {
    query += ` AND (action_summary LIKE ? OR actor_username LIKE ? OR target_id LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(query).all(...params);
}

module.exports = {
  logAudit,
  getAuditLogs
};
