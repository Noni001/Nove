require("dotenv").config();

const { db } = require("./db");
const { hashPassword } = require("./auth");

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  process.exit(1);
}

if (password === "CHANGE_THIS_BEFORE_PRODUCTION") {
  console.error("Change ADMIN_PASSWORD in .env before creating the admin.");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Admin password must be at least 8 characters.");
  process.exit(1);
}

try {
  const existing = db.prepare(`
    SELECT id
    FROM users
    WHERE email = ?
  `).get(email.toLowerCase());

  if (existing) {
    db.prepare(`
      UPDATE users
      SET
        role = 'admin',
        account_status = 'active',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.id);

    console.log("Existing account promoted to admin.");
    console.log(`Admin email: ${email}`);
    process.exit(0);
  }

  const usernameBase = email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 20) || "admin";

  let username = usernameBase;
  let counter = 1;

  while (
    db.prepare(`
      SELECT id FROM users WHERE username = ?
    `).get(username)
  ) {
    username = `${usernameBase}${counter}`;
    counter++;
  }

  const passwordHash = hashPassword(password);

  const result = db.prepare(`
    INSERT INTO users (
      full_name,
      username,
      email,
      password_hash,
      role,
      account_status,
      account_type,
      kyc_status,
      referral_code
    )
    VALUES (?, ?, ?, ?, 'admin', 'active', 'standard', 'approved', ?)
  `).run(
    "NovaVest Administrator",
    username,
    email.toLowerCase(),
    passwordHash,
    `ADMIN${Date.now()}`
  );

  db.prepare(`
    INSERT INTO wallets (user_id)
    VALUES (?)
  `).run(result.lastInsertRowid);

  console.log("=================================");
  console.log("NovaVest admin created successfully");
  console.log("=================================");
  console.log(`Email: ${email}`);
  console.log(`Username: ${username}`);
  console.log("Role: admin");
  console.log("=================================");
} catch (error) {
  console.error("Failed to create admin:", error);
  process.exit(1);
}