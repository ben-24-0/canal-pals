const mongoose = require("mongoose");

const canalGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    canalIds: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    adminUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "canal_groups",
    timestamps: true,
  },
);

canalGroupSchema.index({ name: 1 }, { unique: true });
canalGroupSchema.index({ adminUserIds: 1 });
canalGroupSchema.index({ canalIds: 1 });

canalGroupSchema.pre("save", function (next) {
  if (Array.isArray(this.canalIds)) {
    this.canalIds = [...new Set(this.canalIds.map((v) => String(v).toLowerCase().trim()).filter(Boolean))];
  }

  if (Array.isArray(this.adminUserIds)) {
    const seen = new Set();
    this.adminUserIds = this.adminUserIds.filter((id) => {
      const key = String(id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  next();
});

module.exports = mongoose.model("CanalGroup", canalGroupSchema);
