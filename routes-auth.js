const express = require("express");
const db = require("./db");

const {
  hashPassword,
  comparePassword,
  createToken
} = require("./auth");

const router = express.Router();


/* =========================
   VALIDATION HELPERS
========================= */

function clean(value) {
  return String(value || "").trim();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}


/* =========================
   REGISTER
========================= */

router.post("/register", async (req, res) => {

  try {

    const fullName = clean(req.body.fullName);
    const username = clean(req.body.username).toLowerCase();
    const email = clean(req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const confirmPassword = String(
      req.body.confirmPassword || ""
    );

    if (!fullName) {
      return res.status(400).json({
        success: false,
        message: "Full name is required."
      });
    }

    if (!validUsername(username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must contain 3-30 letters, numbers, or underscores."
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least 8 characters."
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match."
      });
    }


    /* =========================
       CHECK EXISTING USER
    ========================= */

    const existingUser = db.prepare(`
      SELECT id
      FROM users
      WHERE username = ?
         OR email = ?
      LIMIT 1
    `).get(username, email);

    if (existingUser) {

      return res.status(409).json({
        success: false,
        message:
          "An account with that username or email already exists."
      });

    }


    /* =========================
       PASSWORD HASH
    ========================= */

    const passwordHash =
      await hashPassword(password);


    /* =========================
       REFERRAL CODE
    ========================= */

    const referralCode =
      username.toUpperCase() +
      Math.floor(1000 + Math.random() * 9000);


    /* =========================
       CREATE USER
    ========================= */

    const insertUser = db.prepare(`
      INSERT INTO users (
        full_name,
        username,
        email,
        password_hash,
        referral_code
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = insertUser.run(
      fullName,
      username,
      email,
      passwordHash,
      referralCode
    );

    const userId = result.lastInsertRowid;


    /* =========================
       CREATE WALLET
    ========================= */

    db.prepare(`
      INSERT INTO wallets (user_id)
      VALUES (?)
    `).run(userId);


    /* =========================
       CREATE WELCOME NOTIFICATION
    ========================= */

    db.prepare(`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message
      )
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      "system",
      "Welcome to NovaVest",
      "Your NovaVest account has been created successfully."
    );


    /* =========================
       GET USER
    ========================= */

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
        created_at
      FROM users
      WHERE id = ?
    `).get(userId);


    /* =========================
       TOKEN
    ========================= */

    const token = createToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: "user"
    });


    return res.status(201).json({

      success: true,

      message:
        "Account created successfully.",

      token,

      user

    });

  } catch (error) {

    console.error(
      "Registration error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create account."
    });

  }

});


/* =========================
   LOGIN
========================= */

router.post("/login", async (req, res) => {

  try {

    const email =
      clean(req.body.email).toLowerCase();

    const password =
      String(req.body.password || "");


    if (!validEmail(email)) {

      return res.status(400).json({
        success: false,
        message:
          "Enter a valid email address."
      });

    }


    if (!password) {

      return res.status(400).json({
        success: false,
        message:
          "Password is required."
      });

    }


    /* =========================
       FIND USER
    ========================= */

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE email = ?
      LIMIT 1
    `).get(email);


    if (!user) {

      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password."
      });

    }


    /* =========================
       CHECK ACCOUNT
    ========================= */

    if (user.account_status !== "active") {

      return res.status(403).json({
        success: false,
        message:
          "This account is not currently active."
      });

    }


    /* =========================
       CHECK PASSWORD
    ========================= */

    const passwordCorrect =
      await comparePassword(
        password,
        user.password_hash
      );


    if (!passwordCorrect) {

      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password."
      });

    }


    /* =========================
       TOKEN
    ========================= */

    const role =
      user.role || "user";

    const token = createToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role
    });


    /* =========================
       RESPONSE
    ========================= */

    return res.json({

      success: true,

      message:
        "Login successful.",

      token,

      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        account_status: user.account_status,
        account_type: user.account_type,
        kyc_status: user.kyc_status,
        referral_code: user.referral_code,
        created_at: user.created_at,
        role
      }

    });

  } catch (error) {

    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to log in."
    });

  }

});


module.exports = router;