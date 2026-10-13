const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { getDatabase, initSchema } = require('./db/database');
const { seedDatabase } = require('./db/seed');
const { simulatorInstance } = require('./services/simulatorService');

const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const alertRoutes = require('./routes/alertRoutes');
const clinicalNotesRoutes = require('./routes/clinicalNotesRoutes');
const adminRoutes = require('./routes/adminRoutes');
const simulatorRoutes = require('./routes/simulatorRoutes');
const streamRoutes = require('./routes/streamRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Database & auto-seed if needed
const db = getDatabase();
initSchema(db);

const patientCount = db.prepare(`SELECT COUNT(*) as count FROM patients`).get().count;
if (patientCount === 0) {
  console.log('Database is unpopulated. Auto-seeding initial demo dataset...');
  seedDatabase(db);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/clinical-notes', clinicalNotesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/simulator', simulatorRoutes);
app.use('/api/stream', streamRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'ICU Patient Telemetry and Alerting Platform',
    timestamp: new Date().toISOString(),
    simulatorActive: simulatorInstance.isRunning
  });
});

// Single Page Application Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🏥 ICU Patient Monitoring & Telemetry System is Online!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`⚙️  Simulator: Configured with 15 beds (Bed 115 demo alert subject)`);
  console.log(`=======================================================`);

  // Start background telemetry simulation loop
  simulatorInstance.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down ICU system gracefully...');
  simulatorInstance.stop();
  server.close(() => {
    process.exit(0);
  });
});

module.exports = { app, server };
