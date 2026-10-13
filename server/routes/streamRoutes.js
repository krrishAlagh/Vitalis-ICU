const express = require('express');
const router = express.Router();
const { simulatorInstance } = require('../services/simulatorService');
const { verifyToken } = require('../services/authService');
const { getDatabase } = require('../db/database');

// GET /api/stream/events (Server-Sent Events)
router.get('/events', (req, res) => {
  // Support token passed via query parameter for EventSource
  const token = req.query.token;
  let user = null;
  if (token) {
    user = verifyToken(token);
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`);

  // Listener for simulator ticks
  const onTick = (tickData) => {
    // If user is family, filter updates strictly to their linked patients
    let payload = tickData;
    if (user && user.role === 'family') {
      const db = getDatabase();
      const linked = db.prepare(`SELECT patient_id FROM family_links WHERE family_user_id = ?`).all(user.userId);
      const linkedIds = new Set(linked.map(l => l.patient_id));

      const filteredUpdates = tickData.updates.filter(u => linkedIds.has(u.patientId));
      payload = {
        timestamp: tickData.timestamp,
        tickCount: tickData.tickCount,
        updates: filteredUpdates,
        newAlerts: [] // do not send raw clinical alarm telemetry to family stream
      };
    }

    try {
      res.write(`event: vital_tick\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      // client disconnected
    }
  };

  const onStateChange = (state) => {
    try {
      res.write(`event: simulator_state\ndata: ${JSON.stringify(state)}\n\n`);
    } catch (e) {}
  };

  simulatorInstance.on('tick', onTick);
  simulatorInstance.on('state_change', onStateChange);

  // Keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    try {
      res.write(`event: ping\ndata: "keep-alive"\n\n`);
    } catch (e) {
      clearInterval(pingInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    simulatorInstance.off('tick', onTick);
    simulatorInstance.off('state_change', onStateChange);
  });
});

module.exports = router;
