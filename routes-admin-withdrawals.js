const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Withdrawal statistics
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
      WHERE type = 'withdrawal'
    `).get();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error("Admin withdrawal stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load withdrawal statistics."
    });
  }
});


// Get all withdrawal requests
router.get("/", (req, res) => {
  try {
    const status = req.query.status;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    let withdrawals;

    if (status) {
      withdrawals = db.prepare(`
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
        WHERE t.type = 'withdrawal'
          AND t.status = ?
        ORDER BY t.created_at DESC
        LIMIT ?
      `).all(status, limit);
    } else {
      withdrawals = db.prepare(`
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
        WHERE t.type = 'withdrawal'
        ORDER BY t.created_at DESC
        LIMIT ?
      `).all(limit);
    }

    res.json({
      success: true,
      withdrawals
    });

  } catch (error) {
    console.error("Admin withdrawals error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load withdrawals."
    });
  }
});


// Get one withdrawal
router.get("/:id", (req, res) => {
  try {
    const withdrawalId = Number(req.params.id);

    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal ID."
      });
    }

    const withdrawal = db.prepare(`
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
        AND t.type = 'withdrawal'
    `).get(withdrawalId);

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found."
      });
    }

    res.json({
      success: true,
      withdrawal
    });

  } catch (error) {
    console.error("Admin withdrawal detail error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load withdrawal."
    });
  }
});


// Approve or reject a withdrawal
router.patch("/:id/status", (req, res) => {
  try {
    const withdrawalId = Number(req.params.id);
    const { status, note } = req.body;

    const allowedStatuses = [
      "completed",
      "rejected"
    ];

    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal ID."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be completed or rejected."
      });
    }

    const withdrawal = db.prepare(`
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
        AND t.type = 'withdrawal'
    `).get(withdrawalId);

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found."
      });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending withdrawals can be reviewed."
      });
    }

    const cleanNote =
      typeof note === "string" && note.trim()
        ? note.trim()
        : "";

    const reviewWithdrawal = db.transaction(() => {

      if (status === "completed") {

        const wallet = db.prepare(`
          SELECT available_balance
          FROM wallets
          WHERE user_id = ?
        `).get(withdrawal.user_id);

        if (!wallet) {
          throw new Error("User wallet not found.");
        }

        if (Number(wallet.available_balance) < Number(withdrawal.amount)) {
          throw new Error(
            "Insufficient available balance to approve this withdrawal."
          );
        }

        db.prepare(`
          UPDATE wallets
          SET available_balance = available_balance - ?,
              total_withdrawal = total_withdrawal + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(
          withdrawal.amount,
          withdrawal.amount,
          withdrawal.user_id
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
        withdrawalId
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
        withdrawal.user_id,
        "withdrawal",
        status === "completed"
          ? "Withdrawal Approved"
          : "Withdrawal Rejected",
        status === "completed"
          ? `Your withdrawal of ${withdrawal.amount} has been approved.${cleanNote ? ` Note: ${cleanNote}` : ""}`
          : `Your withdrawal of ${withdrawal.amount} has been rejected.${cleanNote ? ` Note: ${cleanNote}` : ""}`
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
          ? "approve_withdrawal"
          : "reject_withdrawal",
        "transaction",
        withdrawalId,
        `Admin ${status === "completed" ? "approved" : "rejected"} withdrawal ${withdrawal.reference} for ${withdrawal.username}. ${cleanNote}`
      );
    });

    reviewWithdrawal();

    res.json({
      success: true,
      message: status === "completed"
        ? "Withdrawal approved and balance updated."
        : "Withdrawal rejected."
    });

  } catch (error) {
    console.error("Withdrawal review error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Unable to review withdrawal."
    });
  }
});


module.exports = router;