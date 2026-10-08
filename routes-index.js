const express = require("express");

const router = express.Router();

// Authentication
router.use("/auth", require("./routes-auth"));

router.use("/admin/auth", require("./routes-admin-auth"));

// User
router.use("/user", require("./routes-user"));

// Wallet
router.use("/wallet", require("./routes-wallet"));

// Deposits
router.use("/deposit", require("./routes-deposit"));

// Withdrawals
router.use("/withdraw", require("./routes-withdraw"));

// KYC
router.use("/kyc", require("./routes-kyc"));

router.use("/secure", require("./secure-uploads"));

// Referrals
router.use("/referrals", require("./routes-referrals"));

// Loans
router.use("/loan", require("./routes-loan"));

// Cards
router.use("/card", require("./routes-card"));

// User-to-user transfers
router.use("/u2u", require("./routes-u2u"));

// Transactions
router.use("/transactions", require("./routes-transactions"));

// Notifications
router.use("/notifications", require("./routes-notifications"));

// User settings
router.use("/settings", require("./routes-settings"));

/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/

// Admin overview/read-only
router.use("/admin", require("./routes-admin"));

// Admin authentication/profile
router.use("/admin/profile", require("./routes-admin-profile"));

// Admin user management
router.use("/admin/users", require("./routes-admin-users"));

// Admin transactions
router.use("/admin/deposits", require("./routes-admin-deposits"));
router.use("/admin/withdrawals", require("./routes-admin-withdrawals"));

// Admin KYC
router.use("/admin/kyc", require("./routes-admin-kyc"));

// Admin loans
router.use("/admin/loans", require("./routes-admin-loans"));

// Admin cards
router.use("/admin/cards", require("./routes-admin-cards"));

// Admin referrals
router.use("/admin/referrals", require("./routes-admin-referrals"));

// Admin notifications
router.use("/admin/notifications", require("./routes-admin-notifications"));

// Admin account adjustments
router.use("/admin/adjustments", require("./routes-admin-adjustments"));

// Admin settings
router.use("/admin/settings", require("./routes-admin-settings"));

// Admin audit logs
router.use("/admin/audit", require("./routes-admin-audit"));

module.exports = router;