const express = require("express");
const router = express.Router();

// Mock database pengguna Dojang
const mockUsers = [
  { id: "USR-01", email: "admin@dojang.id", role: "admin", name: "Master Rio" },
  { id: "USR-02", email: "referee@dojang.id", role: "referee", name: "Wasit Juri Hendra" },
  { id: "USR-03", email: "coach@dojang.id", role: "coach", name: "Sabeumnim Surya" },
  { id: "USR-04", email: "athlete@dojang.id", role: "member", name: "Ahmad Rayhan" }
];

/**
 * POST /api/auth/login
 * Login handler yang digunakan bersama oleh semua subpath di domain yang sama
 */
router.post("/login", (req, res) => {
  const { email, role } = req.body;
  const user = mockUsers.find(
    (u) => (email && u.email.toLowerCase() === email.toLowerCase()) || (role && u.role === role)
  ) || mockUsers[1]; // default ke referee jika demo

  const token = `mock-jwt-token-for-${user.id}-${Date.now()}`;

  return res.json({
    success: true,
    message: "Login berhasil",
    token,
    user
  });
});

/**
 * GET /api/auth/me
 */
router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "Token tidak ditemukan" });
  }

  return res.json({
    success: true,
    user: mockUsers[1] // Wasit / Operator arena
  });
});

module.exports = router;
