const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();

const uploadDir =
  process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const randomName =
      `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

    cb(null, randomName);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize:
      Number(process.env.MAX_FILE_SIZE_MB || 5) * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        new Error(
          "Only JPG, PNG, WEBP images and PDF documents are allowed."
        )
      );
    }

    cb(null, true);
  }
});

// Submit KYC documents
router.post(
  "/submit",
  requireAuth,
  upload.fields([
    { name: "governmentId", maxCount: 1 },
    { name: "passport", maxCount: 1 }
  ]),
  (req, res) => {
    try {
      const user = db.prepare(`
        SELECT
          id,
          full_name,
          kyc_status,
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

      const governmentId = req.files?.governmentId?.[0];
      const passport = req.files?.passport?.[0];

      if (!governmentId && !passport) {
        return res.status(400).json({
          message: "Upload at least one valid identity document."
        });
      }

      if (user.kyc_status === "approved") {
        return res.status(400).json({
          message: "Your KYC has already been approved."
        });
      }

      const existing = db.prepare(`
        SELECT *
        FROM kyc_submissions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(req.user.userId);

      if (existing && existing.status === "pending") {
        return res.status(400).json({
          message: "You already have a KYC submission under review."
        });
      }

      const fullName =
        String(req.body.fullName || user.full_name).trim();

      if (fullName.length < 2) {
        return res.status(400).json({
          message: "Enter a valid full name."
        });
      }

      const governmentIdPath = governmentId
        ? governmentId.path
        : null;

      const passportPath = passport
        ? passport.path
        : null;

      const insert = db.prepare(`
        INSERT INTO kyc_submissions (
          user_id,
          full_name,
          government_id_path,
          passport_path,
          status
        )
        VALUES (?, ?, ?, ?, 'pending')
      `);

      insert.run(
        req.user.userId,
        fullName,
        governmentIdPath,
        passportPath
      );

      db.prepare(`
        UPDATE users
        SET
          kyc_status = 'pending',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(req.user.userId);

      db.prepare(`
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message
        )
        VALUES (?, 'kyc', 'KYC Submitted', ?)
      `).run(
        req.user.userId,
        "Your KYC documents have been submitted and are pending review."
      );

      res.status(201).json({
        message: "KYC submitted successfully.",
        status: "pending"
      });

    } catch (error) {
      console.error("KYC submission error:", error);

      res.status(500).json({
        message: error.message || "Unable to submit KYC."
      });
    }
  }
);

// Get current user's KYC status
router.get("/status", requireAuth, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT
        kyc_status
      FROM users
      WHERE id = ?
    `).get(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User account not found."
      });
    }

    const submission = db.prepare(`
      SELECT
        id,
        full_name,
        status,
        review_note,
        submitted_at,
        reviewed_at
      FROM kyc_submissions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.user.userId);

    res.json({
      kycStatus: user.kyc_status,
      submission: submission || null
    });

  } catch (error) {
    console.error("KYC status error:", error);

    res.status(500).json({
      message: "Unable to load KYC status."
    });
  }
});

module.exports = router;