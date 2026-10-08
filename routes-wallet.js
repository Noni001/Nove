const express = require("express");
const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();


/* =========================
   GET WALLET
========================= */

router.get("/", requireAuth, (req, res) => {

  try {

    const wallet = db.prepare(`
      SELECT
        id,
        available_balance,
        promotional_credit,
        demo_credit,
        bonus_balance,
        total_deposit,
        total_withdrawal,
        created_at,
        updated_at
      FROM wallets
      WHERE user_id = ?
      LIMIT 1
    `).get(req.user.userId);


    if (!wallet) {

      return res.status(404).json({
        success: false,
        message: "Wallet not found."
      });

    }


    return res.json({

      success: true,

      wallet

    });

  } catch (error) {

    console.error(
      "Wallet error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve wallet."
    });

  }

});


/* =========================
   GET WALLET SUMMARY
========================= */

router.get(
  "/summary",
  requireAuth,
  (req, res) => {

    try {

      const wallet = db.prepare(`
        SELECT
          available_balance,
          promotional_credit,
          demo_credit,
          bonus_balance,
          total_deposit,
          total_withdrawal
        FROM wallets
        WHERE user_id = ?
        LIMIT 1
      `).get(req.user.userId);


      const pendingDeposits = db.prepare(`
        SELECT
          COALESCE(SUM(amount), 0) AS amount
        FROM transactions
        WHERE user_id = ?
        AND type = 'deposit'
        AND status = 'pending'
      `).get(req.user.userId);


      const pendingWithdrawals = db.prepare(`
        SELECT
          COALESCE(SUM(amount), 0) AS amount
        FROM transactions
        WHERE user_id = ?
        AND type = 'withdrawal'
        AND status = 'pending'
      `).get(req.user.userId);


      return res.json({

        success: true,

        wallet: wallet || {
          available_balance: 0,
          promotional_credit: 0,
          demo_credit: 0,
          bonus_balance: 0,
          total_deposit: 0,
          total_withdrawal: 0
        },

        pending: {
          deposits: pendingDeposits.amount,
          withdrawals: pendingWithdrawals.amount
        }

      });

    } catch (error) {

      console.error(
        "Wallet summary error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve wallet summary."
      });

    }

  }
);


/* =========================
   WALLET TRANSACTIONS
========================= */

router.get(
  "/transactions",
  requireAuth,
  (req, res) => {

    try {

      const limit =
        Math.min(
          Math.max(
            Number(req.query.limit) || 50,
            1
          ),
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
      `).all(
        req.user.userId,
        limit
      );


      return res.json({

        success: true,

        transactions

      });

    } catch (error) {

      console.error(
        "Wallet transactions error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve wallet transactions."
      });

    }

  }
);


/* =========================
   BALANCE CHECK
========================= */

router.get(
  "/balance",
  requireAuth,
  (req, res) => {

    try {

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
          success: false,
          message:
            "Wallet not found."
        });

      }


      return res.json({

        success: true,

        balance: {

          available:
            Number(wallet.available_balance),

          promotional:
            Number(wallet.promotional_credit),

          demo:
            Number(wallet.demo_credit),

          bonus:
            Number(wallet.bonus_balance)

        }

      });

    } catch (error) {

      console.error(
        "Balance error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve balance."
      });

    }

  }
);


module.exports = router;