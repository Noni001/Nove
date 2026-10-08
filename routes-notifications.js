const express = require("express");

const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

// Get notifications
router.get("/", requireAuth, (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 50);

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit) ? requestedLimit : 50,
        1
      ),
      100
    );

    const notifications = db.prepare(`
      SELECT
        id,
        type,
        title,
        message,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(
      req.user.userId,
      limit
    );

    const unread = db.prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ?
        AND is_read = 0
    `).get(req.user.userId);

    res.json({
      notifications,
      unreadCount: Number(unread.count || 0)
    });

  } catch (error) {
    console.error("Notification list error:", error);

    res.status(500).json({
      message: "Unable to load notifications."
    });
  }
});

// Mark one notification as read
router.patch("/:id/read", requireAuth, (req, res) => {
  try {
    const result = db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE id = ?
        AND user_id = ?
    `).run(
      req.params.id,
      req.user.userId
    );

    if (result.changes === 0) {
      return res.status(404).json({
        message: "Notification not found."
      });
    }

    res.json({
      message: "Notification marked as read."
    });

  } catch (error) {
    console.error("Mark notification error:", error);

    res.status(500).json({
      message: "Unable to update notification."
    });
  }
});

// Mark all notifications as read
router.patch("/read-all", requireAuth, (req, res) => {
  try {
    db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ?
        AND is_read = 0
    `).run(req.user.userId);

    res.json({
      message: "All notifications marked as read."
    });

  } catch (error) {
    console.error("Mark all notifications error:", error);

    res.status(500).json({
      message: "Unable to update notifications."
    });
  }
});

// Get unread notification count
router.get("/unread-count", requireAuth, (req, res) => {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = ?
        AND is_read = 0
    `).get(req.user.userId);

    res.json({
      unreadCount: Number(result.count || 0)
    });

  } catch (error) {
    console.error("Unread count error:", error);

    res.status(500).json({
      message: "Unable to load unread count."
    });
  }
});

module.exports = router;