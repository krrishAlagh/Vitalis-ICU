const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const { getAlerts, acknowledgeAlert, resolveAlert } = require('../services/alertService');

// GET /api/alerts (Staff & Admin only)
router.get('/', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const { patientId, status, severity, limit } = req.query;
  const alerts = getAlerts({
    patientId: patientId || null,
    status: status || null,
    severity: severity || null,
    limit: limit ? Number(limit) : 50
  });

  res.json({ alerts });
});

// POST /api/alerts/:alertId/acknowledge (Staff & Admin only)
router.post('/:alertId/acknowledge', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const { alertId } = req.params;
  const { notes } = req.body;

  const result = acknowledgeAlert(Number(alertId), req.user, notes);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ message: 'Alert acknowledged successfully.', alertId });
});

// POST /api/alerts/:alertId/resolve (Staff & Admin only)
router.post('/:alertId/resolve', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const { alertId } = req.params;
  const { resolutionNotes } = req.body;

  const result = resolveAlert(Number(alertId), req.user, resolutionNotes);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ message: 'Alert resolved successfully.', alertId });
});

module.exports = router;
