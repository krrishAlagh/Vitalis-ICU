const EventEmitter = require('node:events');
const { getDatabase } = require('../db/database');
const { recordVitalReading } = require('./vitalService');
const { logAudit } = require('./auditService');

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

      for (const p of patients) {
        // Query latest reading as baseline
        const lastVital = db.prepare(`
          SELECT * FROM vitals WHERE patient_id = ? ORDER BY id DESC LIMIT 1
        `).get(p.id);

        const nextVitals = this.calculateNextVitals(p, lastVital, this.tickCount);
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

  calculateNextVitals(patient, lastVital, tick) {
    const isCritical = patient.simulation_profile === 'critical_demo';
    const isArrhythmia = patient.simulation_profile === 'arrhythmia';
    const isResp = patient.simulation_profile === 'respiratory_distress';

    if (isCritical) {
      // Marcus Vance "Unlucky Guy" - Deliberately swings out of safe bounds
      const hrWave = Math.sin(tick * 0.4);
      const bpWave = Math.cos(tick * 0.35);

      return {
        heart_rate: 132 + Math.floor(hrWave * 16) + (Math.random() > 0.6 ? 8 : -4), // 120-156 bpm (Tachycardia!)
        blood_pressure_sys: 176 + Math.floor(bpWave * 18), // 158-194 mmHg (Critical Hypertension!)
        blood_pressure_dia: 104 + Math.floor(bpWave * 9),
        spo2: 87 + Math.floor(Math.sin(tick * 0.5) * 4), // 83-91% (Critical Hypoxemia!)
        respiration_rate: 28 + Math.floor(Math.random() * 4), // 28-31 bpm (Tachypnea!)
        temperature: 38.7 + (Math.sin(tick * 0.2) * 0.4) // 38.3-39.1 °C
      };
    }

    if (isArrhythmia) {
      const baseHr = (lastVital && lastVital.heart_rate) || 82;
      const jump = Math.random() > 0.75 ? (Math.random() > 0.5 ? 24 : -18) : (Math.random() * 4 - 2);
      return {
        heart_rate: Math.max(50, Math.min(125, Math.round(baseHr + jump))),
        blood_pressure_sys: 122 + Math.floor(Math.random() * 6 - 3),
        blood_pressure_dia: 78 + Math.floor(Math.random() * 4 - 2),
        spo2: 97 + Math.floor(Math.random() * 2),
        respiration_rate: 16 + Math.floor(Math.random() * 3 - 1),
        temperature: 36.9 + (Math.random() * 0.2 - 0.1)
      };
    }

    if (isResp) {
      return {
        heart_rate: 92 + Math.floor(Math.random() * 8 - 4),
        blood_pressure_sys: 130 + Math.floor(Math.random() * 8 - 4),
        blood_pressure_dia: 82 + Math.floor(Math.random() * 4 - 2),
        spo2: 93 + Math.floor(Math.random() * 3 - 1), // near lower border
        respiration_rate: 23 + Math.floor(Math.random() * 3 - 1), // near threshold
        temperature: 37.3 + (Math.random() * 0.2 - 0.1)
      };
    }

    // Standard clinical ICU stability with gentle biological drift
    const baseHr = (lastVital && lastVital.heart_rate) || 74;
    const baseSys = (lastVital && lastVital.blood_pressure_sys) || 120;
    const baseDia = (lastVital && lastVital.blood_pressure_dia) || 76;
    const baseSpo2 = (lastVital && lastVital.spo2) || 98;
    const baseRr = (lastVital && lastVital.respiration_rate) || 16;
    const baseTemp = (lastVital && lastVital.temperature) || 36.8;

    const drift = (val, min, max, delta = 2) => {
      const next = val + (Math.random() * (delta * 2) - delta);
      return Math.max(min, Math.min(max, next));
    };

    return {
      heart_rate: Math.round(drift(baseHr, 60, 95, 2)),
      blood_pressure_sys: Math.round(drift(baseSys, 105, 135, 3)),
      blood_pressure_dia: Math.round(drift(baseDia, 65, 85, 2)),
      spo2: Math.min(100, Math.round(drift(baseSpo2, 95, 99, 1))),
      respiration_rate: Math.round(drift(baseRr, 13, 19, 1)),
      temperature: drift(baseTemp, 36.4, 37.4, 0.1)
    };
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
