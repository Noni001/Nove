const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("./db");
const { requireAuth, requireAdmin, hashPassword } = require("./auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

// GET admin profile
router.get("/", (req, res) => {
  try {
    const admin = db.prepare(`
      SELECT
        id,
        full_name,
        username,
        email,
        phone,
        role,
        account_status,
        account_type,
        two_factor_enabled,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!admin) {
      return res.status(404).json({
        error: "Admin account not found"
      });
    }

    res.json({ admin });
  } catch (error) {
    console.error("Admin profile error:", error);
    res.status(500).json({
      error: "Failed to load admin profile"
    });
  }
});

// UPDATE admin profile
router.patch("/", (req, res) => {
  try {
    const { fullName, phone } = req.body;

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({
        error: "Full name is required"
      });
    }

    db.prepare(`
      UPDATE users
      SET
        full_name = ?,
        phone = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      fullName.trim(),
      phone ? phone.trim() : null,
      req.user.userId
    );

    const admin = db.prepare(`
      SELECT
        id,
        full_name,
        username,
        email,
        phone,
        role,
        account_status,
        account_type,
        two_factor_enabled,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    res.json({
      message: "Admin profile updated successfully",
      admin
    });
  } catch (error) {
    console.error("Admin profile update error:", error);
    res.status(500).json({
      error: "Failed to update admin profile"
    });
  }
});

// CHANGE ADMIN PASSWORD
router.post("/change-password", (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: "All password fields are required"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: "New passwords do not match"
      });
    }

    const admin = db.prepare(`
      SELECT id, password_hash, role
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        error: "Admin access required"
      });
    }

    const validPassword = bcrypt.compareSync(
      currentPassword,
      admin.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        error: "Current password is incorrect"
      });
    }

    const passwordHash = hashPassword(newPassword);

    db.prepare(`
      UPDATE users
      SET
        password_hash = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, admin.id);

    res.json({
      message: "Admin password changed successfully"
    });
  } catch (error) {
    console.error("Admin password change error:", error);
    res.status(500).json({
      error: "Failed to change admin password"
    });
  }
});

// TOGGLE ADMIN 2FA SETTING
router.patch("/two-factor", (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);

    db.prepare(`
      UPDATE users
      SET
        two_factor_enabled = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(enabled ? 1 : 0, req.user.userId);

    res.json({
      message: enabled
        ? "Two-factor authentication setting enabled"
        : "Two-factor authentication setting disabled",
      enabled
    });
  } catch (error) {
    console.error("Admin 2FA error:", error);
    res.status(500).json({
      error: "Failed to update two-factor setting"
    });
  }
});

module.exports = router;