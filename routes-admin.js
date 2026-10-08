const express = require("express");

const db = require("./db");
const { requireAuth, requireAdmin } = require("./auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

// Admin dashboard statistics
router.get("/stats", (req, res) => {
  try {
    const users = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'user'
    `).get();

    const activeUsers = db.prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'user'
        AND account_status = 'active'
    `).get();

    const pendingKyc = db.prepare(`
      SELECT COUNT(*) AS count
      FROM kyc_submissions
      WHERE status = 'pending'
    `).get();

    const pendingDeposits = db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS amount
      FROM transactions
      WHERE type = 'deposit'
        AND status = 'pending'
    `).get();

    const pendingWithdrawals = db.prepare(`
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS amount
      FROM transactions
      WHERE type = 'withdrawal'
        AND status = 'pending'
    `).get();

    const pendingLoans = db.prepare(`
      SELECT COUNT(*) AS count
      FROM loan_requests
      WHERE status = 'pending'
    `).get();

    const pendingCards = db.prepare(`
      SELECT COUNT(*) AS count
      FROM card_requests
      WHERE status = 'pending'
    `).get();

    const completedDeposits = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM transactions
      WHERE type = 'deposit'
        AND status = 'completed'
    `).get();

    const completedWithdrawals = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM transactions
      WHERE type = 'withdrawal'
        AND status = 'completed'
    `).get();

    res.json({
      users: Number(users.count || 0),
      activeUsers: Number(activeUsers.count || 0),

      pendingKyc: Number(pendingKyc.count || 0),

      pendingDeposits: {
        count: Number(pendingDeposits.count || 0),
        amount: Number(pendingDeposits.amount || 0)
      },

      pendingWithdrawals: {
        count: Number(pendingWithdrawals.count || 0),
        amount: Number(pendingWithdrawals.amount || 0)
      },

      pendingLoans: Number(pendingLoans.count || 0),
      pendingCards: Number(pendingCards.count || 0),

      completedDeposits: Number(
        completedDeposits.amount || 0
      ),

      completedWithdrawals: Number(
        completedWithdrawals.amount || 0
      )
    });

  } catch (error) {
    console.error("Admin stats error:", error);

    res.status(500).json({
      message: "Unable to load admin statistics."
    });
  }
});

// List users
router.get("/users", (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 100);

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit) ? requestedLimit : 100,
        1
      ),
      200
    );

    const users = db.prepare(`
      SELECT
        u.id,
        u.full_name,
        u.username,
        u.email,
        u.phone,
        u.account_status,
        u.account_type,
        u.kyc_status,
        u.referral_code,
        u.created_at,
        u.updated_at,

        w.available_balance,
        w.promotional_credit,
        w.demo_credit,
        w.bonus_balance,
        w.total_deposit,
        w.total_withdrawal

      FROM users u

      LEFT JOIN wallets w
        ON w.user_id = u.id

      WHERE u.role = 'user'

      ORDER BY u.created_at DESC

      LIMIT ?
    `).all(limit);

    res.json({
      users
    });

  } catch (error) {
    console.error("Admin users error:", error);

    res.status(500).json({
      message: "Unable to load users."
    });
  }
});

// Get one user
router.get("/users/:id", (req, res) => {
  try {
    const user = db.prepare(`
      SELECT
        u.id,
        u.full_name,
        u.username,
        u.email,
        u.phone,
        u.account_status,
        u.account_type,
        u.kyc_status,
        u.referral_code,
        u.referred_by,
        u.created_at,
        u.updated_at,

        w.available_balance,
        w.promotional_credit,
        w.demo_credit,
        w.bonus_balance,
        w.total_deposit,
        w.total_withdrawal

      FROM users u

      LEFT JOIN wallets w
        ON w.user_id = u.id

      WHERE u.id = ?
        AND u.role = 'user'
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    res.json({
      user
    });

  } catch (error) {
    console.error("Admin user detail error:", error);

    res.status(500).json({
      message: "Unable to load user."
    });
  }
});

// List transactions
router.get("/transactions", (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 100);

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit) ? requestedLimit : 100,
        1
      ),
      200
    );

    const transactions = db.prepare(`
      SELECT
        t.id,
        t.reference,
        t.user_id,
        t.type,
        t.status,
        t.amount,
        t.currency,
        t.payment_method,
        t.destination,
        t.description,
        t.created_at,
        t.updated_at,

        u.username,
        u.full_name,
        u.email

      FROM transactions t

      INNER JOIN users u
        ON u.id = t.user_id

      ORDER BY t.created_at DESC

      LIMIT ?
    `).all(limit);

    res.json({
      transactions
    });

  } catch (error) {
    console.error("Admin transactions error:", error);

    res.status(500).json({
      message: "Unable to load transactions."
    });
  }
});

// List pending KYC submissions
router.get("/kyc", (req, res) => {
  try {
    const submissions = db.prepare(`
      SELECT
        k.id,
        k.user_id,
        k.full_name,
        k.government_id_path,
        k.passport_path,
        k.status,
        k.review_note,
        k.reviewed_by,
        k.submitted_at,
        k.reviewed_at,

        u.username,
        u.email

      FROM kyc_submissions k

      INNER JOIN users u
        ON u.id = k.user_id

      ORDER BY k.submitted_at DESC

      LIMIT 200
    `).all();

    res.json({
      submissions
    });

  } catch (error) {
    console.error("Admin KYC error:", error);

    res.status(500).json({
      message: "Unable to load KYC submissions."
    });
  }
});

// List loan requests
router.get("/loans", (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT
        l.id,
        l.user_id,
        l.amount,
        l.receiving_method,
        l.wallet_address,
        l.purpose,
        l.status,
        l.created_at,
        l.updated_at,

        u.username,
        u.full_name,
        u.email

      FROM loan_requests l

      INNER JOIN users u
        ON u.id = l.user_id

      ORDER BY l.created_at DESC

      LIMIT 200
    `).all();

    res.json({
      requests
    });

  } catch (error) {
    console.error("Admin loans error:", error);

    res.status(500).json({
      message: "Unable to load loan requests."
    });
  }
});

// List card requests
router.get("/cards", (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT
        c.id,
        c.user_id,
        c.name_on_card,
        c.card_color,
        c.status,
        c.created_at,
        c.updated_at,

        u.username,
        u.full_name,
        u.email

      FROM card_requests c

      INNER JOIN users u
        ON u.id = c.user_id

      ORDER BY c.created_at DESC

      LIMIT 200
    `).all();

    res.json({
      requests
    });

  } catch (error) {
    console.error("Admin cards error:", error);

    res.status(500).json({
      message: "Unable to load card requests."
    });
  }
});

// Get audit logs
router.get("/audit-logs", (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 100);

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit) ? requestedLimit : 100,
        1
      ),
      200
    );

    const logs = db.prepare(`
      SELECT
        a.id,
        a.action,
        a.target_type,
        a.target_id,
        a.description,
        a.ip_address,
        a.created_at,

        u.username AS admin_username

      FROM audit_logs a

      LEFT JOIN users u
        ON u.id = a.admin_user_id

      ORDER BY a.created_at DESC

      LIMIT ?
    `).all(limit);

    res.json({
      logs
    });

  } catch (error) {
    console.error("Admin audit logs error:", error);

    res.status(500).json({
      message: "Unable to load audit logs."
    });
  }
});

module.exports = router;