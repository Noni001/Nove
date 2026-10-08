const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

function generateReference(prefix = "CARD") {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

// Submit crypto/debit card request
router.post("/request", requireAuth, async (req, res) => {
  try {
    const {
      nameOnCard,
      cardColor = "black",
      pin
    } = req.body;

    if (!nameOnCard || String(nameOnCard).trim().length < 2) {
      return res.status(400).json({
        message: "Enter the name that should appear on the card."
      });
    }

    const cleanPin = String(pin || "").trim();

    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({
        message: "Card PIN must contain exactly 4 digits."
      });
    }

    const allowedColors = [
      "black",
      "blue",
      "green",
      "silver"
    ];

    const selectedColor = String(cardColor).toLowerCase();

    if (!allowedColors.includes(selectedColor)) {
      return res.status(400).json({
        message: "Select a valid card color."
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

    const existing = db.prepare(`
      SELECT id
      FROM card_requests
      WHERE user_id = ?
        AND status IN ('pending', 'approved')
      LIMIT 1
    `).get(req.user.userId);

    if (existing) {
      return res.status(400).json({
        message: "You already have an active card request."
      });
    }

    // Never store the card PIN as plain text.
    const pinHash = await bcrypt.hash(cleanPin, 12);

    const insert = db.prepare(`
      INSERT INTO card_requests (
        user_id,
        name_on_card,
        card_color,
        pin_hash,
        status
      )
      VALUES (?, ?, ?, ?, 'pending')
    `);

    insert.run(
      req.user.userId,
      String(nameOnCard).trim(),
      selectedColor,
      pinHash
    );

    const reference = generateReference();

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, 'card', 'Card Request Submitted', ?)
    `).run(
      req.user.userId,
      `Your card request has been submitted for review. Reference: ${reference}`
    );

    res.status(201).json({
      message: "Card request submitted successfully.",
      reference,
      status: "pending"
    });

  } catch (error) {
    console.error("Card request error:", error);

    res.status(500).json({
      message: "Unable to submit card request."
    });
  }
});

// Get current user's card requests
router.get("/requests", requireAuth, (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT
        id,
        name_on_card,
        card_color,
        status,
        created_at,
        updated_at
      FROM card_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.userId);

    res.json({
      requests
    });

  } catch (error) {
    console.error("Get card requests error:", error);

    res.status(500).json({
      message: "Unable to load card requests."
    });
  }
});

module.exports = router;