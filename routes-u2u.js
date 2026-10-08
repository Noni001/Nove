const express = require("express");
const crypto = require("crypto");

const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

function generateReference(prefix = "U2U") {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

// Send funds to another NovaVest user
router.post("/transfer", requireAuth, (req, res) => {
  const {
    receiverUsername,
    amount,
    purpose = ""
  } = req.body;

  const numericAmount = Number(amount);

  if (!receiverUsername || String(receiverUsername).trim().length < 3) {
    return res.status(400).json({
      message: "Enter a valid receiver username."
    });
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({
      message: "Enter a valid transfer amount."
    });
  }

  if (numericAmount < 1) {
    return res.status(400).json({
      message: "Minimum transfer amount is 1."
    });
  }

  const receiverName = String(receiverUsername).trim();

  if (receiverName.toLowerCase() === String(req.user.username).toLowerCase()) {
    return res.status(400).json({
      message: "You cannot transfer funds to yourself."
    });
  }

  const transfer = db.transaction(() => {
    const sender = db.prepare(`
      SELECT
        id,
        username,
        account_status
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!sender) {
      throw new Error("SENDER_NOT_FOUND");
    }

    if (sender.account_status !== "active") {
      throw new Error("SENDER_INACTIVE");
    }

    const receiver = db.prepare(`
      SELECT
        id,
        username,
        full_name,
        account_status
      FROM users
      WHERE LOWER(username) = LOWER(?)
    `).get(receiverName);

    if (!receiver) {
      throw new Error("RECEIVER_NOT_FOUND");
    }

    if (receiver.account_status !== "active") {
      throw new Error("RECEIVER_INACTIVE");
    }

    const senderWallet = db.prepare(`
      SELECT
        available_balance
      FROM wallets
      WHERE user_id = ?
    `).get(sender.id);

    if (!senderWallet) {
      throw new Error("SENDER_WALLET_NOT_FOUND");
    }

    const senderBalance = Number(
      senderWallet.available_balance || 0
    );

    if (numericAmount > senderBalance) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const reference = generateReference();

    // Deduct from sender.
    db.prepare(`
      UPDATE wallets
      SET
        available_balance = available_balance - ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(numericAmount, sender.id);

    // Credit receiver.
    db.prepare(`
      UPDATE wallets
      SET
        available_balance = available_balance + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(numericAmount, receiver.id);

    // Sender transaction.
    db.prepare(`
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
      VALUES (?, ?, 'u2u_sent', 'completed', ?, 'USD', 'internal', ?, ?)
    `).run(
      sender.id,
      reference,
      numericAmount,
      receiver.username,
      String(purpose).trim()
    );

    // Receiver transaction.
    db.prepare(`
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
      VALUES (?, ?, 'u2u_received', 'completed', ?, 'USD', 'internal', ?, ?)
    `).run(
      receiver.id,
      `${reference}-R`,
      numericAmount,
      sender.username,
      String(purpose).trim()
    );

    // Transfer record.
    db.prepare(`
      INSERT INTO u2u_transfers (
        sender_user_id,
        receiver_user_id,
        reference,
        amount,
        purpose,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'completed')
    `).run(
      sender.id,
      receiver.id,
      reference,
      numericAmount,
      String(purpose).trim()
    );

    // Sender notification.
    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, 'transfer', 'Transfer Sent', ?)
    `).run(
      sender.id,
      `You sent ${numericAmount} USD to ${receiver.username}. Reference: ${reference}`
    );

    // Receiver notification.
    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, 'transfer', 'Funds Received', ?)
    `).run(
      receiver.id,
      `You received ${numericAmount} USD from ${sender.username}. Reference: ${reference}`
    );

    return {
      reference,
      receiver: receiver.username,
      amount: numericAmount
    };
  });

  try {
    const result = transfer();

    return res.status(201).json({
      message: "Transfer completed successfully.",
      ...result
    });

  } catch (error) {
    console.error("U2U transfer error:", error);

    const messages = {
      SENDER_NOT_FOUND: "Sender account not found.",
      SENDER_INACTIVE: "Your account is not active.",
      RECEIVER_NOT_FOUND: "Receiver username was not found.",
      RECEIVER_INACTIVE: "The receiver account is not active.",
      SENDER_WALLET_NOT_FOUND: "Sender wallet not found.",
      INSUFFICIENT_BALANCE: "Insufficient available balance."
    };

    return res.status(400).json({
      message: messages[error.message] || "Unable to complete transfer."
    });
  }
});

// Get user's U2U transfer history
router.get("/history", requireAuth, (req, res) => {
  try {
    const transfers = db.prepare(`
      SELECT
        t.id,
        t.reference,
        t.amount,
        t.purpose,
        t.status,
        t.created_at,
        sender.username AS sender_username,
        receiver.username AS receiver_username
      FROM u2u_transfers t
      INNER JOIN users sender
        ON sender.id = t.sender_user_id
      INNER JOIN users receiver
        ON receiver.id = t.receiver_user_id
      WHERE t.sender_user_id = ?
         OR t.receiver_user_id = ?
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all(
      req.user.userId,
      req.user.userId
    );

    res.json({
      transfers
    });

  } catch (error) {
    console.error("U2U history error:", error);

    res.status(500).json({
      message: "Unable to load transfer history."
    });
  }
});

module.exports = router;