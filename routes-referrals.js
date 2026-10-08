const express = require("express");
const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

// Get referral overview
router.get("/", requireAuth, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT
        id,
        referral_code
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User account not found."
      });
    }

    const referrals = db.prepare(`
      SELECT
        r.id,
        r.referred_user_id,
        r.bonus_rate,
        r.bonus_amount,
        r.status,
        r.created_at,
        u.username,
        u.full_name,
        u.created_at AS joined_at
      FROM referrals r
      INNER JOIN users u
        ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = ?
      ORDER BY r.created_at DESC
      LIMIT 100
    `).all(req.user.userId);

    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total_referrals,
        COALESCE(SUM(
          CASE
            WHEN status = 'completed'
            THEN bonus_amount
            ELSE 0
          END
        ), 0) AS total_bonus
      FROM referrals
      WHERE referrer_user_id = ?
    `).get(req.user.userId);

    res.json({
      referralCode: user.referral_code,
      referralLink:
        `/register.html?ref=${encodeURIComponent(user.referral_code)}`,
      totalReferrals: Number(totals.total_referrals || 0),
      totalBonus: Number(totals.total_bonus || 0),
      referrals
    });

  } catch (error) {
    console.error("Referral overview error:", error);

    res.status(500).json({
      message: "Unable to load referral information."
    });
  }
});

// Get referral code
router.get("/code", requireAuth, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT referral_code
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User account not found."
      });
    }

    res.json({
      referralCode: user.referral_code,
      referralLink:
        `/register.html?ref=${encodeURIComponent(user.referral_code)}`
    });

  } catch (error) {
    console.error("Referral code error:", error);

    res.status(500).json({
      message: "Unable to load referral code."
    });
  }
});

module.exports = router;