require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const DEMO_EMAILS = ["admin@canal.io", "user@canal.io"];

async function removeDemoUsers() {
  const mongoUri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/canal-monitoring";

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const result = await User.deleteMany({
      email: { $in: DEMO_EMAILS },
    });

    console.log(
      `Removed ${result.deletedCount} legacy demo account(s): ${DEMO_EMAILS.join(", ")}`,
    );
  } catch (error) {
    console.error("Failed to remove demo users:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  removeDemoUsers();
}

module.exports = removeDemoUsers;
