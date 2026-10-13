const express = require('express');
const router = express.Router();
const { authenticateUser, getUserProfile } = require('../services/authService');
const { authenticate } = require('../middleware/authMiddleware');
const { logAudit } = require('../services/auditService');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  const result = authenticateUser(identifier, password, req.ip || '127.0.0.1');
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }

  res.json({
    message: 'Authentication successful',
    token: result.token,
    user: result.user
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const profile = getUserProfile(req.user.userId);
  if (!profile) {
    return res.status(404).json({ error: 'User profile not found.' });
  }
  res.json({ user: profile });
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  logAudit({
    eventType: 'LOGOUT',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: req.user.role,
    targetEntity: 'auth',
    actionSummary: `User ${req.user.username} logged out`
  });
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/demo-accounts (Safe helper for project evaluation and rapid role-switching)
router.get('/demo-accounts', (req, res) => {
  res.json({
    accounts: [
      {
        role: 'admin',
        roleLabel: 'ICU Director / Admin',
        email: 'admin@hospital.icu',
        username: 'admin',
        password: 'AdminPass123!',
        description: 'Complete administrative privileges: user management, threshold policies, staff assignments, and audit security records.'
      },
      {
        role: 'staff',
        roleLabel: 'Staff Charge Nurse (Sarah)',
        email: 'nurse.sarah@hospital.icu',
        username: 'nurse.sarah',
        password: 'StaffPass123!',
        description: 'Assigned to Beds 101-104 and Bed 115 (Demo subject). Can acknowledge alerts, view telemetry, and write clinical notes.'
      },
      {
        role: 'staff',
        roleLabel: 'Attending Intensivist (Dr. Arjun)',
        email: 'dr.arjun@hospital.icu',
        username: 'dr.arjun',
        password: 'StaffPass123!',
        description: 'Full ICU clinical oversight. Can review all beds, modify patient orders, and view ECG telemetry.'
      },
      {
        role: 'family',
        roleLabel: 'Family Member (Bed 101 - Arthur Dent)',
        email: 'family.dent@hospital.icu',
        username: 'family.dent',
        password: 'FamilyPass123!',
        description: 'Linked strictly to Bed 101. Privacy-isolated summary with compassionate status view.'
      },
      {
        role: 'family',
        roleLabel: 'Family Member (Bed 115 - Marcus Vance)',
        email: 'family.vance@hospital.icu',
        username: 'family.vance',
        password: 'FamilyPass123!',
        description: 'Linked strictly to Bed 115. Can view loved one’s comfort status while preventing access to other hospital beds.'
      }
    ]
  });
});

module.exports = router;
