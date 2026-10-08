require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

require("./db");
const apiRoutes = require("./routes-index");

const app = express();
const PORT = process.env.PORT || 5000;

const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const dataDir = path.resolve("./data");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});

app.use("/api/", apiLimiter);

app.get("/", (req, res) => {
  res.json({ name: "NovaVest API", status: "online", version: "1.0.0" });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "NovaVest API",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Uploaded file is too large" });
  }
  res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("NovaVest API");
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
