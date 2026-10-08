const express = require("express");
const crypto = require("crypto");
const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

function generateReference(prefix = "DEP") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

// Create a deposit request
router.post("/request", requireAuth, (req, res) => {
  try {
    const {
      amount,
      currency = "USD",
      paymentMethod,
      destination = "",
      description = ""
    } = req.body;

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: "Enter a valid deposit amount."
      });
    }

    if (numericAmount < 10) {
      return res.status(400).json({
        message: "Minimum deposit amount is 10."
      });
    }

    if (!paymentMethod || String(paymentMethod).trim().length < 2) {
      return res.status(400).json({
        message: "Select a valid payment method."
      });
    }

    const user = db.prepare(`
      SELECT id, account_status
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User account not found."
      });
    }

    if (user.account_status !== "active") {
      return res.status(403).json({
        message: "Your account is not active."
      });
    }

    const setting = db.prepare(`
      SELECT value
      FROM platform_settings
      WHERE key = 'allow_deposits'
    `).get();

    if (setting && setting.value === "false") {
      return res.status(403).json({
        message: "Deposits are currently disabled."
      });
    }

    const reference = generateReference();

    const insert = db.prepare(`
      INSERT INTO transactions (
        user_id,
        reference,
        type,
        status,
        amount,
        currency,
        payment_method,
        destination,
        description
      )
      VALUES (?, ?, 'deposit', 'pending', ?, ?, ?, ?, ?)
    `);

    insert.run(
      req.user.userId,
      reference,
      numericAmount,
      String(currency).toUpperCase(),
      String(paymentMethod).trim(),
      String(destination).trim(),
      String(description).trim()
    );

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, 'deposit', 'Deposit Request Received', ?)
    `).run(
      req.user.userId,
      `Your deposit request of ${numericAmount} ${String(currency).toUpperCase()} has been received and is pending review. Reference: ${reference}`
    );

    res.status(201).json({
      message: "Deposit request submitted successfully.",
      reference,
      status: "pending",
      amount: numericAmount,
      currency: String(currency).toUpperCase()
    });

  } catch (error) {
    console.error("Deposit request error:", error);

    res.status(500).json({
      message: "Unable to submit deposit request."
    });
  }
});

// Get current user's deposit requests
router.get("/requests", requireAuth, (req, res) => {
  try {
    const deposits = db.prepare(`
      SELECT
        id,
        reference,
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
        AND type = 'deposit'
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.user.userId);

    res.json({
      deposits
    });

  } catch (error) {
    console.error("Get deposits error:", error);

    res.status(500).json({
      message: "Unable to load deposit requests."
    });
  }
});

module.exports = router;