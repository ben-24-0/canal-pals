const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load backend and workspace env files so scripts work from either cwd.
const envFiles = [
  { filePath: path.resolve(__dirname, "..", ".env"), override: false },
  { filePath: path.resolve(__dirname, "..", ".env.local"), override: true },
  { filePath: path.resolve(__dirname, "..", "..", ".env"), override: false },
  {
    filePath: path.resolve(__dirname, "..", "..", ".env.local"),
    override: true,
  },
];

for (const { filePath, override } of envFiles) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}
