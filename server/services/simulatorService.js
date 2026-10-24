const EventEmitter = require('node:events');
const { getDatabase } = require('../db/database');
const { recordVitalReading } = require('./vitalService');
const { logAudit } = require('./auditService');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const pythonSimulator = path.join(__dirname, '..', 'python', 'vital_generator.py');

function generateVitals(inputs) {
  const result = spawnSync(process.env.PYTHON || 'python3', [pythonSimulator], {
    input: JSON.stringify(inputs), encoding: 'utf8', maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Python vital generator failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

class SimulatorService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.intervalId = null;
    this.intervalMs = 4000; // 4 seconds tick by default
    this.tickCount = 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.step(), this.intervalMs);
    logAudit({
      eventType: 'SIMULATOR_STATE',
      targetEntity: 'simulator',
      actionSummary: `Telemetry simulator started (tick interval: ${this.intervalMs}ms)`
    });
    this.emit('state_change', { isRunning: true, intervalMs: this.intervalMs });
  }

  stop() {
    if (!this.isRunning) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    logAudit({
      eventType: 'SIMULATOR_STATE',
      targetEntity: 'simulator',
      actionSummary: 'Telemetry simulator stopped'
    });
    this.emit('state_change', { isRunning: false, intervalMs: this.intervalMs });
  }

  setIntervalMs(ms) {
    const validMs = Math.max(1000, Math.min(30000, Number(ms) || 4000));
    this.intervalMs = validMs;
    if (this.isRunning) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => this.step(), this.intervalMs);
    }
    this.emit('state_change', { isRunning: this.isRunning, intervalMs: this.intervalMs });
    return this.intervalMs;
  }

  step() {
    try {
      this.tickCount++;
      const db = getDatabase();
      const patients = db.prepare(`SELECT id, bed_no, simulation_profile FROM patients WHERE is_simulated = 1`).all();
      
      const updates = [];
      const newAlerts = [];

      const inputs = patients.map((p) => ({
        patient: p,
        lastVital: db.prepare(`SELECT * FROM vitals WHERE patient_id = ? ORDER BY id DESC LIMIT 1`).get(p.id),
        tick: this.tickCount
      }));
      const generatedVitals = generateVitals(inputs);

      for (const [index, p] of patients.entries()) {
        // Query latest reading as baseline
        const nextVitals = generatedVitals[index];
        const { vitalRecord, alertsTriggered } = recordVitalReading(p.id, nextVitals, 1);
        
        updates.push({
          patientId: p.id,
          bedNo: p.bed_no,
          vitals: vitalRecord
        });

        if (alertsTriggered && alertsTriggered.length > 0) {
          newAlerts.push(...alertsTriggered);
        }
      }

      // Cleanup vitals if more than 150 rows per patient to keep demo lean & fast
      if (this.tickCount % 20 === 0) {
        db.exec(`
          DELETE FROM vitals 
          WHERE id IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY id DESC) as rn
              FROM vitals
            ) WHERE rn > 150
          );
        `);
      }

      this.emit('tick', {
        timestamp: new Date().toISOString(),
        tickCount: this.tickCount,
        updates,
        newAlerts
      });
    } catch (err) {
      console.error('Error during simulator step:', err);
    }
  }

  triggerManualBreach(patientId, parameter = 'blood_pressure_sys') {
    const db = getDatabase();
    const patient = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(patientId);
    if (!patient) return null;

    let breachedVitals = {
      heart_rate: 80,
      blood_pressure_sys: 120,
      blood_pressure_dia: 75,
      spo2: 97,
      respiration_rate: 16,
      temperature: 36.8
    };

    if (parameter === 'blood_pressure_sys') {
      breachedVitals.blood_pressure_sys = 185;
      breachedVitals.blood_pressure_dia = 105;
      breachedVitals.heart_rate = 110;
    } else if (parameter === 'spo2') {
      breachedVitals.spo2 = 86;
      breachedVitals.respiration_rate = 28;
    } else if (parameter === 'heart_rate') {
      breachedVitals.heart_rate = 145;
      breachedVitals.blood_pressure_sys = 148;
    } else if (parameter === 'temperature') {
      breachedVitals.temperature = 39.5;
      breachedVitals.heart_rate = 120;
    }

    const { vitalRecord, alertsTriggered } = recordVitalReading(patientId, breachedVitals, 1);

    this.emit('tick', {
      timestamp: new Date().toISOString(),
      tickCount: ++this.tickCount,
      updates: [{ patientId, bedNo: patient.bed_no, vitals: vitalRecord }],
      newAlerts: alertsTriggered
    });

    logAudit({
      eventType: 'MANUAL_ALERT_SIMULATION',
      targetEntity: 'patient',
      targetId: patientId,
      actionSummary: `Manual demo telemetry breach triggered for Bed ${patient.bed_no} (${parameter})`
    });

    return { vitalRecord, alertsTriggered };
  }
}

const simulatorInstance = new SimulatorService();

module.exports = {
  simulatorInstance
};
