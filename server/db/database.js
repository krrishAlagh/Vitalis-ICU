const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'icu.db');

let dbInstance = null;

function getDatabase(customPath = null) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const targetPath = customPath || DB_PATH;
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(targetPath);
  
  // Enforce WAL mode for concurrent write & read performance
  db.exec('PRAGMA journal_mode = WAL;');
  // Strict Foreign Keys
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

function initSchema(db = null) {
  const targetDb = db || getDatabase();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  targetDb.exec(schemaSql);
  return targetDb;
}

function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
      // already closed
    }
    dbInstance = null;
  }
}

module.exports = {
  getDatabase,
  initSchema,
  closeDatabase,
  DB_PATH
};
