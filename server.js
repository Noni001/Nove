require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

// Load database and initialize tables
require("./db");

const apiRoutes = require("./routes-index");

const app = express();

const PORT = process.env.PORT || 5000;

// --------------------------------------------------
// DIRECTORIES
// --------------------------------------------------

const uploadDir = path.resolve(
  process.env.UPLOAD_DIR || "./uploads"
);

const dataDir = path.resolve("./data");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// --------------------------------------------------
// SECURITY
// --------------------------------------------------

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

// --------------------------------------------------
// BODY PARSING
// --------------------------------------------------

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

// --------------------------------------------------
// RATE LIMITING
// --------------------------------------------------

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please try again later."
  }
});

app.use("/api/", apiLimiter);

// --------------------------------------------------
// BASIC SERVER CHECK
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    name: "NovaVest API",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NovaVest API",
    timestamp: new Date().toISOString()
  });
});

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

app.use("/api", apiRoutes);

// --------------------------------------------------
// NOTE:
// KYC files are intentionally NOT exposed publicly.
// They must be accessed through /api/secure/kyc/:id/:document
// --------------------------------------------------

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Uploaded file is too large"
    });
  }

  res.status(500).json({
    error: "Internal server error"
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log("=================================");
  console.log("NovaVest API");
  console.log("=================================");
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log("=================================");
});