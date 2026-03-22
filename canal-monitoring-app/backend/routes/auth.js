const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

// POST /api/auth/register — create a new user account
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email, and password are required",
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const trimmedName = String(name).trim();

    if (trimmedName.length < 2) {
      return res
        .status(400)
        .json({ error: "Name must be at least 2 characters" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role: "user",
      favouriteCanals: [],
    });

    return res.status(201).json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      message: "Account created successfully",
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

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
