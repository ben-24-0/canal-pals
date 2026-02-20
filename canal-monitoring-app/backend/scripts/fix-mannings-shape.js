/**
 * One-time migration: fixes manningsParams.shape "trapezoidal" → "trapezoid"
 * in any existing canal documents.
 *
 * Usage:  node scripts/fix-mannings-shape.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/canal-monitoring";

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const result = await mongoose.connection
    .collection("canals")
    .updateMany(
      { "manningsParams.shape": "trapezoidal" },
      { $set: { "manningsParams.shape": "trapezoid" } }
    );

  console.log(
    `✅ Fixed ${result.modifiedCount} canal(s): "trapezoidal" → "trapezoid"`
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
