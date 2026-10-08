const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Send notification to one user
router.post("/send", (req, res) => {
  try {
    const { userId, title, message, type } = req.body;

    const targetUserId = Number(userId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required."
      });
    }

    if (!title || typeof title !== "string" || title.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Notification title is required."
      });
    }

    if (!message || typeof message !== "string" || message.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Notification message is required."
      });
    }

    const user = db.prepare(`
      SELECT id, username
      FROM users
      WHERE id = ?
    `).get(targetUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const notificationType =
      typeof type === "string" && type.trim()
        ? type.trim().toLowerCase()
        : "admin";

    const result = db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      targetUserId,
      notificationType,
      title.trim(),
      message.trim()
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
      "send_notification",
      "user",
      targetUserId,
      `Admin sent notification to ${user.username}: ${title.trim()}`
    );

    res.json({
      success: true,
      message: "Notification sent successfully.",
      notificationId: result.lastInsertRowid
    });

  } catch (error) {
    console.error("Send notification error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to send notification."
    });
  }
});


// Send a system notification to all active users
router.post("/broadcast", (req, res) => {
  try {
    const { title, message, type } = req.body;

    if (!title || typeof title !== "string" || title.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Notification title is required."
      });
    }

    if (!message || typeof message !== "string" || message.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Notification message is required."
      });
    }

    const notificationType =
      typeof type === "string" && type.trim()
        ? type.trim().toLowerCase()
        : "system";

    const users = db.prepare(`
      SELECT id
      FROM users
      WHERE account_status = 'active'
    `).all();

    const insertNotification = db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `);

    const broadcast = db.transaction(() => {
      for (const user of users) {
        insertNotification.run(
          user.id,
          notificationType,
          title.trim(),
          message.trim()
        );
      }
    });

    broadcast();

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
      "broadcast_notification",
      "platform",
      null,
      `Admin broadcast notification to ${users.length} active users: ${title.trim()}`
    );

    res.json({
      success: true,
      message: "Notification broadcast successfully.",
      recipients: users.length
    });

  } catch (error) {
    console.error("Broadcast notification error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to broadcast notification."
    });
  }
});


// Get recent notification activity
router.get("/history", (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 50, 1),
      200
    );

    const notifications = db.prepare(`
      SELECT
        n.id,
        n.user_id,
        u.username,
        u.email,
        n.type,
        n.title,
        n.message,
        n.is_read,
        n.created_at
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      ORDER BY n.created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({
      success: true,
      notifications
    });

  } catch (error) {
    console.error("Admin notification history error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load notification history."
    });
  }
});


module.exports = router;