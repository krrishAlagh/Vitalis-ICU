const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db/database');
const { authenticate, requireRole, verifyPatientAccess } = require('../middleware/authMiddleware');
const { logAudit } = require('../services/auditService');

// GET /api/clinical-notes/:patientId
router.get('/:patientId', authenticate, verifyPatientAccess, (req, res) => {
  const { patientId } = req.params;
  const db = getDatabase();

  let notes;
  if (req.user.role === 'family') {
    // Family only sees notes permitted for family updates
    notes = db.prepare(`
      SELECT id, author_name, author_role, category, note_text, created_at
      FROM clinical_notes
      WHERE patient_id = ? AND category IN ('family_communication', 'general')
      ORDER BY created_at DESC
    `).all(patientId);
  } else {
    // Staff and Admin see all clinical notes
    notes = db.prepare(`
      SELECT * FROM clinical_notes
      WHERE patient_id = ?
      ORDER BY created_at DESC
    `).all(patientId);
  }

  res.json({ notes });
});

// POST /api/clinical-notes/:patientId
router.post('/:patientId', authenticate, requireRole('staff', 'admin'), verifyPatientAccess, (req, res) => {
  const { patientId } = req.params;
  const { noteText, category } = req.body;

  if (!noteText || noteText.trim().length === 0) {
    return res.status(400).json({ error: 'Note text cannot be empty.' });
  }

  const validCategories = ['observation', 'intervention', 'physician_round', 'family_communication', 'general'];
  const selectedCategory = validCategories.includes(category) ? category : 'observation';

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO clinical_notes (patient_id, author_id, author_name, author_role, category, note_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const info = stmt.run(
    patientId,
    req.user.userId,
    req.user.fullName || req.user.username,
    req.user.role,
    selectedCategory,
    noteText.trim()
  );

  const noteId = Number(info.lastInsertRowid);

  logAudit({
    eventType: 'CLINICAL_NOTE_CREATED',
    actorId: req.user.userId,
    actorUsername: req.user.username,
    actorRole: req.user.role,
    targetEntity: 'clinical_note',
    targetId: noteId,
    actionSummary: `${req.user.fullName || req.user.username} entered ${selectedCategory} note for patient ${patientId}`,
    details: { patientId, category: selectedCategory }
  });

  const createdNote = db.prepare(`SELECT * FROM clinical_notes WHERE id = ?`).get(noteId);
  res.status(201).json({ message: 'Clinical note recorded successfully.', note: createdNote });
});

module.exports = router;
