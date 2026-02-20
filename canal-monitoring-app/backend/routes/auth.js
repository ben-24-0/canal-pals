const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

// POST /api/auth/login — validate credentials, return user info for NextAuth
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Intentionally vague — don't reveal whether email exists
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Return user profile (never return passwordHash)
    return res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me — lightweight liveness check (actual session managed by NextAuth)
router.get("/me", (req, res) => {
  res.status(401).json({ error: "Use NextAuth session on the frontend" });
});

module.exports = router;
