const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Referral statistics
router.get("/stats", (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_referrals,
        SUM(
          CASE
            WHEN status = 'completed' THEN 1
            ELSE 0
          END
        ) AS completed_referrals,
        SUM(
          CASE
            WHEN status = 'pending' THEN 1
            ELSE 0
          END
        ) AS pending_referrals,
        COALESCE(SUM(bonus_amount), 0) AS total_bonus_amount
      FROM referrals
    `).get();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error("Admin referral stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load referral statistics."
    });
  }
});


// List referral records
router.get("/", (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    const referrals = db.prepare(`
      SELECT
        r.id,
        r.referrer_user_id,
        ref.username AS referrer_username,
        ref.email AS referrer_email,
        r.referred_user_id,
        referred.username AS referred_username,
        referred.email AS referred_email,
        r.bonus_rate,
        r.bonus_amount,
        r.status,
        r.created_at
      FROM referrals r
      JOIN users ref
        ON ref.id = r.referrer_user_id
      JOIN users referred
        ON referred.id = r.referred_user_id
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({
      success: true,
      referrals
    });

  } catch (error) {
    console.error("Admin referrals error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load referrals."
    });
  }
});


// Update referral status
router.patch("/:id/status", (req, res) => {
  try {
    const referralId = Number(req.params.id);
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "completed",
      "cancelled"
    ];

    if (!Number.isInteger(referralId) || referralId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid referral ID."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid referral status."
      });
    }

    const referral = db.prepare(`
      SELECT
        r.id,
        r.referrer_user_id,
        r.referred_user_id,
        r.status,
        ref.username AS referrer_username
      FROM referrals r
      JOIN users ref
        ON ref.id = r.referrer_user_id
      WHERE r.id = ?
    `).get(referralId);

    if (!referral) {
      return res.status(404).json({
        success: false,
        message: "Referral record not found."
      });
    }

    db.prepare(`
      UPDATE referrals
      SET status = ?
      WHERE id = ?
    `).run(status, referralId);

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
      "update_referral_status",
      "referral",
      referralId,
      `Changed referral status from "${referral.status}" to "${status}" for referrer ${referral.referrer_username}`
    );

    res.json({
      success: true,
      message: "Referral status updated."
    });

  } catch (error) {
    console.error("Referral status update error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update referral status."
    });
  }
});


module.exports = router;