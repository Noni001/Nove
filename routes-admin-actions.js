const express = require("express");

const db = require("./db");
const { requireAuth, requireAdmin } = require("./auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    ""
  );
}

function audit(req, action, targetType, targetId, description) {
  db.prepare(`
    INSERT INTO audit_logs (
      admin_user_id,
      action,
      target_type,
      target_id,
      description,
      ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user.userId,
    action,
    targetType,
    targetId,
    description,
    getClientIp(req)
  );
}

// Review a deposit
router.patch("/transactions/:id/deposit", (req, res) => {
  try {
    const { status, reviewNote = "" } = req.body;

    if (!["completed", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be completed or rejected."
      });
    }

    const processDeposit = db.transaction(() => {
      const transaction = db.prepare(`
        SELECT *
        FROM transactions
        WHERE id = ?
          AND type = 'deposit'
      `).get(req.params.id);

      if (!transaction) {
        throw new Error("TRANSACTION_NOT_FOUND");
      }

      if (transaction.status !== "pending") {
        throw new Error("ALREADY_REVIEWED");
      }

      db.prepare(`
        UPDATE transactions
        SET
          status = ?,
          description = CASE
            WHEN ? <> ''
            THEN description || ' | Review: ' || ?
            ELSE description
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        String(reviewNote).trim(),
        String(reviewNote).trim(),
        transaction.id
      );

      if (status === "completed") {
        db.prepare(`
          UPDATE wallets
          SET
            available_balance = available_balance + ?,
            total_deposit = total_deposit + ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(
          transaction.amount,
          transaction.amount,
          transaction.user_id
        );
      }

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, 'deposit', ?, ?)
      `).run(
        transaction.user_id,
        status === "completed"
          ? "Deposit Approved"
          : "Deposit Rejected",
        status === "completed"
          ? `Your deposit of ${transaction.amount} ${transaction.currency} has been approved.`
          : `Your deposit request of ${transaction.amount} ${transaction.currency} was rejected.`
      );

      audit(
        req,
        status === "completed"
          ? "deposit_approved"
          : "deposit_rejected",
        "transaction",
        transaction.id,
        `Deposit ${status}. Reference: ${transaction.reference}. ${reviewNote}`
      );

      return transaction.reference;
    });

    const reference = processDeposit();

    res.json({
      message:
        status === "completed"
          ? "Deposit approved successfully."
          : "Deposit rejected successfully.",
      reference,
      status
    });

  } catch (error) {
    console.error("Deposit review error:", error);

    const messages = {
      TRANSACTION_NOT_FOUND: "Deposit transaction not found.",
      ALREADY_REVIEWED: "This deposit has already been reviewed."
    };

    res.status(400).json({
      message:
        messages[error.message] ||
        "Unable to review deposit."
    });
  }
});

// Review a withdrawal
router.patch("/transactions/:id/withdrawal", (req, res) => {
  try {
    const { status, reviewNote = "" } = req.body;

    if (!["completed", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be completed or rejected."
      });
    }

    const processWithdrawal = db.transaction(() => {
      const transaction = db.prepare(`
        SELECT *
        FROM transactions
        WHERE id = ?
          AND type = 'withdrawal'
      `).get(req.params.id);

      if (!transaction) {
        throw new Error("TRANSACTION_NOT_FOUND");
      }

      if (transaction.status !== "pending") {
        throw new Error("ALREADY_REVIEWED");
      }

      const wallet = db.prepare(`
        SELECT available_balance
        FROM wallets
        WHERE user_id = ?
      `).get(transaction.user_id);

      if (!wallet) {
        throw new Error("WALLET_NOT_FOUND");
      }

      if (
        status === "completed" &&
        Number(wallet.available_balance) < Number(transaction.amount)
      ) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      db.prepare(`
        UPDATE transactions
        SET
          status = ?,
          description = CASE
            WHEN ? <> ''
            THEN description || ' | Review: ' || ?
            ELSE description
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        String(reviewNote).trim(),
        String(reviewNote).trim(),
        transaction.id
      );

      if (status === "completed") {
        db.prepare(`
          UPDATE wallets
          SET
            available_balance = available_balance - ?,
            total_withdrawal = total_withdrawal + ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(
          transaction.amount,
          transaction.amount,
          transaction.user_id
        );
      }

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, 'withdrawal', ?, ?)
      `).run(
        transaction.user_id,
        status === "completed"
          ? "Withdrawal Approved"
          : "Withdrawal Rejected",
        status === "completed"
          ? `Your withdrawal of ${transaction.amount} ${transaction.currency} has been approved.`
          : `Your withdrawal request of ${transaction.amount} ${transaction.currency} was rejected.`
      );

      audit(
        req,
        status === "completed"
          ? "withdrawal_approved"
          : "withdrawal_rejected",
        "transaction",
        transaction.id,
        `Withdrawal ${status}. Reference: ${transaction.reference}. ${reviewNote}`
      );

      return transaction.reference;
    });

    const reference = processWithdrawal();

    res.json({
      message:
        status === "completed"
          ? "Withdrawal approved successfully."
          : "Withdrawal rejected successfully.",
      reference,
      status
    });

  } catch (error) {
    console.error("Withdrawal review error:", error);

    const messages = {
      TRANSACTION_NOT_FOUND: "Withdrawal transaction not found.",
      ALREADY_REVIEWED: "This withdrawal has already been reviewed.",
      WALLET_NOT_FOUND: "User wallet not found.",
      INSUFFICIENT_BALANCE:
        "The user's available balance is no longer sufficient."
    };

    res.status(400).json({
      message:
        messages[error.message] ||
        "Unable to review withdrawal."
    });
  }
});

// Review KYC
router.patch("/kyc/:id", (req, res) => {
  try {
    const { status, reviewNote = "" } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be approved or rejected."
      });
    }

    const reviewKyc = db.transaction(() => {
      const submission = db.prepare(`
        SELECT *
        FROM kyc_submissions
        WHERE id = ?
      `).get(req.params.id);

      if (!submission) {
        throw new Error("KYC_NOT_FOUND");
      }

      if (submission.status !== "pending") {
        throw new Error("KYC_ALREADY_REVIEWED");
      }

      db.prepare(`
        UPDATE kyc_submissions
        SET
          status = ?,
          review_note = ?,
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        String(reviewNote).trim(),
        req.user.userId,
        submission.id
      );

      db.prepare(`
        UPDATE users
        SET
          kyc_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        submission.user_id
      );

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, 'kyc', ?, ?)
      `).run(
        submission.user_id,
        status === "approved"
          ? "KYC Approved"
          : "KYC Rejected",
        status === "approved"
          ? "Your identity verification has been approved."
          : `Your identity verification was rejected. ${String(reviewNote).trim()}`
      );

      audit(
        req,
        `kyc_${status}`,
        "kyc_submission",
        submission.id,
        `KYC ${status}. ${reviewNote}`
      );
    });

    reviewKyc();

    res.json({
      message:
        status === "approved"
          ? "KYC approved successfully."
          : "KYC rejected successfully.",
      status
    });

  } catch (error) {
    console.error("KYC review error:", error);

    const messages = {
      KYC_NOT_FOUND: "KYC submission not found.",
      KYC_ALREADY_REVIEWED:
        "This KYC submission has already been reviewed."
    };

    res.status(400).json({
      message:
        messages[error.message] ||
        "Unable to review KYC."
    });
  }
});

