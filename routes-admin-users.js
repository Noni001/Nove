const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);

// Get one user's full account information
router.get("/:id", (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID."
      });
    }

    const user = db.prepare(`
      SELECT
        u.id,
        u.full_name,
        u.username,
        u.email,
        u.phone,
        u.account_status,
        u.account_type,
        u.kyc_status,
        u.referral_code,
        u.referred_by,
        u.role,
        u.two_factor_enabled,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        w.available_balance,
        w.promotional_credit,
        w.demo_credit,
        w.bonus_balance,
        w.total_deposit,
        w.total_withdrawal
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      WHERE u.id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error("Admin user detail error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load user."
    });
  }
});


// Activate user account
router.patch("/:id/activate", (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID."
      });
    }

    const user = db.prepare(`
      SELECT id, username, account_status
      FROM users
      WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    db.prepare(`
      UPDATE users
      SET account_status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      "account",
      "Account Activated",
      "Your NovaVest account has been activated."
    );

    db.prepare(`
      INSERT INTO audit_logs (
        admin_user_id,
        action,
        target_type,
        target_id,
        description
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.user.userId,
      "activate_user",
      "user",
      userId,
      `Admin activated user account: ${user.username}`
    );

    res.json({
      success: true,
      message: "User account activated."
    });

  } catch (error) {
    console.error("Activate user error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to activate user."
    });
  }
});


// Suspend user account
router.patch("/:id/suspend", (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID."
      });
    }

    const user = db.prepare(`
      SELECT id, username, account_status
      FROM users
      WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot suspend your own admin account."
      });
    }

    db.prepare(`
      UPDATE users
      SET account_status = 'suspended',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      "account",
      "Account Suspended",
      "Your NovaVest account has been suspended. Please contact support if you believe this was a mistake."
    );

    db.prepare(`
      INSERT INTO audit_logs (
        admin_user_id,
        action,
        target_type,
        target_id,
        description
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.user.userId,
      "suspend_user",
      "user",
      userId,
      `Admin suspended user account: ${user.username}`
    );

    res.json({
      success: true,
      message: "User account suspended."
    });

  } catch (error) {
    console.error("Suspend user error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to suspend user."
    });
  }
});


// Change account type
router.patch("/:id/account-type", (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { accountType } = req.body;

    const allowedTypes = [
      "standard",
      "premium",
      "vip"
    ];

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID."
      });
    }

    if (!allowedTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account type."
      });
    }

    const user = db.prepare(`
      SELECT id, username
      FROM users
      WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    db.prepare(`
      UPDATE users
      SET account_type = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(accountType, userId);

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      "account",
      "Account Type Updated",
      `Your account type has been updated to ${accountType}.`
    );

    db.prepare(`
      INSERT INTO audit_logs (
        admin_user_id,
        action,
        target_type,
        target_id,
        description
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.user.userId,
      "change_account_type",
      "user",
      userId,
      `Changed ${user.username} account type to ${accountType}`
    );

    res.json({
      success: true,
      message: "Account type updated."
    });

  } catch (error) {
    console.error("Account type update error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update account type."
    });
  }
});

module.exports = router;