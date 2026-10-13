const bcrypt = require('bcryptjs');
const { getDatabase, initSchema } = require('./database');

function seedDatabase(dbInstance = null) {
  const db = dbInstance || getDatabase();
  initSchema(db);

  // Clear existing data for clean seed
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('DELETE FROM audit_logs;');
  db.exec('DELETE FROM family_links;');
  db.exec('DELETE FROM staff_assignments;');
  db.exec('DELETE FROM clinical_notes;');
  db.exec('DELETE FROM alerts;');
  db.exec('DELETE FROM vitals;');
  db.exec('DELETE FROM patient_thresholds;');
  db.exec('DELETE FROM patients;');
  db.exec('DELETE FROM users;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Salt & hash passwords
  const adminHash = bcrypt.hashSync('AdminPass123!', 10);
  const staffHash = bcrypt.hashSync('StaffPass123!', 10);
  const familyHash = bcrypt.hashSync('FamilyPass123!', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, full_name, phone, title_or_relation, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  insertUser.run('USR-ADMIN-1', 'admin', 'admin@hospital.icu', adminHash, 'admin', 'Chief Medical Admin Dr. Priya Sharma', '+91-98100-00100', 'ICU Director / System Admin');
  insertUser.run('USR-STAFF-1', 'nurse.kavitha', 'nurse.kavitha@hospital.icu', staffHash, 'staff', 'Kavitha Nair, RN BSN', '+91-98100-00101', 'Senior ICU Charge Nurse');
  insertUser.run('USR-STAFF-2', 'dr.arjun', 'dr.arjun@hospital.icu', staffHash, 'staff', 'Dr. Arjun Mehta, MD', '+91-98100-00102', 'Lead Intensivist');
  insertUser.run('USR-STAFF-3', 'nurse.rajesh', 'nurse.rajesh@hospital.icu', staffHash, 'staff', 'Rajesh Pillai, RN CCRN', '+91-98100-00103', 'Critical Care Nurse');
  insertUser.run('USR-FAM-1', 'family.sharma', 'family.sharma@hospital.icu', familyHash, 'family', 'Anita Sharma', '+91-98100-00104', 'Spouse of Vikram Sharma');
  insertUser.run('USR-FAM-2', 'family.iyer', 'family.iyer@hospital.icu', familyHash, 'family', 'Deepa Iyer', '+91-98100-00105', 'Daughter of Suresh Iyer');
  insertUser.run('USR-FAM-3', 'family.patel', 'family.patel@hospital.icu', familyHash, 'family', 'Nikhil Patel', '+91-98100-00106', 'Brother of Prerna Patel');

  // 15 Patients (14 diverse clinical scenarios + 1 intentionally critical demo subject)
  const patientsData = [
    {
      id: 'PAT-101',
      first_name: 'Vikram',
      last_name: 'Sharma',
      age: 42,
      gender: 'Male',
      bed_no: 101,
      diagnosis: 'Severe Post-Operative Respiratory Insufficiency',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'standard',
      summary: 'Day 2 post thoracic surgery. On high-flow nasal cannula. Monitored for SpO2 stabilization.'
    },
    {
      id: 'PAT-102',
      first_name: 'Sunita',
      last_name: 'Reddy',
      age: 67,
      gender: 'Female',
      bed_no: 102,
      diagnosis: 'Acute Coronary Syndrome (NSTEMI)',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'standard',
      summary: 'Post cardiac catheterization. Heparin drip active. Close continuous telemetry.'
    },
    {
      id: 'PAT-103',
      first_name: 'Prerna',
      last_name: 'Patel',
      age: 34,
      gender: 'Female',
      bed_no: 103,
      diagnosis: 'Urosepsis with Septic Shock (Resolving)',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'stable',
      profile: 'standard',
      summary: 'Broad spectrum IV antibiotics day 3. Weaning off low-dose norepinephrine. Stable hemodynamics.'
    },
    {
      id: 'PAT-104',
      first_name: 'Rohit',
      last_name: 'Verma',
      age: 49,
      gender: 'Male',
      bed_no: 104,
      diagnosis: 'Severe Acute Pancreatitis',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'standard',
      summary: 'Aggressive fluid resuscitation protocol. Analgesia PCA infusion. Watching renal indices.'
    },
    {
      id: 'PAT-105',
      first_name: 'Meena',
      last_name: 'Krishnamurthy',
      age: 52,
      gender: 'Female',
      bed_no: 105,
      diagnosis: 'Bilateral Lobar Pneumonia with Hypoxia',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'respiratory_distress',
      summary: 'BIPAP therapy overnight. Sputum cultures pending. Oxygenation improving slowly.'
    },
    {
      id: 'PAT-106',
      first_name: 'Ajay',
      last_name: 'Singh',
      age: 46,
      gender: 'Male',
      bed_no: 106,
      diagnosis: 'Polytrauma - Multiple Rib Fractures & Pneumothorax',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'stable',
      profile: 'standard',
      summary: 'Chest tube on -20cm H2O suction. Good tidal volumes. Pain well managed.'
    },
    {
      id: 'PAT-107',
      first_name: 'Lakshmi',
      last_name: 'Nambiar',
      age: 38,
      gender: 'Female',
      bed_no: 107,
      diagnosis: 'Post-Craniotomy for Subdural Hematoma',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'standard',
      summary: 'Neuro checks Q1H. ICP bolt intact with normal pressure < 12 mmHg. GCS 13.'
    },
    {
      id: 'PAT-108',
      first_name: 'Sanjay',
      last_name: 'Kapoor',
      age: 55,
      gender: 'Male',
      bed_no: 108,
      diagnosis: 'Congestive Heart Failure Exacerbation',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'stable',
      profile: 'standard',
      summary: 'Diuresis producing 2.4L net negative. Dyspnea on exertion resolving. Bedside telemetry.'
    },
    {
      id: 'PAT-109',
      first_name: 'Geeta',
      last_name: 'Bose',
      age: 71,
      gender: 'Female',
      bed_no: 109,
      diagnosis: 'Diabetic Ketoacidosis (DKA) - Corrected',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'recovering',
      profile: 'standard',
      summary: 'Anion gap closed. Transitioned from regular insulin IV drip to subcutaneous basal-bolus.'
    },
    {
      id: 'PAT-110',
      first_name: 'Divya',
      last_name: 'Menon',
      age: 29,
      gender: 'Female',
      bed_no: 110,
      diagnosis: 'Acute Myocarditis post Viral Infection',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'arrhythmia',
      summary: 'Telemetry continuous for intermittent premature ventricular complexes (PVCs). Troponin trending downward.'
    },
    {
      id: 'PAT-111',
      first_name: 'Raman',
      last_name: 'Gupta',
      age: 63,
      gender: 'Male',
      bed_no: 111,
      diagnosis: 'Severe COPD Exacerbation with Hypercapnia',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'respiratory_distress',
      summary: 'Nebulized bronchodilators and IV steroids. ABG shows compensating respiratory acidosis.'
    },
    {
      id: 'PAT-112',
      first_name: 'Savita',
      last_name: 'Joshi',
      age: 44,
      gender: 'Female',
      bed_no: 112,
      diagnosis: 'Major Abdominal Aortic Aneurysm Repair (EVAR)',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'recovering',
      profile: 'post_op',
      summary: 'Post-op Day 1. Distal pedal pulses +2 bilaterally. Tight blood pressure control maintained.'
    },
    {
      id: 'PAT-113',
      first_name: 'Dinesh',
      last_name: 'Rao',
      age: 60,
      gender: 'Male',
      bed_no: 113,
      diagnosis: 'Acute Renal Failure due to Rhabdomyolysis',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'stable',
      profile: 'standard',
      summary: 'Continuous Renal Replacement Therapy (CRRT) completed. Creatinine improving. Urine output resuming.'
    },
    {
      id: 'PAT-114',
      first_name: 'Harish',
      last_name: 'Chandra',
      age: 48,
      gender: 'Male',
      bed_no: 114,
      diagnosis: 'Complicated Post-Op Whipple Procedure',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'serious',
      profile: 'post_op',
      summary: 'Drain outputs serosanguinous and low. TPN infusion. Vital parameters within acceptable margins.'
    },
    // PATIENT 15: DEMO ALERT TEST SUBJECT
    {
      id: 'PAT-115',
      first_name: 'Suresh',
      last_name: 'Iyer',
      age: 58,
      gender: 'Male',
      bed_no: 115,
      diagnosis: 'Malignant Refractory Hypertension & Severe Desaturation [DEMO ALERT TEST SUBJECT]',
      attending: 'Dr. Arjun Mehta, MD',
      status: 'critical',
      profile: 'critical_demo',
      summary: 'DEMO HIGHLIGHT PATIENT: Programmed to frequently generate abnormal physiological excursions (Systolic BP > 170 mmHg, SpO2 < 88%, Tachycardia > 130 bpm) to reliably demonstrate automated alerting, audible alarm events, and staff triage.'
    }
  ];

  const insertPatient = db.prepare(`
    INSERT INTO patients (id, first_name, last_name, age, gender, bed_no, diagnosis, attending_physician, condition_status, notes_summary, is_simulated, simulation_profile)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const insertThreshold = db.prepare(`
    INSERT INTO patient_thresholds (patient_id, hr_min, hr_max, bp_sys_min, bp_sys_max, bp_dia_min, bp_dia_max, spo2_min, resp_rate_min, resp_rate_max, temp_min, temp_max, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USR-ADMIN-1')
  `);

  patientsData.forEach(p => {
    insertPatient.run(p.id, p.first_name, p.last_name, p.age, p.gender, p.bed_no, p.diagnosis, p.attending, p.status, p.summary, p.profile);
    
    // Default safe thresholds (customized slightly for demo patient)
    if (p.profile === 'critical_demo') {
      // Demo thresholds set so excursions are unmistakably caught
      insertThreshold.run(p.id, 60, 110, 95, 145, 60, 95, 93, 12, 22, 36.2, 37.8);
    } else {
      insertThreshold.run(p.id, 55, 105, 90, 140, 60, 90, 92, 12, 24, 36.0, 38.0);
    }
  });

  // Assign Staff to beds
  const insertStaffAssignment = db.prepare(`
    INSERT INTO staff_assignments (staff_id, patient_id, shift, assigned_by)
    VALUES (?, ?, ?, 'USR-ADMIN-1')
  `);

  // Nurse Kavitha has beds 101, 102, 103, 104, 115
  ['PAT-101', 'PAT-102', 'PAT-103', 'PAT-104', 'PAT-115'].forEach(pid => {
    insertStaffAssignment.run('USR-STAFF-1', pid, 'all');
  });

  // Dr. Arjun (Physician) oversees beds 101 through 115
  patientsData.forEach(p => {
    insertStaffAssignment.run('USR-STAFF-2', p.id, 'all');
  });

  // Nurse Rajesh has beds 105, 106, 107, 108
  ['PAT-105', 'PAT-106', 'PAT-107', 'PAT-108'].forEach(pid => {
    insertStaffAssignment.run('USR-STAFF-3', pid, 'all');
  });

  // Family linkages (strict data isolation)
  const insertFamilyLink = db.prepare(`
    INSERT INTO family_links (family_user_id, patient_id, relationship, verified_by)
    VALUES (?, ?, ?, 'USR-ADMIN-1')
  `);

  insertFamilyLink.run('USR-FAM-1', 'PAT-101', 'Spouse');
  insertFamilyLink.run('USR-FAM-2', 'PAT-115', 'Daughter');
  insertFamilyLink.run('USR-FAM-3', 'PAT-103', 'Brother');

  // Insert Historical Vitals for each patient (past 10 intervals)
  const insertVital = db.prepare(`
    INSERT INTO vitals (patient_id, heart_rate, blood_pressure_sys, blood_pressure_dia, spo2, respiration_rate, temperature, is_simulated, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const now = Date.now();
  patientsData.forEach(p => {
    const isCriticalDemo = p.profile === 'critical_demo';
    for (let i = 10; i >= 0; i--) {
      const recordTime = new Date(now - i * 30000).toISOString(); // 30s intervals in past
      let hr, sys, dia, spo2, rr, temp;

      if (isCriticalDemo) {
        // High excursion readings
        hr = 118 + Math.floor(Math.sin(i) * 14);
        sys = 168 + Math.floor(Math.cos(i) * 18);
        dia = 102 + Math.floor(Math.sin(i) * 8);
        spo2 = 88 + Math.floor(Math.random() * 4); // 88 - 91% (low!)
        rr = 26 + Math.floor(Math.random() * 4);
        temp = 38.6 + (Math.sin(i) * 0.3);
      } else {
        // Realistic normal/moderate readings
        hr = 72 + Math.floor(Math.sin(i + p.bed_no) * 10);
        sys = 118 + Math.floor(Math.cos(i + p.bed_no) * 12);
        dia = 74 + Math.floor(Math.sin(i) * 6);
        spo2 = 96 + Math.floor(Math.random() * 4); // 96 - 99%
        rr = 15 + Math.floor(Math.sin(i) * 3);
        temp = 36.8 + (Math.sin(i) * 0.2);
      }

      insertVital.run(
        p.id,
        Math.round(hr),
        Math.round(sys),
        Math.round(dia),
        Math.round(spo2),
        Math.round(rr),
        Number(temp.toFixed(1)),
        recordTime
      );
    }
  });

  // Insert Initial Alert for Patient 115 (Demonstrates active alerts)
  const insertAlert = db.prepare(`
    INSERT INTO alerts (patient_id, vital_id, parameter_name, reading_value, threshold_breached, severity, status, message, triggered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-3 minutes'))
  `);

  insertAlert.run(
    'PAT-115',
    null,
    'Blood Pressure (Systolic)',
    '178 mmHg',
    'Max Safe: 145 mmHg',
    'critical',
    'active',
    'CRITICAL HYPERTENSION: Systolic BP 178 mmHg exceeds safe threshold of 145 mmHg (Bed 115 - Suresh Iyer)'
  );

  insertAlert.run(
    'PAT-115',
    null,
    'SpO2 (Pulse Oximetry)',
    '87%',
    'Min Safe: 93%',
    'critical',
    'active',
    'CRITICAL HYPOXEMIA: SpO2 87% dropped below safe threshold of 93% (Bed 115 - Suresh Iyer)'
  );

  insertAlert.run(
    'PAT-105',
    null,
    'Respiration Rate',
    '25 bpm',
    'Max Safe: 22 bpm',
    'warning',
    'acknowledged',
    'Tachypnea noted: Respiration Rate 25 bpm exceeds safe limit of 22 bpm (Bed 105 - Meena Krishnamurthy)'
  );

  // Mark acknowledged details for Bed 105 alert
  db.exec(`
    UPDATE alerts
    SET acknowledged_at = datetime('now', '-10 minutes'),
        acknowledged_by = 'USR-STAFF-1',
        resolution_notes = 'Attending notified; titrated BIPAP settings.'
    WHERE patient_id = 'PAT-105'
  `);

  // Insert Clinical Notes
  const insertNote = db.prepare(`
    INSERT INTO clinical_notes (patient_id, author_id, author_name, author_role, category, note_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertNote.run(
    'PAT-101',
    'USR-STAFF-1',
    'Kavitha Nair, RN',
    'staff',
    'observation',
    'Patient alert and oriented x 4. Lung sounds clear bilaterally with slight basal crackles on left. Encouraged deep breathing with incentive spirometer.',
    new Date(now - 3600000).toISOString()
  );

  insertNote.run(
    'PAT-101',
    'USR-STAFF-2',
    'Dr. Arjun Mehta, MD',
    'staff',
    'physician_round',
    'Post-thoracic Day 2 rounds: Hemodynamics stable. ABG showing adequate oxygenation. Will attempt wean off nasal cannula to room air tomorrow morning.',
    new Date(now - 1800000).toISOString()
  );

  insertNote.run(
    'PAT-115',
    'USR-STAFF-1',
    'Kavitha Nair, RN',
    'staff',
    'intervention',
    'High BP and hypoxemia alert triggered. Elevated head of bed to 45 degrees, verified oxygen mask fit, and administered PRN IV labetalol per protocol. Continuous telemetry active.',
    new Date(now - 120000).toISOString()
  );

  // Initial Audit Logs
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (event_type, actor_id, actor_username, actor_role, target_entity, target_id, action_summary, details_json, ip_address, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run('SYSTEM_INIT', 'USR-ADMIN-1', 'admin', 'admin', 'system', 'CORE', 'System initialized with demo dataset', JSON.stringify({ totalPatients: 15, simulated: true }), '127.0.0.1', new Date(now - 7200000).toISOString());
  insertAudit.run('ROLE_ASSIGNMENT', 'USR-ADMIN-1', 'admin', 'admin', 'user', 'USR-STAFF-1', 'Assigned ICU Charge Nurse role to Kavitha Nair', null, '127.0.0.1', new Date(now - 7000000).toISOString());
  insertAudit.run('PRIVACY_LINK', 'USR-ADMIN-1', 'admin', 'admin', 'family_link', 'PAT-101', 'Verified and linked Anita Sharma to Patient PAT-101 (Vikram Sharma)', null, '127.0.0.1', new Date(now - 6800000).toISOString());
  insertAudit.run('ALERT_ACKNOWLEDGED', 'USR-STAFF-1', 'nurse.kavitha', 'staff', 'alert', '3', 'Nurse Kavitha acknowledged Respiration Rate warning for Bed 105', null, '127.0.0.1', new Date(now - 600000).toISOString());

  console.log('Database seeded successfully:');
  console.log(' - 15 Patients initialized (including Bed 115 Suresh Iyer for alert testing)');
  console.log(' - 7 Demo User Accounts created (Admin, 3 Staff, 3 Family)');
  console.log(' - Vitals telemetry history and active/acknowledged alerts seeded');
  console.log(' - Clinical notes and initial audit trail populated');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
