const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Card request statistics
router.get("/stats", (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_requests,
        SUM(
          CASE
            WHEN status = 'pending' THEN 1
            ELSE 0
          END
        ) AS pending_requests,
        SUM(
          CASE
            WHEN status = 'approved' THEN 1
            ELSE 0
          END
        ) AS approved_requests,
        SUM(
          CASE
            WHEN status = 'rejected' THEN 1
            ELSE 0
          END
        ) AS rejected_requests
      FROM card_requests
    `).get();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error("Admin card stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load card statistics."
    });
  }
});


// Get all card requests
router.get("/", (req, res) => {
  try {
    const status = req.query.status;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    let cards;

    if (status) {
      cards = db.prepare(`
        SELECT
          c.id,
          c.user_id,
          u.username,
          u.email,
          u.full_name,
          c.name_on_card,
          c.card_color,
          c.status,
          c.created_at,
          c.updated_at
        FROM card_requests c
        JOIN users u ON u.id = c.user_id
        WHERE c.status = ?
        ORDER BY c.created_at DESC
        LIMIT ?
      `).all(status, limit);
    } else {
      cards = db.prepare(`
        SELECT
          c.id,
          c.user_id,
          u.username,
          u.email,
          u.full_name,
          c.name_on_card,
          c.card_color,
          c.status,
          c.created_at,
          c.updated_at
        FROM card_requests c
        JOIN users u ON u.id = c.user_id
        ORDER BY c.created_at DESC
        LIMIT ?
      `).all(limit);
    }

    res.json({
      success: true,
      cards
    });

  } catch (error) {
    console.error("Admin cards error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load card requests."
    });
  }
});


// Approve or reject a card request
router.patch("/:id/status", (req, res) => {
  try {
    const cardId = Number(req.params.id);
    const { status, note } = req.body;

    const allowedStatuses = [
      "approved",
      "rejected"
    ];

    if (!Number.isInteger(cardId) || cardId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid card request ID."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or rejected."
      });
    }

    const card = db.prepare(`
      SELECT
        c.id,
        c.user_id,
        c.name_on_card,
        c.status,
        u.username
      FROM card_requests c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(cardId);

    if (!card) {
      return res.status(404).json({
        success: false,
        message: "Card request not found."
      });
    }

    if (card.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending card requests can be reviewed."
      });
    }

    db.prepare(`
      UPDATE card_requests
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, cardId);

    const cleanNote =
      typeof note === "string" && note.trim()
        ? note.trim()
        : "";

    const notificationMessage =
      status === "approved"
        ? `Your crypto card request has been approved.${cleanNote ? ` Note: ${cleanNote}` : ""}`
        : `Your crypto card request has been rejected.${cleanNote ? ` Note: ${cleanNote}` : ""}`;

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      card.user_id,
      "card",
      status === "approved"
        ? "Card Request Approved"
        : "Card Request Rejected",
      notificationMessage
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
      status === "approved"
        ? "approve_card_request"
        : "reject_card_request",
      "card_request",
      cardId,
      `Admin ${status} card request for ${card.username}. ${cleanNote}`
    );

    res.json({
      success: true,
      message: `Card request ${status}.`
    });

  } catch (error) {
    console.error("Card review error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to review card request."
    });
  }
});


module.exports = router;