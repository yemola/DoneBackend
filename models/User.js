const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    username: { type: String, required: true },
    city: { type: String },
    state: { type: String, required: true },
    country: { type: String, required: true },
    countryCode: { type: Object, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    whatsapp: { type: String },
    image: { type: Object },
    isActive: { type: Boolean, default: true },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    expoPushToken: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
