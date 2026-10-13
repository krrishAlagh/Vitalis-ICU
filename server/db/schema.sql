-- ICU Patient Monitoring System Database Schema
-- SQLite 3 compatible with strict foreign keys and indexes

PRAGMA foreign_keys = ON;

-- Users table supporting Admin, Staff, and Family roles
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'family')),
    full_name TEXT NOT NULL,
    phone TEXT,
    title_or_relation TEXT, -- e.g. "Senior ICU Nurse", "Primary Attending", "Spouse"
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
);

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 0 AND age <= 130),
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    bed_no INTEGER UNIQUE NOT NULL,
    admission_date TEXT NOT NULL DEFAULT (datetime('now')),
    diagnosis TEXT NOT NULL,
    attending_physician TEXT,
    condition_status TEXT NOT NULL DEFAULT 'serious' CHECK (condition_status IN ('critical', 'serious', 'stable', 'recovering')),
    notes_summary TEXT,
    is_simulated INTEGER NOT NULL DEFAULT 1,
    simulation_profile TEXT NOT NULL DEFAULT 'standard' CHECK (simulation_profile IN ('standard', 'critical_demo', 'arrhythmia', 'respiratory_distress', 'post_op')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configurable alert thresholds per patient
CREATE TABLE IF NOT EXISTS patient_thresholds (
    patient_id TEXT PRIMARY KEY,
    hr_min INTEGER NOT NULL DEFAULT 55,
    hr_max INTEGER NOT NULL DEFAULT 105,
    bp_sys_min INTEGER NOT NULL DEFAULT 90,
    bp_sys_max INTEGER NOT NULL DEFAULT 140,
    bp_dia_min INTEGER NOT NULL DEFAULT 60,
    bp_dia_max INTEGER NOT NULL DEFAULT 90,
    spo2_min INTEGER NOT NULL DEFAULT 92,
    resp_rate_min INTEGER NOT NULL DEFAULT 12,
    resp_rate_max INTEGER NOT NULL DEFAULT 22,
    temp_min REAL NOT NULL DEFAULT 36.0,
    temp_max REAL NOT NULL DEFAULT 38.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Vitals telemetry records
CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    heart_rate INTEGER NOT NULL CHECK (heart_rate > 0 AND heart_rate < 300),
    blood_pressure_sys INTEGER NOT NULL CHECK (blood_pressure_sys > 0 AND blood_pressure_sys < 350),
    blood_pressure_dia INTEGER NOT NULL CHECK (blood_pressure_dia > 0 AND blood_pressure_dia < 250),
    spo2 INTEGER NOT NULL CHECK (spo2 >= 0 AND spo2 <= 100),
    respiration_rate INTEGER NOT NULL CHECK (respiration_rate >= 0 AND respiration_rate < 100),
    temperature REAL NOT NULL CHECK (temperature >= 25.0 AND temperature <= 46.0),
    is_simulated INTEGER NOT NULL DEFAULT 1,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

-- Alerts table tracking breach events and acknowledgment lifecycle
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    vital_id INTEGER,
    parameter_name TEXT NOT NULL, -- 'Heart Rate', 'Blood Pressure', 'SpO2', 'Respiration Rate', 'Temperature'
    reading_value TEXT NOT NULL,
    threshold_breached TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
    message TEXT NOT NULL,
    triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
    acknowledged_at TEXT,
    acknowledged_by TEXT,
    resolved_at TEXT,
    resolved_by TEXT,
    resolution_notes TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (vital_id) REFERENCES vitals(id) ON DELETE SET NULL,
    FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Clinical notes logged by doctors and nurses
CREATE TABLE IF NOT EXISTS clinical_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'observation' CHECK (category IN ('observation', 'intervention', 'physician_round', 'family_communication')),
    note_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Staff to patient bed assignments
CREATE TABLE IF NOT EXISTS staff_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    shift TEXT NOT NULL DEFAULT 'all' CHECK (shift IN ('morning', 'evening', 'night', 'all')),
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    assigned_by TEXT,
    UNIQUE(staff_id, patient_id),
    FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Family member to patient linkages (privacy & data isolation)
CREATE TABLE IF NOT EXISTS family_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_user_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    relationship TEXT NOT NULL, -- 'Spouse', 'Child', 'Parent', 'Guardian', 'Next of Kin'
    verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    verified_by TEXT,
    UNIQUE(family_user_id, patient_id),
    FOREIGN KEY (family_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Tamper-evident Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    actor_username TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT,
    action_summary TEXT NOT NULL,
    details_json TEXT,
    ip_address TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for lightning-fast telemetry lookups and filtered queries
CREATE INDEX IF NOT EXISTS idx_vitals_patient_recorded ON vitals(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status_patient ON alerts(status, patient_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff ON staff_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_family_links_user ON family_links(family_user_id);
