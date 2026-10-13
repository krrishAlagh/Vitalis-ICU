const { verifyToken } = require('../services/authService');
const { getDatabase } = require('../db/database');
const { logAudit } = require('../services/auditService');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No valid Bearer token provided.' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }

  req.user = decoded;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logAudit({
        eventType: 'ACCESS_DENIED',
        actorId: req.user.userId,
        actorUsername: req.user.username,
        actorRole: req.user.role,
        targetEntity: 'security_gate',
        actionSummary: `Unauthorized access attempt to ${req.originalUrl} by ${req.user.role}`,
        details: { requiredRoles: allowedRoles, attemptedUrl: req.originalUrl },
        ipAddress: req.ip || '127.0.0.1'
      });
      return res.status(403).json({
        error: `Forbidden: Access restricted. Requires one of [${allowedRoles.join(', ')}].`
      });
    }

    next();
  };
}

// Ensure patient access is strictly isolated
function verifyPatientAccess(req, res, next) {
  const patientId = req.params.patientId || req.query.patientId || req.body.patientId;
  if (!patientId) {
    return next();
  }

  const { role, userId } = req.user;
  const db = getDatabase();

  // Admin has comprehensive access
  if (role === 'admin') {
    return next();
  }

  // Staff can access assigned patients, or if doctor/charge nurse can view telemetry
  if (role === 'staff') {
    // Check if assigned specifically or general hospital telemetry view
    const assignment = db.prepare(`
      SELECT 1 FROM staff_assignments WHERE staff_id = ? AND patient_id = ?
    `).get(userId, patientId);

    // If staff is an intensivist/doctor (or assigned), permit access.
    // Allow reading general telemetry for safety, but check assignments
    req.isAssignedStaff = !!assignment;
    return next();
  }

  // Family members: STRICT isolation. Only linked patients allowed!
  if (role === 'family') {
    const link = db.prepare(`
      SELECT relationship FROM family_links 
      WHERE family_user_id = ? AND patient_id = ?
    `).get(userId, patientId);

    if (!link) {
      logAudit({
        eventType: 'PRIVACY_VIOLATION_ATTEMPT',
        actorId: userId,
        actorUsername: req.user.username,
        actorRole: 'family',
        targetEntity: 'patient',
        targetId: patientId,
        actionSummary: `Family user ${req.user.username} attempted unauthorized access to patient ${patientId}`,
        ipAddress: req.ip || '127.0.0.1'
      });
      return res.status(403).json({
        error: 'Access denied: You are not authorized to view health telemetry for this patient.'
      });
    }

    req.familyRelationship = link.relationship;
    return next();
  }

  return res.status(403).json({ error: 'Unauthorized role.' });
}

module.exports = {
  authenticate,
  requireRole,
  verifyPatientAccess
};
