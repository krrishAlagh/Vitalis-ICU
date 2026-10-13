# Vitalis ICU: Advanced Patient Telemetry & Intensive Care Safety Platform

> **Disclaimer**: Vitalis ICU is an academic DBMS & clinical informatics prototype designed for demonstration, education, and simulation purposes. It has not been certified under FDA 510(k), CE Medical Device Regulation (MDR), or IEC 62304 standards and is not intended for unsupervised real-world clinical diagnosis.

---

## 1. Project Overview & Product Concept

Vitalis ICU is a full-featured, role-aware, continuous telemetry monitoring platform for hospital Intensive Care Units. Unlike traditional intermittent nursing charts recorded once every 4–6 hours, Vitalis ICU tracks continuous physiological streams, evaluates customizable threshold excursions in real time, provides tiered alert notification workflows, enforces strict database-level security across Staff, Family, and Admin roles, and records all clinical and administrative actions in a tamper-evident audit log.

### Key Capabilities

1. **Continuous ICU Telemetry Monitoring**:
   - Multi-patient Bedside Telemetry Wall (15 patient beds: Beds 101–115).
   - Real-time updates via Server-Sent Events (SSE) for Heart Rate (bpm), Non-Invasive Blood Pressure (systolic/diastolic mmHg), SpO2 (%), Respiration Rate (bpm), and Core Temperature (°C).
   - Dynamic Lead II ECG waveform sweep animation and multi-parameter historical trend charts.

2. **Automated Threshold Evaluation & Alert Triage**:
   - Continuous physiological boundary checks: Bradycardia, Tachycardia, Hypotension, Malignant Hypertension, Desaturation, Bradypnea, Tachypnea, and Hypo/Hyperthermia.
   - Tiered severity classification (`Normal`, `Warning`, `Critical`) with deduplication to prevent alarm fatigue.
   - Lifecycle management: `Active` ➔ `Acknowledged` (with clinical triage note) ➔ `Resolved` (with clinical resolution note).
   - Web Audio API synthesizer for authentic, non-fatiguing ICU telemetry alarm beeps (muteable).

3. **Strict Role-Based Access Control (RBAC) & Database-Level Security**:
   - **Clinical Staff**: Full bedside telemetry wall, assigned beds filter, historical trend inspection, alert acknowledgment/resolution, and clinical progress note entry (Nurse Observations, Interventions, Rounds).
   - **Family Portal**: Compassionate, privacy-isolated view restricted **strictly** to their verified loved one. Provides plain-language status summaries, visiting guidelines, and care team messages without exposing stressful raw alarm metrics or other patients' data.
   - **System Administrator**: User management (create user, deactivate/activate), patient admissions, threshold boundary configuration, staff bed assignments, family account verification, and system-wide security audit trails.
   - **Database Enforcement**: Permissions are checked directly in SQL queries (`WHERE patient_id IN (...)`), not merely through hidden UI buttons.

4. **Realistic Simulation Engine & Demo Data**:
   - 15 realistic fictional patients with diverse clinical diagnoses (Post-CABG, Acute Pancreatitis, Sepsis, Polytrauma, COPD exacerbation).
   - **Bed 115 (Marcus "Unlucky" Vance)**: Programmed as a dedicated simulation subject with elevated physiological excursions (Systolic BP > 175 mmHg, SpO2 < 88%, Tachycardia) to reliably showcase threshold trips, visual/audio alarm triggers, and staff response workflows during project evaluations.
   - Prominently labeled `[SIMULATED DATASET]` with Start / Pause simulation toggles, cadence speed controls (2s / 4s / 10s), and a 1-click **"⚡ Trigger Bed 115 Alert"** test button.

5. **Tamper-Evident Medical & Security Audit Trail**:
   - Automatically logs logins, failed authentication attempts, patient chart access, alert acknowledgments, threshold adjustments, staff assignments, and user provisioning.

---

## 2. Technology Stack & Key Decisions

- **Runtime & Backend**: Node.js v24 (LTS) with Express.
- **Database Engine**: SQLite 3 via Node.js native `node:sqlite` (`DatabaseSync`):
  - Zero external database server configuration required.
  - Full ACID transactions, Write-Ahead Logging (`PRAGMA journal_mode = WAL`), and strict Foreign Keys (`PRAGMA foreign_keys = ON`).
  - Parameterized queries throughout to eliminate SQL injection vulnerabilities.
