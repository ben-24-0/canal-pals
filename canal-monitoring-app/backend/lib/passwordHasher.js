let hasher;

try {
  hasher = require("bcrypt");
} catch {
  hasher = require("bcryptjs");
}

module.exports = hasher;