// Review loan request
router.patch("/loans/:id", (req, res) => {
  try {
    const { status, reviewNote = "" } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be approved or rejected."
      });
    }

    const reviewLoan = db.transaction(() => {
      const loan = db.prepare(`
        SELECT *
        FROM loan_requests
        WHERE id = ?
      `).get(req.params.id);

      if (!loan) {
        throw new Error("LOAN_NOT_FOUND");
      }

      if (loan.status !== "pending") {
        throw new Error("LOAN_ALREADY_REVIEWED");
      }

      db.prepare(`
        UPDATE loan_requests
        SET
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        loan.id
      );

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, 'loan', ?, ?)
      `).run(
        loan.user_id,
        status === "approved"
          ? "Loan Request Approved"
          : "Loan Request Rejected",
        status === "approved"
          ? `Your loan request of ${loan.amount} has been approved for further processing.`
          : `Your loan request of ${loan.amount} was rejected. ${String(reviewNote).trim()}`
      );

      audit(
        req,
        `loan_${status}`,
        "loan_request",
        loan.id,
        `Loan ${status}. ${reviewNote}`
      );
    });

    reviewLoan();

    res.json({
      message:
        status === "approved"
          ? "Loan request approved."
          : "Loan request rejected.",
      status
    });

  } catch (error) {
    console.error("Loan review error:", error);

    const messages = {
      LOAN_NOT_FOUND: "Loan request not found.",
      LOAN_ALREADY_REVIEWED:
        "This loan request has already been reviewed."
    };

    res.status(400).json({
      message:
        messages[error.message] ||
        "Unable to review loan request."
    });
  }
});

// Review card request
router.patch("/cards/:id", (req, res) => {
  try {
    const { status, reviewNote = "" } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be approved or rejected."
      });
    }

    const reviewCard = db.transaction(() => {
      const card = db.prepare(`
        SELECT *
        FROM card_requests
        WHERE id = ?
      `).get(req.params.id);

      if (!card) {
        throw new Error("CARD_NOT_FOUND");
      }

      if (card.status !== "pending") {
        throw new Error("CARD_ALREADY_REVIEWED");
      }

      db.prepare(`
        UPDATE card_requests
        SET
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        card.id
      );

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, 'card', ?, ?)
      `).run(
        card.user_id,
        status === "approved"
          ? "Card Request Approved"
          : "Card Request Rejected",
        status === "approved"
          ? "Your card request has been approved."
          : `Your card request was rejected. ${String(reviewNote).trim()}`
      );

      audit(
        req,
        `card_${status}`,
        "card_request",
        card.id,
        `Card ${status}. ${reviewNote}`
      );
    });

    reviewCard();

    res.json({
      message:
        status === "approved"
          ? "Card request approved."
          : "Card request rejected.",
      status
    });

  } catch (error) {
    console.error("Card review error:", error);

    const messages = {
      CARD_NOT_FOUND: "Card request not found.",
      CARD_ALREADY_REVIEWED:
        "This card request has already been reviewed."
    };

    res.status(400).json({
      message:
        messages[error.message] ||
        "Unable to review card request."
    });
  }
});

module.exports = router;