const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const errorHandler = require("../middleware/errorHandler");
const { verifyToken } = require("./verifyToken");

// ─── Helper: build JWT payload and sign ──────────────────────────────────────
const signUserToken = (user) =>
  jwt.sign(
    {
      firstname: user.firstname,
      lastname: user.lastname,
      userId: user._id,
      username: user.username,
      email: user.email,
      city: user.city,
      state: user.state,
      country: user.country,
      countryCode: user.countryCode,
      whatsapp: user.whatsapp,
      image: user.image,
      isAdmin: user.isAdmin,
      expoPushToken: user.expoPushToken,
      provider: user.provider,
    },
    process.env.JWT_SEC
  );

// ─── POST /api/auth/social ────────────────────────────────────────────────────
// Called after the client completes a Google or Apple OAuth flow.
// Body: { provider, email, firstname, lastname, image?, providerId? }
//
// Flow:
//   1. Look up user by email.
//   2. If found: issue a fresh JWT (email is the source of truth — an existing
//      email/password user signing in via Google gets the same account).
//   3. If not found: create a minimal user record, then issue JWT.
//
// JWT payload shape is identical to /api/auth so jwtDecode<User> works unchanged.
router.post("/social", async (req, res, next) => {
  try {
    const { provider, email, firstname, lastname, image, providerId, idToken } = req.body;

    if (!provider) {
      return res.status(400).json("provider is required");
    }
    if (!["google", "apple"].includes(provider)) {
      return res.status(400).json("Invalid provider");
    }
    if (!providerId) {
      return res.status(400).json("providerId is required");
    }

    let user;

    // 1. First lookup by provider & providerId (handles subsequent social sign-ins where email may not be sent)
    user = await User.findOne({ provider, providerId });

    if (user) {
      const token = signUserToken(user);
      return res.status(200).json(token);
    }

    // Resolve email (use the explicit client email, or decode the Apple identityToken if the email is empty)
    let resolvedEmail = email;
    if (!resolvedEmail && idToken) {
      try {
        const decoded = jwt.decode(idToken);
        if (decoded && decoded.email) {
          resolvedEmail = decoded.email;
        }
      } catch (err) {
        console.error("Failed to decode Apple idToken", err);
      }
    }

    // 2. If not found by providerId, check by email (if email is resolved) to link existing local accounts
    if (resolvedEmail) {
      user = await User.findOne({ email: resolvedEmail.trim().toLowerCase() });
      if (user) {
        user.providerId = providerId;
        user.provider = provider;
        await user.save();
        const token = signUserToken(user);
        return res.status(200).json(token);
      }
    }

    // 3. New social user — we require email to register a new account
    if (!resolvedEmail) {
      return res.status(400).json("Email is required to register a new account");
    }

    user = new User({
      firstname: firstname || (resolvedEmail ? resolvedEmail.split("@")[0] : "Apple") || "Apple",
      lastname: lastname || "User",
      email: resolvedEmail.trim().toLowerCase(),
      image: image ? { url: image } : undefined,
      provider,
      providerId: providerId || "",
      username: "",
      // password intentionally omitted — social users have no local password
    });

    await user.save();

    const token = signUserToken(user);
    return res.status(201).json(token);
  } catch (error) {
    next(error);
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Authenticated route: returns a fresh JWT for the currently logged-in user,
// reflecting the latest data from the database.
//
// Used after a social user completes their profile (ProfileCompletionScreen)
// so the client token stays in sync with the updated username/location.
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) return res.status(401).json("Unauthorized");

    const user = await User.findById(userId);
    if (!user) return res.status(404).json("User not found");

    const token = signUserToken(user);
    return res.status(200).json(token);
  } catch (error) {
    next(error);
  }
});

router.use(errorHandler);

module.exports = router;
