const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Get audit logs
router.get("/", (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    const logs = db.prepare(`
      SELECT
        a.id,
        a.admin_user_id,
        u.username AS admin_username,
        u.email AS admin_email,
        a.action,
        a.target_type,
        a.target_id,
        a.description,
        a.ip_address,
        a.created_at
      FROM audit_logs a
      LEFT JOIN users u
        ON u.id = a.admin_user_id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({
      success: true,
      logs
    });

  } catch (error) {
    console.error("Admin audit log error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load audit logs."
    });
  }
});


// Get audit logs for a specific target
router.get("/target/:type/:id", (req, res) => {
  try {
    const targetType = String(req.params.type || "").trim();
    const targetId = Number(req.params.id);

    if (!targetType) {
      return res.status(400).json({
        success: false,
        message: "Target type is required."
      });
    }

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid target ID."
      });
    }

    const logs = db.prepare(`
      SELECT
        a.id,
        a.admin_user_id,
        u.username AS admin_username,
        a.action,
        a.target_type,
        a.target_id,
        a.description,
        a.ip_address,
        a.created_at
      FROM audit_logs a
      LEFT JOIN users u
        ON u.id = a.admin_user_id
      WHERE a.target_type = ?
        AND a.target_id = ?
      ORDER BY a.created_at DESC
    `).all(targetType, targetId);

    res.json({
      success: true,
      logs
    });

  } catch (error) {
    console.error("Target audit log error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load target audit history."
    });
  }
});


// Audit log statistics
router.get("/stats", (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_logs,
        COUNT(DISTINCT admin_user_id) AS active_admins,
        COUNT(DISTINCT action) AS action_types
      FROM audit_logs
    `).get();

    const recentActions = db.prepare(`
      SELECT
        action,
        COUNT(*) AS count
      FROM audit_logs
      GROUP BY action
      ORDER BY count DESC
      LIMIT 20
    `).all();

    res.json({
      success: true,
      stats,
      recentActions
    });

  } catch (error) {
    console.error("Audit stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load audit statistics."
    });
  }
});


module.exports = router;