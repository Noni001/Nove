const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.resolve("./data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const databaseFile = path.resolve(
  process.env.DATABASE_FILE || "./data/novavest.db"
);

const db = new Database(databaseFile);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");


/* =========================
   USERS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    full_name TEXT NOT NULL,

    username TEXT NOT NULL UNIQUE,

    email TEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    phone TEXT DEFAULT '',

    account_status TEXT NOT NULL DEFAULT 'active',

    account_type TEXT NOT NULL DEFAULT 'standard',

    kyc_status TEXT NOT NULL DEFAULT 'pending',

    referral_code TEXT UNIQUE,

    referred_by TEXT DEFAULT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);


/* =========================
   WALLETS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL UNIQUE,

    available_balance REAL NOT NULL DEFAULT 0,

    promotional_credit REAL NOT NULL DEFAULT 0,

    demo_credit REAL NOT NULL DEFAULT 0,

    bonus_balance REAL NOT NULL DEFAULT 0,

    total_deposit REAL NOT NULL DEFAULT 0,

    total_withdrawal REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);


/* =========================
   TRANSACTIONS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    reference TEXT NOT NULL UNIQUE,

    type TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    amount REAL NOT NULL DEFAULT 0,

    currency TEXT NOT NULL DEFAULT 'USD',

    payment_method TEXT DEFAULT '',

    destination TEXT DEFAULT '',

    description TEXT DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);


/* =========================
   KYC SUBMISSIONS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    full_name TEXT NOT NULL,

    government_id_path TEXT DEFAULT '',

    passport_path TEXT DEFAULT '',

    status TEXT NOT NULL DEFAULT 'pending',

    review_note TEXT DEFAULT '',

    reviewed_by INTEGER DEFAULT NULL,

    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    reviewed_at TEXT DEFAULT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY (reviewed_by)
      REFERENCES users(id)
      ON DELETE SET NULL
  );
`);


/* =========================
   NOTIFICATIONS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    type TEXT NOT NULL DEFAULT 'system',

    title TEXT NOT NULL,

    message TEXT NOT NULL,

    is_read INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);


/* =========================
   REFERRALS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    referrer_user_id INTEGER NOT NULL,

    referred_user_id INTEGER NOT NULL UNIQUE,

    bonus_rate REAL NOT NULL DEFAULT 12,

    bonus_amount REAL NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (referrer_user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY (referred_user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);


/* =========================
   LOAN REQUESTS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS loan_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    amount REAL NOT NULL,

    receiving_method TEXT NOT NULL,

    wallet_address TEXT DEFAULT '',

    purpose TEXT DEFAULT '',

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);


/* =========================
   CARD REQUESTS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS card_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    name_on_card TEXT NOT NULL,

    card_color TEXT NOT NULL DEFAULT 'black',

    pin_hash TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);


/* =========================
   U2U TRANSFERS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS u2u_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    sender_user_id INTEGER NOT NULL,

    receiver_user_id INTEGER NOT NULL,

    reference TEXT NOT NULL UNIQUE,

    amount REAL NOT NULL,

    purpose TEXT DEFAULT '',

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sender_user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY (receiver_user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);


/* =========================
   ADMIN AUDIT LOGS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    admin_user_id INTEGER,

    action TEXT NOT NULL,

    target_type TEXT DEFAULT '',

    target_id TEXT DEFAULT '',

    description TEXT DEFAULT '',

    ip_address TEXT DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (admin_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL
  );
`);


/* =========================
   ACCOUNT ADJUSTMENTS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS account_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    admin_user_id INTEGER,

    adjustment_type TEXT NOT NULL,

    amount REAL NOT NULL,

    reason TEXT NOT NULL,

    reference TEXT UNIQUE,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY (admin_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL
  );
`);


/* =========================
   PLATFORM SETTINGS
========================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,

    value TEXT NOT NULL,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);


/* =========================
   DEFAULT SETTINGS
========================= */

const defaultSettings = [
  ["platform_name", "NovaVest"],
  ["currency", "USD"],
  ["allow_registration", "true"],
  ["email_verification", "true"],
  ["allow_deposits", "true"],
  ["allow_withdrawals", "true"],
  ["manual_transaction_review", "true"],
  ["require_kyc_before_withdrawal", "true"],
  ["maintenance_mode", "false"],
  ["audit_logging", "true"]
];

const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO platform_settings
  (key, value)
  VALUES (?, ?)
`);

const insertManySettings = db.transaction((settings) => {
  for (const setting of settings) {
    insertSetting.run(setting[0], setting[1]);
  }
});

insertManySettings(defaultSettings);


/* =========================
   DATABASE READY
========================= */

console.log("NovaVest database initialized.");

module.exports = db;