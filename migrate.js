require("dotenv").config();

const { db } = require("./db");

function addColumn(sql, name) {
  try {
    db.prepare(sql).run();
    console.log(`Added column: ${name}`);
  } catch (error) {
    if (
      !error.message.toLowerCase().includes("duplicate column")
    ) {
      throw error;
    }

    console.log(`Column already exists: ${name}`);
  }
}

try {
  console.log("Starting NovaVest database migration...");

  addColumn(
    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
    "role"
  );

  addColumn(
    "ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0",
    "two_factor_enabled"
  );

  addColumn(
    "ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT NULL",
    "last_login_at"
  );

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

    CREATE INDEX IF NOT EXISTS idx_users_username
    ON users(username);

    CREATE INDEX IF NOT EXISTS idx_transactions_user
    ON transactions(user_id);

    CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id);

    CREATE INDEX IF NOT EXISTS idx_kyc_user
    ON kyc_submissions(user_id);

    CREATE INDEX IF NOT EXISTS idx_audit_admin
    ON audit_logs(admin_user_id);
  `);

  console.log("=================================");
  console.log("NovaVest migration completed");
  console.log("=================================");

  process.exit(0);
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}