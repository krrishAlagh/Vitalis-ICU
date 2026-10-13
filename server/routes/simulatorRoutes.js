const express = require('express');
const router = express.Router();
const { simulatorInstance } = require('../services/simulatorService');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// GET /api/simulator/status (Anyone authenticated or checking status)
router.get('/status', (req, res) => {
  res.json({
    isRunning: simulatorInstance.isRunning,
    intervalMs: simulatorInstance.intervalMs,
    tickCount: simulatorInstance.tickCount,
    demoSubject: {
      patientId: 'PAT-115',
      bedNo: 115,
      name: 'Marcus "Unlucky" Vance',
      description: 'Dedicated simulation subject designed to trigger high-acuity vital alarms for demo verification.'
    }
  });
});

// POST /api/simulator/start (Staff or Admin)
router.post('/start', authenticate, requireRole('staff', 'admin'), (req, res) => {
  simulatorInstance.start();
  res.json({ message: 'Simulator started', isRunning: true });
});

// POST /api/simulator/stop (Staff or Admin)
router.post('/stop', authenticate, requireRole('staff', 'admin'), (req, res) => {
  simulatorInstance.stop();
  res.json({ message: 'Simulator stopped', isRunning: false });
});

// POST /api/simulator/interval
router.post('/interval', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const { intervalMs } = req.body;
  const newInterval = simulatorInstance.setIntervalMs(intervalMs);
  res.json({ message: 'Simulator interval updated', intervalMs: newInterval });
});

// POST /api/simulator/trigger-breach (Instantly trigger alert on any bed for demo testing)
router.post('/trigger-breach', authenticate, requireRole('staff', 'admin'), (req, res) => {
  const { patientId = 'PAT-115', parameter = 'blood_pressure_sys' } = req.body;
  const result = simulatorInstance.triggerManualBreach(patientId, parameter);
  if (!result) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  res.json({ message: 'Demo telemetry breach injected.', ...result });
});

module.exports = router;
