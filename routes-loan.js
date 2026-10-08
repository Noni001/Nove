const express = require("express");
const crypto = require("crypto");

const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

function generateReference(prefix = "LOAN") {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

// Submit a crypto loan request
router.post("/request", requireAuth, (req, res) => {
  try {
    const {
      amount,
      receivingMethod,
      walletAddress = "",
      purpose = ""
    } = req.body;

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: "Enter a valid loan amount."
      });
    }

    if (numericAmount < 10000) {
      return res.status(400).json({
        message: "Minimum loan request is 10,000."
      });
    }

    if (
      !receivingMethod ||
      String(receivingMethod).trim().length < 2
    ) {
      return res.status(400).json({
        message: "Select a receiving method."
      });
    }

    if (
      !walletAddress ||
      String(walletAddress).trim().length < 3
    ) {
      return res.status(400).json({
        message: "Enter a valid receiving wallet/address."
      });
    }

    const user = db.prepare(`
      SELECT
        id,
        account_status
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

    const existingPending = db.prepare(`
      SELECT id
      FROM loan_requests
      WHERE user_id = ?
        AND status = 'pending'
      LIMIT 1
    `).get(req.user.userId);

    if (existingPending) {
      return res.status(400).json({
        message: "You already have a loan request under review."
      });
    }

    const reference = generateReference();

    const insert = db.prepare(`
      INSERT INTO loan_requests (
        user_id,
        amount,
        receiving_method,
        wallet_address,
        purpose,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    insert.run(
      req.user.userId,
      numericAmount,
      String(receivingMethod).trim(),
      String(walletAddress).trim(),
      String(purpose).trim()
    );

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, 'loan', 'Loan Request Submitted', ?)
    `).run(
      req.user.userId,
      `Your loan request of ${numericAmount} has been submitted for review. Reference: ${reference}`
    );

    res.status(201).json({
      message: "Loan request submitted successfully.",
      reference,
      status: "pending",
      amount: numericAmount
    });

  } catch (error) {
    console.error("Loan request error:", error);

    res.status(500).json({
      message: "Unable to submit loan request."
    });
  }
});

// Get current user's loan requests
router.get("/requests", requireAuth, (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT
        id,
        amount,
        receiving_method,
        wallet_address,
        purpose,
        status,
        created_at,
        updated_at
      FROM loan_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.user.userId);

    res.json({
      requests
    });

  } catch (error) {
    console.error("Get loan requests error:", error);

    res.status(500).json({
      message: "Unable to load loan requests."
    });
  }
});

module.exports = router;