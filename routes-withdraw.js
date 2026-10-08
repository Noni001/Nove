const express = require("express");
const crypto = require("crypto");
const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

function generateReference(prefix = "WDR") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

// Create withdrawal request
router.post("/request", requireAuth, (req, res) => {
  try {
    const {
      amount,
      currency = "USD",
      paymentMethod,
      destination,
      description = ""
    } = req.body;

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: "Enter a valid withdrawal amount."
      });
    }

    if (numericAmount < 10) {
      return res.status(400).json({
        message: "Minimum withdrawal amount is 10."
      });
    }

    if (!paymentMethod || String(paymentMethod).trim().length < 2) {
      return res.status(400).json({
        message: "Select a valid withdrawal method."
      });
    }

    if (!destination || String(destination).trim().length < 3) {
      return res.status(400).json({
        message: "Enter a valid withdrawal destination."
      });
    }

    const user = db.prepare(`
      SELECT
        id,
        account_status,
        kyc_status
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

    const withdrawalSetting = db.prepare(`
      SELECT value
      FROM platform_settings
      WHERE key = 'allow_withdrawals'
    `).get();

    if (withdrawalSetting && withdrawalSetting.value === "false") {
      return res.status(403).json({
        message: "Withdrawals are currently disabled."
      });
    }

    const kycSetting = db.prepare(`
      SELECT value
      FROM platform_settings
      WHERE key = 'require_kyc_before_withdrawal'
    `).get();

    if (
      kycSetting &&
      kycSetting.value === "true" &&
      user.kyc_status !== "approved"
    ) {
      return res.status(403).json({
        message: "KYC verification is required before withdrawals."
      });
    }

    const wallet = db.prepare(`
      SELECT
        available_balance,
        promotional_credit,
        demo_credit,
        bonus_balance
      FROM wallets
      WHERE user_id = ?
    `).get(req.user.userId);

    if (!wallet) {
      return res.status(404).json({
        message: "Wallet not found."
      });
    }

    const availableBalance = Number(wallet.available_balance || 0);

    if (numericAmount > availableBalance) {
      return res.status(400).json({
        message: "Insufficient available balance."
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
      VALUES (?, ?, 'withdrawal', 'pending', ?, ?, ?, ?, ?)
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
      VALUES (?, 'withdrawal', 'Withdrawal Request Received', ?)
    `).run(
      req.user.userId,
      `Your withdrawal request of ${numericAmount} ${String(currency).toUpperCase()} has been received and is pending review. Reference: ${reference}`
    );

    res.status(201).json({
      message: "Withdrawal request submitted successfully.",
      reference,
      status: "pending",
      amount: numericAmount,
      currency: String(currency).toUpperCase()
    });

  } catch (error) {
    console.error("Withdrawal request error:", error);

    res.status(500).json({
      message: "Unable to submit withdrawal request."
    });
  }
});

// Get current user's withdrawal requests
router.get("/requests", requireAuth, (req, res) => {
  try {
    const withdrawals = db.prepare(`
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
        AND type = 'withdrawal'
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.user.userId);

    res.json({
      withdrawals
    });

  } catch (error) {
    console.error("Get withdrawals error:", error);

    res.status(500).json({
      message: "Unable to load withdrawal requests."
    });
  }
});

module.exports = router;