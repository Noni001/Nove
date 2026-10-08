const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Get all platform settings
router.get("/", (req, res) => {
  try {
    const settings = db.prepare(`
      SELECT key, value, updated_at
      FROM platform_settings
      ORDER BY key ASC
    `).all();

    const formatted = {};

    for (const setting of settings) {
      let value = setting.value;

      if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      }

      formatted[setting.key] = {
        value,
        updatedAt: setting.updated_at
      };
    }

    res.json({
      success: true,
      settings: formatted
    });

  } catch (error) {
    console.error("Admin settings load error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load platform settings."
    });
  }
});


// Update one platform setting
router.patch("/:key", (req, res) => {
  try {
    const key = String(req.params.key || "").trim();

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Setting key is required."
      });
    }

    const allowedKeys = [
      "platform_name",
      "currency",
      "allow_registration",
      "email_verification",
      "allow_deposits",
      "allow_withdrawals",
      "manual_transaction_review",
      "require_kyc_before_withdrawal",
      "maintenance_mode",
      "audit_logging"
    ];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({
        success: false,
        message: "This setting cannot be modified."
      });
    }

    let value = req.body.value;

    if (value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        message: "Setting value is required."
      });
    }

    if (typeof value === "boolean") {
      value = value ? "true" : "false";
    } else {
      value = String(value).trim();
    }

    if (!value) {
      return res.status(400).json({
        success: false,
        message: "Setting value cannot be empty."
      });
    }

    const existing = db.prepare(`
      SELECT value
      FROM platform_settings
      WHERE key = ?
    `).get(key);

    db.prepare(`
      INSERT INTO platform_settings (
        key,
        value,
        updated_at
      )
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);

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
      "update_platform_setting",
      "platform_setting",
      null,
      `Changed setting "${key}" from "${existing ? existing.value : "unset"}" to "${value}"`
    );

    res.json({
      success: true,
      message: "Platform setting updated.",
      key,
      value
    });

  } catch (error) {
    console.error("Admin settings update error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update platform setting."
    });
  }
});


// Update multiple settings at once
router.patch("/", (req, res) => {
  try {
    const settings = req.body.settings;

    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return res.status(400).json({
        success: false,
        message: "Settings object is required."
      });
    }

    const allowedKeys = [
      "platform_name",
      "currency",
      "allow_registration",
      "email_verification",
      "allow_deposits",
      "allow_withdrawals",
      "manual_transaction_review",
      "require_kyc_before_withdrawal",
      "maintenance_mode",
      "audit_logging"
    ];

    const updateSetting = db.prepare(`
      INSERT INTO platform_settings (
        key,
        value,
        updated_at
      )
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    const auditSetting = db.prepare(`
      INSERT INTO audit_logs (
        admin_user_id,
        action,
        target_type,
        target_id,
        description
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateAll = db.transaction(() => {
      let updatedCount = 0;

      for (const key of allowedKeys) {
        if (!(key in settings)) {
          continue;
        }

        let value = settings[key];

        if (typeof value === "boolean") {
          value = value ? "true" : "false";
        } else {
          value = String(value).trim();
        }

        if (!value) {
          continue;
        }

        const existing = db.prepare(`
          SELECT value
          FROM platform_settings
          WHERE key = ?
        `).get(key);

        updateSetting.run(key, value);

        auditSetting.run(
          req.user.userId,
          "update_platform_setting",
          "platform_setting",
          null,
          `Changed setting "${key}" from "${existing ? existing.value : "unset"}" to "${value}"`
        );

        updatedCount++;
      }

      return updatedCount;
    });

    const updatedCount = updateAll();

    res.json({
      success: true,
      message: "Platform settings updated.",
      updatedCount
    });

  } catch (error) {
    console.error("Bulk settings update error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update platform settings."
    });
  }
});


module.exports = router;