const express = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const db = require("./db");

const router = express.Router();

router.use(requireAuth, requireAdmin);


// KYC statistics
router.get("/stats", (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) AS total_submissions,
        SUM(
          CASE
            WHEN status = 'pending' THEN 1
            ELSE 0
          END
        ) AS pending_submissions,
        SUM(
          CASE
            WHEN status = 'approved' THEN 1
            ELSE 0
          END
        ) AS approved_submissions,
        SUM(
          CASE
            WHEN status = 'rejected' THEN 1
            ELSE 0
          END
        ) AS rejected_submissions
      FROM kyc_submissions
    `).get();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error("Admin KYC stats error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load KYC statistics."
    });
  }
});


// Get KYC submissions
router.get("/", (req, res) => {
  try {
    const status = req.query.status;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500
    );

    let submissions;

    if (status) {
      submissions = db.prepare(`
        SELECT
          k.id,
          k.user_id,
          u.username,
          u.email,
          k.full_name,
          k.government_id_path,
          k.passport_path,
          k.status,
          k.review_note,
          k.reviewed_by,
          k.submitted_at,
          k.reviewed_at
        FROM kyc_submissions k
        JOIN users u ON u.id = k.user_id
        WHERE k.status = ?
        ORDER BY k.submitted_at DESC
        LIMIT ?
      `).all(status, limit);
    } else {
      submissions = db.prepare(`
        SELECT
          k.id,
          k.user_id,
          u.username,
          u.email,
          k.full_name,
          k.government_id_path,
          k.passport_path,
          k.status,
          k.review_note,
          k.reviewed_by,
          k.submitted_at,
          k.reviewed_at
        FROM kyc_submissions k
        JOIN users u ON u.id = k.user_id
        ORDER BY k.submitted_at DESC
        LIMIT ?
      `).all(limit);
    }

    res.json({
      success: true,
      submissions
    });

  } catch (error) {
    console.error("Admin KYC list error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load KYC submissions."
    });
  }
});


// Get one KYC submission
router.get("/:id", (req, res) => {
  try {
    const kycId = Number(req.params.id);

    if (!Number.isInteger(kycId) || kycId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid KYC ID."
      });
    }

    const submission = db.prepare(`
      SELECT
        k.id,
        k.user_id,
        u.username,
        u.email,
        u.phone,
        k.full_name,
        k.government_id_path,
        k.passport_path,
        k.status,
        k.review_note,
        k.reviewed_by,
        k.submitted_at,
        k.reviewed_at
      FROM kyc_submissions k
      JOIN users u ON u.id = k.user_id
      WHERE k.id = ?
    `).get(kycId);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "KYC submission not found."
      });
    }

    res.json({
      success: true,
      submission
    });

  } catch (error) {
    console.error("Admin KYC detail error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load KYC submission."
    });
  }
});


// Approve or reject KYC
router.patch("/:id/status", (req, res) => {
  try {
    const kycId = Number(req.params.id);
    const { status, note } = req.body;

    const allowedStatuses = [
      "approved",
      "rejected"
    ];

    if (!Number.isInteger(kycId) || kycId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid KYC ID."
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or rejected."
      });
    }

    const submission = db.prepare(`
      SELECT
        k.id,
        k.user_id,
        k.status,
        u.username
      FROM kyc_submissions k
      JOIN users u ON u.id = k.user_id
      WHERE k.id = ?
    `).get(kycId);

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "KYC submission not found."
      });
    }

    if (submission.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending KYC submissions can be reviewed."
      });
    }

    const cleanNote =
      typeof note === "string" && note.trim()
        ? note.trim()
        : "";

    const reviewKyc = db.transaction(() => {

      db.prepare(`
        UPDATE kyc_submissions
        SET status = ?,
            review_note = ?,
            reviewed_by = ?,
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        status,
        cleanNote || null,
        req.user.userId,
        kycId
      );

      db.prepare(`
        UPDATE users
        SET kyc_status = ?,
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
        VALUES (?, ?, ?, ?)
      `).run(
        submission.user_id,
        "kyc",
        status === "approved"
          ? "KYC Verification Approved"
          : "KYC Verification Rejected",
        status === "approved"
          ? "Your identity verification has been approved."
          : `Your identity verification has been rejected.${cleanNote ? ` Reason: ${cleanNote}` : ""}`
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
          ? "approve_kyc"
          : "reject_kyc",
        "kyc_submission",
        kycId,
        `Admin ${status} KYC submission for ${submission.username}. ${cleanNote}`
      );
    });

    reviewKyc();

    res.json({
      success: true,
      message: `KYC submission ${status}.`
    });

  } catch (error) {
    console.error("KYC review error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to review KYC submission."
    });
  }
});


module.exports = router;