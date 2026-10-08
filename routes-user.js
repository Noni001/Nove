const express = require("express");
const db = require("./db");

const {
  requireAuth
} = require("./auth");

const router = express.Router();


/* =========================
   GET CURRENT USER
========================= */

router.get("/me", requireAuth, (req, res) => {

  try {

    const user = db.prepare(`
      SELECT
        id,
        full_name,
        username,
        email,
        phone,
        account_status,
        account_type,
        kyc_status,
        referral_code,
        referred_by,
        two_factor_enabled,
        created_at,
        updated_at,
        last_login_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(req.user.userId);


    if (!user) {

      return res.status(404).json({
        success: false,
        message: "User account not found."
      });

    }


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


    const transactionStats = db.prepare(`
      SELECT
        COUNT(*) AS total_transactions,

        COALESCE(
          SUM(
            CASE
              WHEN type = 'deposit'
              AND status = 'completed'
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS completed_deposits,

        COALESCE(
          SUM(
            CASE
              WHEN type = 'withdrawal'
              AND status = 'completed'
              THEN amount
              ELSE 0
            END
          ),
          0
        ) AS completed_withdrawals

      FROM transactions
      WHERE user_id = ?
    `).get(req.user.userId);


    return res.json({

      success: true,

      user,

      wallet: wallet || {
        available_balance: 0,
        promotional_credit: 0,
        demo_credit: 0,
        bonus_balance: 0,
        total_deposit: 0,
        total_withdrawal: 0
      },

      statistics: transactionStats

    });

  } catch (error) {

    console.error(
      "Get user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve account information."
    });

  }

});


/* =========================
   UPDATE PROFILE
========================= */

router.put("/profile", requireAuth, (req, res) => {

  try {

    const fullName =
      String(req.body.fullName || "").trim();

    const phone =
      String(req.body.phone || "").trim();


    if (!fullName) {

      return res.status(400).json({
        success: false,
        message:
          "Full name is required."
      });

    }


    if (fullName.length > 100) {

      return res.status(400).json({
        success: false,
        message:
          "Full name is too long."
      });

    }


    if (phone.length > 30) {

      return res.status(400).json({
        success: false,
        message:
          "Phone number is too long."
      });

    }


    db.prepare(`
      UPDATE users
      SET
        full_name = ?,
        phone = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      fullName,
      phone,
      req.user.userId
    );


    const updatedUser = db.prepare(`
      SELECT
        id,
        full_name,
        username,
        email,
        phone,
        account_status,
        account_type,
        kyc_status,
        referral_code,
        created_at
      FROM users
      WHERE id = ?
    `).get(req.user.userId);


    return res.json({

      success: true,

      message:
        "Profile updated successfully.",

      user: updatedUser

    });

  } catch (error) {

    console.error(
      "Profile update error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update profile."
    });

  }

});


/* =========================
   CHANGE PASSWORD
========================= */

router.put(
  "/change-password",
  requireAuth,
  async (req, res) => {

    try {

      const {
        comparePassword,
        hashPassword
      } = require("./auth");


      const currentPassword =
        String(
          req.body.currentPassword || ""
        );

      const newPassword =
        String(
          req.body.newPassword || ""
        );

      const confirmPassword =
        String(
          req.body.confirmPassword || ""
        );


      if (!currentPassword) {

        return res.status(400).json({
          success: false,
          message:
            "Current password is required."
        });

      }


      if (newPassword.length < 8) {

        return res.status(400).json({
          success: false,
          message:
            "New password must contain at least 8 characters."
        });

      }


      if (newPassword !== confirmPassword) {

        return res.status(400).json({
          success: false,
          message:
            "New passwords do not match."
        });

      }


      const user = db.prepare(`
        SELECT password_hash
        FROM users
        WHERE id = ?
      `).get(req.user.userId);


      if (!user) {

        return res.status(404).json({
          success: false,
          message:
            "User account not found."
        });

      }


      const valid =
        await comparePassword(
          currentPassword,
          user.password_hash
        );


      if (!valid) {

        return res.status(401).json({
          success: false,
          message:
            "Current password is incorrect."
        });

      }


      const newHash =
        await hashPassword(
          newPassword
        );


      db.prepare(`
        UPDATE users
        SET
          password_hash = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        newHash,
        req.user.userId
      );


      return res.json({

        success: true,

        message:
          "Password changed successfully. Please log in again."

      });

    } catch (error) {

      console.error(
        "Change password error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to change password."
      });

    }

  }
);


/* =========================
   USER NOTIFICATIONS
========================= */

router.get(
  "/notifications",
  requireAuth,
  (req, res) => {

    try {

      const notifications = db.prepare(`
        SELECT
          id,
          type,
          title,
          message,
          is_read,
          created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `).all(req.user.userId);


      const unread = db.prepare(`
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE user_id = ?
        AND is_read = 0
      `).get(req.user.userId);


      return res.json({

        success: true,

        unread: unread.count,

        notifications

      });

    } catch (error) {

      console.error(
        "Notification error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve notifications."
      });

    }

  }
);


/* =========================
   MARK NOTIFICATION READ
========================= */

router.patch(
  "/notifications/:id/read",
  requireAuth,
  (req, res) => {

    try {

      const notificationId =
        Number(req.params.id);


      if (!Number.isInteger(notificationId)) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid notification ID."
        });

      }


      const result = db.prepare(`
        UPDATE notifications
        SET is_read = 1
        WHERE id = ?
        AND user_id = ?
      `).run(
        notificationId,
        req.user.userId
      );


      if (result.changes === 0) {

        return res.status(404).json({
          success: false,
          message:
            "Notification not found."
        });

      }


      return res.json({

        success: true,

        message:
          "Notification marked as read."

      });

    } catch (error) {

      console.error(
        "Mark notification error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update notification."
      });

    }

  }
);


/* =========================
   DELETE ACCOUNT REQUEST
========================= */

router.post(
  "/request-deletion",
  requireAuth,
  (req, res) => {

    try {

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, ?, ?, ?)
      `).run(
        req.user.userId,
        "account",
        "Account deletion request received",
        "Your account deletion request has been received and will require administrator review."
      );


      return res.json({

        success: true,

        message:
          "Account deletion request submitted for review."

      });

    } catch (error) {

      console.error(
        "Deletion request error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to submit deletion request."
      });

    }

  }
);


module.exports = router;