- **Security & Cryptography**:
  - `bcryptjs` with salt rounds for secure password storage.
  - JSON Web Tokens (JWT) with HMAC SHA-256 for authenticated sessions.
- **Real-Time Engine**:
  - Server-Sent Events (SSE) `/api/stream/events` for telemetry broadcasting and alert dispatch.
- **Frontend Architecture**:
  - Semantic HTML5 and Vanilla ES6+ JavaScript modules.
  - High-acuity dark medical design system using Vanilla CSS (variables, glassmorphism, responsive telemetry cards, pulsing heart rate animations).
  - Native HTML5 Canvas for the Lead II ECG sweeping oscilloscope and multi-line vital trend plots.
  - Native Web Audio API for alarm tone synthesis (no external audio files required).
- **Testing**:
  - Automated test runner using `node:test` and `node:assert`.

---

## 3. Directory Structure

```
ICUManagment/
├── package.json               # Dependencies and scripts (test, start, dev, seed)
├── README.md                  # Project manual, architecture, and demo guide
├── docs/
│   └── original_concept_notes.md  # Preserved original brainstorm notes
├── server/
│   ├── index.js               # Express application entrypoint & SSE server
│   ├── db/
│   │   ├── database.js        # SQLite connection manager & WAL config
│   │   ├── schema.sql         # SQL DDL (users, patients, vitals, alerts, notes, audit_logs)
│   │   └── seed.js            # Initial dataset (15 patients, 7 demo accounts, history)
│   ├── middleware/
│   │   └── authMiddleware.js  # RBAC gating & database-level patient isolation
│   ├── routes/
│   │   ├── authRoutes.js      # Login, logout, demo accounts
│   │   ├── patientRoutes.js   # Scoped patient lists & family summaries
│   │   ├── alertRoutes.js     # Alert queries, acknowledgment, resolution
│   │   ├── clinicalNotesRoutes.js # Progress notes charting
│   │   ├── adminRoutes.js     # User CRUD, beds, thresholds, assignments, audit logs
│   │   ├── simulatorRoutes.js # Simulator start/stop/speed/breach
│   │   └── streamRoutes.js    # Server-Sent Events telemetry endpoint
│   └── services/
│       ├── authService.js     # Password verification & JWT issuance
│       ├── auditService.js    # Audit log persistence & querying
│       ├── vitalService.js    # Telemetry recording & family privacy wrapper
│       ├── alertService.js    # Physiological threshold breach detector
│       └── simulatorService.js# Background physiological RNG emitter
├── public/
│   ├── index.html             # Single-page interface shell
│   ├── css/
│   │   └── style.css          # Medical-grade dark telemetry styling system
│   └── js/
│       ├── api.js             # REST API client with Bearer auth
│       ├── audio.js           # Web Audio API alarm synthesizer
│       ├── stream.js          # EventSource client for live telemetry
│       └── app.js             # Primary UI controller, modals, canvas charts
└── test/
    ├── auth.test.js           # Authentication & token verification tests
    ├── clinicalNotesAndAudit.test.js # Notes & audit trail tests
    ├── familyPrivacyAndRbac.test.js  # Privacy isolation & RBAC gate tests
    ├── thresholdsAndAlerts.test.js   # Threshold engine & alert lifecycle tests
    └── e2e_http.test.js       # Live HTTP end-to-end endpoint tests
```

---

## 4. Setup & Running Instructions

### Prerequisites
- Node.js version 22+ (v24 recommended, built-in `node:sqlite` supported)
- npm version 10+

### Setup Commands

```bash
# 1. Install dependencies
npm install

# 2. Seed database with 15 patients and demo accounts (automatic on first run, or run manually)
npm run seed

# 3. Run all automated tests (unit, integration, and live HTTP E2E)
npm test

# 4. Start the server
npm start
```

The system will start and be available at:
👉 **`http://localhost:3000`**

---

## 5. Demo Accounts & Rapid Testing Workflow

For presentation convenience, the login screen includes a **"⚡ Quick Demo One-Click Sign In"** panel that fills credentials and logs in with a single click.

