const express = require("express");
const { db } = require("./db");
const { comparePassword, createToken } = require("./auth");

const router = express.Router();

// ADMIN LOGIN
router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    const admin = db.prepare(`
      SELECT
        id,
        full_name,
        username,
        email,
        password_hash,
        role,
        account_status,
        account_type,
        kyc_status
      FROM users
      WHERE email = ?
    `).get(email.trim().toLowerCase());

    if (!admin) {
      return res.status(401).json({
        error: "Invalid admin credentials"
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        error: "Administrator access required"
      });
    }

    if (admin.account_status !== "active") {
      return res.status(403).json({
        error: "Admin account is not active"
      });
    }

    const validPassword = comparePassword(
      password,
      admin.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid admin credentials"
      });
    }

    // Record successful login
    db.prepare(`
      UPDATE users
      SET
        last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(admin.id);

    const token = createToken({
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: "admin"
    });

    res.json({
      message: "Admin login successful",
      token,
      admin: {
        id: admin.id,
        full_name: admin.full_name,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        account_status: admin.account_status,
        account_type: admin.account_type,
        kyc_status: admin.kyc_status
      }
    });
  } catch (error) {
    console.error("Admin login error:", error);

    res.status(500).json({
      error: "Admin login failed"
    });
  }
});

module.exports = router;