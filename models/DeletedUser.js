const mongoose = require("mongoose");

const DeletedUserSchema = new mongoose.Schema(
  {
    firstname: { type: String },
    lastname: { type: String },
    username: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    countryCode: { type: Object },
    email: { type: String },
    password: { type: String },
    whatsapp: { type: String },
    image: { type: Object },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    expoPushToken: { type: String },
    userReference: { type: String },
    deletedAt: { type: Date },
    deletionSource: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeletedUser", DeletedUserSchema);
