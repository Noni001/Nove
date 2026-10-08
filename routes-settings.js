const express = require("express");
const { requireAuth } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth);


// Get user settings
router.get("/", (req, res) => {
  try {
    const user = db.prepare(`
      SELECT
        id,
        email,
        two_factor_enabled,
        account_status,
        account_type
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    res.json({
      success: true,
      settings: {
        email: user.email,
        twoFactorEnabled: Boolean(user.two_factor_enabled),
        accountStatus: user.account_status,
        accountType: user.account_type
      }
    });

  } catch (error) {
    console.error("Settings load error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load settings."
    });
  }
});


// Enable or disable two-factor authentication setting
router.patch("/two-factor", (req, res) => {
  try {
    const enabled = req.body.enabled;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "The enabled value must be true or false."
      });
    }

    db.prepare(`
      UPDATE users
      SET two_factor_enabled = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      enabled ? 1 : 0,
      req.user.userId
    );

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      req.user.userId,
      "security",
      enabled
        ? "Two-Factor Authentication Enabled"
        : "Two-Factor Authentication Disabled",
      enabled
        ? "Two-factor authentication has been enabled on your account."
        : "Two-factor authentication has been disabled on your account."
    );

    res.json({
      success: true,
      message: enabled
        ? "Two-factor authentication enabled."
        : "Two-factor authentication disabled.",
      twoFactorEnabled: enabled
    });

  } catch (error) {
    console.error("Two-factor setting error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update two-factor setting."
    });
  }
});


// Logout endpoint
// The JWT remains valid until expiry unless token revocation is added later.
// This endpoint is provided so the frontend has a consistent logout action.
router.post("/logout", (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully. Remove the saved authentication token on the client."
  });
});


module.exports = router;