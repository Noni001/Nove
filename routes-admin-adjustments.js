const express = require("express");
const crypto = require("crypto");

const db = require("./db");
const { requireAuth, requireAdmin } = require("./auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

const ALLOWED_TYPES = [
  "promotional_credit",
  "demo_credit",
  "bonus",
  "refund",
  "administrative_adjustment"
];

function generateReference() {
  return `ADJ-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    ""
  );
}

// Create an account adjustment
router.post("/", (req, res) => {
  try {
    const {
      userId,
      adjustmentType,
      amount,
      reason
    } = req.body;

    const numericAmount = Number(amount);

    if (!userId) {
      return res.status(400).json({
        message: "User ID is required."
      });
    }

    if (!ALLOWED_TYPES.includes(adjustmentType)) {
      return res.status(400).json({
        message: "Invalid adjustment type."
      });
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: "Enter a valid adjustment amount."
      });
    }

    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({
        message: "A clear adjustment reason is required."
      });
    }

    const createAdjustment = db.transaction(() => {
      const user = db.prepare(`
        SELECT
          id,
          username,
          account_status
        FROM users
        WHERE id = ?
          AND role = 'user'
      `).get(userId);

      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      if (user.account_status !== "active") {
        throw new Error("USER_INACTIVE");
      }

      const wallet = db.prepare(`
        SELECT *
        FROM wallets
        WHERE user_id = ?
      `).get(user.id);

      if (!wallet) {
        throw new Error("WALLET_NOT_FOUND");
      }

      const reference = generateReference();

      let walletColumn;

      switch (adjustmentType) {
        case "promotional_credit":
          walletColumn = "promotional_credit";
          break;

        case "demo_credit":
          walletColumn = "demo_credit";
          break;

        case "bonus":
          walletColumn = "bonus_balance";
          break;

        case "refund":
        case "administrative_adjustment":
          walletColumn = "available_balance";
          break;
      }

      db.prepare(`
        UPDATE wallets
        SET
          ${walletColumn} = ${walletColumn} + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        numericAmount,
        user.id
      );

      db.prepare(`
        INSERT INTO account_adjustments (
          user_id,
          admin_user_id,
          adjustment_type,
          amount,
          reason,
          reference
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        req.user.userId,
        adjustmentType,
        numericAmount,
        String(reason).trim(),
        reference
      );

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, 'account_adjustment', 'Account Adjustment', ?)
      `).run(
        user.id,
        `${numericAmount} USD was added to your account as ${adjustmentType.replaceAll("_", " ")}. Reference: ${reference}. Reason: ${String(reason).trim()}`
      );

      db.prepare(`
        INSERT INTO audit_logs (
          admin_user_id,
          action,
          target_type,
          target_id,
          description,
          ip_address
        )
        VALUES (?, 'account_adjustment', 'user', ?, ?, ?)
      `).run(
        req.user.userId,
        user.id,
        `${adjustmentType} adjustment of ${numericAmount} USD. Reason: ${String(reason).trim()}. Reference: ${reference}`,
        getClientIp(req)
      );

      return {
        reference,
        username: user.username,
        adjustmentType,
        amount: numericAmount
      };
    });

    const result = createAdjustment();

    res.status(201).json({
      message: "Account adjustment created successfully.",
      ...result
    });

  } catch (error) {
    console.error("Account adjustment error:", error);

    const messages = {
      USER_NOT_FOUND: "User not found.",
      USER_INACTIVE: "User account is not active.",
      WALLET_NOT_FOUND: "User wallet not found."
    };

    res.status(400).json({
      message:
        messages[error.message] ||
        "Unable to create account adjustment."
    });
  }
});

// Get adjustment history
router.get("/", (req, res) => {
  try {
    const adjustments = db.prepare(`
      SELECT
        a.id,
        a.user_id,
        a.admin_user_id,
        a.adjustment_type,
        a.amount,
        a.reason,
        a.reference,
        a.created_at,

        u.username,
        u.full_name,

        admin.username AS admin_username

      FROM account_adjustments a

      INNER JOIN users u
        ON u.id = a.user_id

      INNER JOIN users admin
        ON admin.id = a.admin_user_id

      ORDER BY a.created_at DESC

      LIMIT 200
    `).all();

    res.json({
      adjustments
    });

  } catch (error) {
    console.error("Adjustment history error:", error);

    res.status(500).json({
      message: "Unable to load adjustment history."
    });
  }
});

module.exports = router;