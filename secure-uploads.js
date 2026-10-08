const express = require("express");
const path = require("path");
const fs = require("fs");

const { db } = require("./db");
const { requireAuth, requireAdmin } = require("./auth");

const router = express.Router();

const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || "./uploads"
);

function getSafeFilePath(filePath) {
  if (!filePath) return null;

  const absolutePath = path.resolve(filePath);

  if (
    absolutePath !== UPLOAD_DIR &&
    !absolutePath.startsWith(UPLOAD_DIR + path.sep)
  ) {
    return null;
  }

  return absolutePath;
}

// ADMIN: view a KYC document
router.get(
  "/kyc/:id/:document",
  requireAuth,
  requireAdmin,
  (req, res) => {
    try {
      const { id, document } = req.params;

      if (!["government_id", "passport"].includes(document)) {
        return res.status(400).json({
          error: "Invalid document type"
        });
      }

      const submission = db.prepare(`
        SELECT
          government_id_path,
          passport_path
        FROM kyc_submissions
        WHERE id = ?
      `).get(id);

      if (!submission) {
        return res.status(404).json({
          error: "KYC submission not found"
        });
      }

      const filePath =
        document === "government_id"
          ? submission.government_id_path
          : submission.passport_path;

      const safePath = getSafeFilePath(filePath);

      if (!safePath || !fs.existsSync(safePath)) {
        return res.status(404).json({
          error: "Document not found"
        });
      }

      res.sendFile(safePath);
    } catch (error) {
      console.error("Secure document error:", error);

      res.status(500).json({
        error: "Unable to access document"
      });
    }
  }
);

module.exports = router;