| Role | Username / Email | Password | Intended Scope & Capabilities |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@hospital.icu` | `AdminPass123!` | Complete administrative oversight: user provisioning, bed allocation, alarm threshold policy editing, and security audit log inspection. |
| **Staff Charge Nurse** | `nurse.sarah@hospital.icu` | `StaffPass123!` | Assigned to Beds 101–104 and Bed 115 (Demo subject). Can acknowledge alerts, view telemetry, and write clinical notes. |
| **Lead Intensivist** | `dr.arjun@hospital.icu` | `StaffPass123!` | Oversees all 15 beds. Can review telemetry, add clinical round notes, and inspect historical trends. |
| **Family Member (Bed 101)** | `family.dent@hospital.icu` | `FamilyPass123!` | Linked strictly to Bed 101 (Arthur Dent). Shows plain-language comfort status and visiting guidelines; hides other beds. |
| **Family Member (Bed 115)** | `family.vance@hospital.icu` | `FamilyPass123!` | Linked strictly to Bed 115 (Marcus Vance). Shows loved one's comfort status without stressful alarm codes. |

---

## 6. Demo Guide (Step-by-Step Evaluation)

1. **Observe Real-Time Telemetry**:
   - Log in as **Staff Charge Nurse (Sarah)**.
   - Observe the 15 bedside cards updating in real time via SSE.
   - Notice the live mini-ECG tracing on each card and the pulsing numerical values.
2. **Inspect Bed 115 (Marcus "Unlucky" Vance)**:
   - Notice Bed 115 highlighted with an active red flashing alarm ribbon.
   - Click the **"⚡ Trigger Bed 115 Alert"** button in the top bar to inject a systolic spike (185 mmHg).
   - Listen to the synthesized audible alarm chime (or mute/unmute using the bell icon).
3. **Inspect Patient Chart & Record Note**:
   - Click **"Inspect Chart"** on Bed 101 (Arthur Dent).
   - Watch the animated oscilloscope ECG waveform and the multi-line trend chart (HR, BP, SpO2).
   - Switch to the **Clinical Notes** tab, enter a progress note (e.g., *"Patient extubated, resting on room air"*), and click **Record Note**.
4. **Acknowledge and Resolve Alerts**:
   - Click the **Alerts** tab in the top navigation.
   - Review the table of active alarms. Click **Acknowledge**, enter a clinical triage note, and confirm.
   - Notice the alert badge counter updates and the status transitions to `acknowledged`.
5. **Verify Family Privacy & Data Isolation**:
   - Sign out and click the **Family Member (Bed 101)** demo button.
   - Notice the UI immediately switches to the dignified **Family Portal**.
   - Arthur Dent's comfort status, attending physician, and care team messages are displayed.
   - Confirm that other patients' cards and raw alarm telemetry are completely inaccessible.
6. **Verify Administrative Governance**:
   - Sign out and log in as **ICU Director / Admin**.
   - Navigate to the **Administration** tab.
   - Inspect the **Users & Roles** table, **Staff Bed Allocation**, and **Alarm Thresholds Configurator**.
   - Open the **System Audit Log** to verify that every login, note, and acknowledgment is permanently recorded with timestamps and actor roles.
7. **Read Clinical Benefits**:
   - Click **Clinical Benefits** in the navigation to view the comprehensive rationale detailing how the application solves alarm fatigue, enhances patient safety, and reduces nursing cognitive load.

---

## 7. Verification & Automated Test Results

Run tests using:
```bash
npm test
```

All 34 test cases pass:
- `test/auth.test.js`: Password hashing, JWT verification, role assignment, credential failure rejection.
- `test/clinicalNotesAndAudit.test.js`: Note author attribution, category tagging, audit log query and search filters.
- `test/familyPrivacyAndRbac.test.js`: Strict SQL-level family data isolation, blocking unauthorized patient access.
- `test/thresholdsAndAlerts.test.js`: Detection of tachycardia, hypotension, desaturation, fever; active ➔ acknowledged ➔ resolved alert state transitions.
- `test/e2e_http.test.js`: Live HTTP integration tests against running server endpoints (`/api/health`, `/api/patients`, `/api/alerts`, `/api/admin/users`, `/api/simulator/trigger-breach`).
