const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Deposit statistics
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
            WHEN status = 'completed' THEN 1
            ELSE 0
          END
        ) AS completed_requests,
        SUM(
          CASE
            WHEN status = 'rejected' THEN 1
            ELSE 0
          END
        ) AS rejected_requests,
        COALESCE(
          SUM(
            CASE
              WHEN status = 'completed' THEN amount
              ELSE 0
            END
          ),
          0
        ) AS completed_amount
      FROM transactions
      WHERE type = 'deposit'
    `).get();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error("Admin deposit stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load deposit statistics."
    });
  }
});


// Get all deposit requests
router.get("/", (req, res) => {
  try {
    const status = req.query.status;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    let deposits;

    if (status) {
      deposits = db.prepare(`
        SELECT
          t.id,
          t.user_id,
          u.username,
          u.email,
          u.full_name,
          t.reference,
          t.amount,
          t.currency,
          t.payment_method,
          t.destination,
          t.description,
          t.status,
          t.created_at,
          t.updated_at
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        WHERE t.type = 'deposit'
          AND t.status = ?
        ORDER BY t.created_at DESC
        LIMIT ?
      `).all(status, limit);
    } else {
      deposits = db.prepare(`
        SELECT
          t.id,
          t.user_id,
          u.username,
          u.email,
          u.full_name,
          t.reference,
          t.amount,
          t.currency,
          t.payment_method,
          t.destination,
          t.description,
          t.status,
          t.created_at,
          t.updated_at
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        WHERE t.type = 'deposit'
        ORDER BY t.created_at DESC
        LIMIT ?
      `).all(limit);
    }

    res.json({
      success: true,
      deposits
    });

  } catch (error) {
    console.error("Admin deposits error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load deposits."
    });
  }
});


// Get one deposit request
router.get("/:id", (req, res) => {
  try {
    const depositId = Number(req.params.id);

    if (!Number.isInteger(depositId) || depositId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit ID."
      });
    }

    const deposit = db.prepare(`
      SELECT
        t.id,
        t.user_id,
        u.username,
        u.email,
        u.full_name,
        t.reference,
        t.amount,
        t.currency,
        t.payment_method,
        t.destination,
        t.description,
        t.status,
        t.created_at,
        t.updated_at
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ?
        AND t.type = 'deposit'
    `).get(depositId);

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit request not found."
      });
    }

    res.json({
      success: true,
      deposit
    });

  } catch (error) {
    console.error("Admin deposit detail error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load deposit."
    });
  }
});


// Approve or reject a deposit
router.patch("/:id/status", (req, res) => {
  try {
    const depositId = Number(req.params.id);
    const { status, note } = req.body;

    const allowedStatuses = [
      "completed",
      "rejected"
    ];

    if (!Number.isInteger(depositId) || depositId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit ID."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be completed or rejected."
      });
    }

    const deposit = db.prepare(`
      SELECT
        t.id,
        t.user_id,
        t.amount,
        t.status,
        t.reference,
        u.username
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ?
        AND t.type = 'deposit'
    `).get(depositId);

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit request not found."
      });
    }

    if (deposit.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending deposits can be reviewed."
      });
    }

    const cleanNote =
      typeof note === "string" && note.trim()
        ? note.trim()
        : "";

    const reviewDeposit = db.transaction(() => {

      if (status === "completed") {

        const wallet = db.prepare(`
          SELECT user_id
          FROM wallets
          WHERE user_id = ?
        `).get(deposit.user_id);

        if (!wallet) {
          throw new Error("User wallet not found.");
        }

        db.prepare(`
          UPDATE wallets
          SET available_balance = available_balance + ?,
              total_deposit = total_deposit + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(
          deposit.amount,
          deposit.amount,
          deposit.user_id
        );
      }

      db.prepare(`
        UPDATE transactions
        SET status = ?,
            description =
              CASE
                WHEN ? = '' THEN description
                ELSE COALESCE(description, '') || ' | Admin note: ' || ?
              END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        cleanNote,
        cleanNote,
        depositId
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
        deposit.user_id,
        "deposit",
        status === "completed"
          ? "Deposit Approved"
          : "Deposit Rejected",
        status === "completed"
          ? `Your deposit of ${deposit.amount} has been approved and added to your available balance.${cleanNote ? ` Note: ${cleanNote}` : ""}`
          : `Your deposit of ${deposit.amount} has been rejected.${cleanNote ? ` Note: ${cleanNote}` : ""}`
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
        status === "completed"
          ? "approve_deposit"
          : "reject_deposit",
        "transaction",
        depositId,
        `Admin ${status === "completed" ? "approved" : "rejected"} deposit ${deposit.reference} for ${deposit.username}. ${cleanNote}`
      );
    });

    reviewDeposit();

    res.json({
      success: true,
      message: status === "completed"
        ? "Deposit approved and balance updated."
        : "Deposit rejected."
    });

  } catch (error) {
    console.error("Deposit review error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Unable to review deposit."
    });
  }
});


module.exports = router;