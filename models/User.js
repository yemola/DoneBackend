const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    // Social sign-in users may not have a username until they complete their profile
    username: { type: String, required: false, default: "" },
    city: { type: String },
    // Location fields are optional for social users — filled in via ProfileCompletion
    state: { type: String },
    country: { type: String },
    countryCode: { type: Object },
    email: { type: String, required: true, unique: true },
    // Password is not required for social auth users
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
    // Social auth tracking
    provider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },
    // Provider-specific user ID (Google sub / Apple user string)
    providerId: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
