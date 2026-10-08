const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// Get loan statistics
router.get("/stats", (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_requests,
        SUM(
          CASE
            WHEN status = 'pending' THEN 1
            ELSE 0
          END
        ) AS pending_requests,
        SUM(
          CASE
            WHEN status = 'approved' THEN 1
            ELSE 0
          END
        ) AS approved_requests,
        SUM(
          CASE
            WHEN status = 'rejected' THEN 1
            ELSE 0
          END
        ) AS rejected_requests,
        COALESCE(
          SUM(
            CASE
              WHEN status = 'approved' THEN amount
              ELSE 0
            END
          ),
          0
        ) AS approved_amount
      FROM loan_requests
    `).get();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error("Admin loan stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load loan statistics."
    });
  }
});


// Get all loan requests
router.get("/", (req, res) => {
  try {
    const status = req.query.status;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    let loans;

    if (status) {
      loans = db.prepare(`
        SELECT
          l.id,
          l.user_id,
          u.username,
          u.email,
          u.full_name,
          l.amount,
          l.receiving_method,
          l.wallet_address,
          l.purpose,
          l.status,
          l.created_at,
          l.updated_at
        FROM loan_requests l
        JOIN users u ON u.id = l.user_id
        WHERE l.status = ?
        ORDER BY l.created_at DESC
        LIMIT ?
      `).all(status, limit);
    } else {
      loans = db.prepare(`
        SELECT
          l.id,
          l.user_id,
          u.username,
          u.email,
          u.full_name,
          l.amount,
          l.receiving_method,
          l.wallet_address,
          l.purpose,
          l.status,
          l.created_at,
          l.updated_at
        FROM loan_requests l
        JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC
        LIMIT ?
      `).all(limit);
    }

    res.json({
      success: true,
      loans
    });

  } catch (error) {
    console.error("Admin loans error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load loan requests."
    });
  }
});


// Approve or reject a loan
router.patch("/:id/status", (req, res) => {
  try {
    const loanId = Number(req.params.id);
    const { status, note } = req.body;

    const allowedStatuses = [
      "approved",
      "rejected"
    ];

    if (!Number.isInteger(loanId) || loanId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or rejected."
      });
    }

    const loan = db.prepare(`
      SELECT
        l.id,
        l.user_id,
        l.amount,
        l.status,
        u.username
      FROM loan_requests l
      JOIN users u ON u.id = l.user_id
      WHERE l.id = ?
    `).get(loanId);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan request not found."
      });
    }

    if (loan.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending loan requests can be reviewed."
      });
    }

    db.prepare(`
      UPDATE loan_requests
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, loanId);

    const cleanNote =
      typeof note === "string" && note.trim()
        ? note.trim()
        : "";

    const notificationMessage =
      status === "approved"
        ? `Your loan request for ${loan.amount} has been approved.${cleanNote ? ` Note: ${cleanNote}` : ""}`
        : `Your loan request for ${loan.amount} has been rejected.${cleanNote ? ` Note: ${cleanNote}` : ""}`;

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      loan.user_id,
      "loan",
      status === "approved"
        ? "Loan Request Approved"
        : "Loan Request Rejected",
      notificationMessage
    );

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
      status === "approved"
        ? "approve_loan"
        : "reject_loan",
      "loan",
      loanId,
      `Admin ${status} loan request for ${loan.username}. ${cleanNote}`
    );

    res.json({
      success: true,
      message: `Loan request ${status}.`
    });

  } catch (error) {
    console.error("Loan review error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to review loan request."
    });
  }
});


module.exports = router;