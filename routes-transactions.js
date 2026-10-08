const express = require("express");

const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

// Get transaction history
router.get("/", requireAuth, (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1),
      100
    );

    const transactions = db.prepare(`
      SELECT
        id,
        reference,
        type,
        status,
        amount,
        currency,
        payment_method,
        destination,
        description,
        created_at,
        updated_at
      FROM transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(req.user.userId, limit);

    res.json({
      transactions
    });

  } catch (error) {
    console.error("Transaction history error:", error);

    res.status(500).json({
      message: "Unable to load transactions."
    });
  }
});

// Get one transaction
router.get("/:id", requireAuth, (req, res) => {
  try {
    const transaction = db.prepare(`
      SELECT
        id,
        reference,
        type,
        status,
        amount,
        currency,
        payment_method,
        destination,
        description,
        created_at,
        updated_at
      FROM transactions
      WHERE id = ?
        AND user_id = ?
    `).get(
      req.params.id,
      req.user.userId
    );

    if (!transaction) {
      return res.status(404).json({
        message: "Transaction not found."
      });
    }

    res.json({
      transaction
    });

  } catch (error) {
    console.error("Transaction detail error:", error);

    res.status(500).json({
      message: "Unable to load transaction."
    });
  }
});

// Get transaction summary
router.get("/summary/overview", requireAuth, (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS total_transactions,

        COALESCE(SUM(
          CASE
            WHEN type IN ('deposit', 'u2u_received')
              AND status = 'completed'
            THEN amount
            ELSE 0
          END
        ), 0) AS total_received,

        COALESCE(SUM(
          CASE
            WHEN type IN ('withdrawal', 'u2u_sent')
              AND status = 'completed'
            THEN amount
            ELSE 0
          END
        ), 0) AS total_sent,

        COALESCE(SUM(
          CASE
            WHEN status = 'pending'
            THEN amount
            ELSE 0
          END
        ), 0) AS total_pending

      FROM transactions
      WHERE user_id = ?
    `).get(req.user.userId);

    res.json({
      totalTransactions: Number(summary.total_transactions || 0),
      totalReceived: Number(summary.total_received || 0),
      totalSent: Number(summary.total_sent || 0),
      totalPending: Number(summary.total_pending || 0)
    });

  } catch (error) {
    console.error("Transaction summary error:", error);

    res.status(500).json({
      message: "Unable to load transaction summary."
    });
  }
});

module.exports = router;