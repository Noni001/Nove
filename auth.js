const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET =
  process.env.JWT_SECRET || "development-secret-change-this";


/* =========================
   PASSWORD HELPERS
========================= */

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}


async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}


/* =========================
   TOKEN HELPERS
========================= */

function createToken(user) {

  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role || "user"
    },
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    }
  );

}


/* =========================
   VERIFY TOKEN
========================= */

function verifyToken(token) {

  return jwt.verify(
    token,
    JWT_SECRET
  );

}


/* =========================
   AUTH MIDDLEWARE
========================= */

function requireAuth(req, res, next) {

  try {

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {

      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });

    }

    const token =
      authorization.substring(7);

    const decoded =
      verifyToken(token);

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token."
    });

  }

}


/* =========================
   ADMIN MIDDLEWARE
========================= */

function requireAdmin(req, res, next) {

  if (!req.user) {

    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });

  }

  if (req.user.role !== "admin") {

    return res.status(403).json({
      success: false,
      message: "Administrator access required."
    });

  }

  next();

}


module.exports = {
  hashPassword,
  comparePassword,
  createToken,
  verifyToken,
  requireAuth,
  requireAdmin
};