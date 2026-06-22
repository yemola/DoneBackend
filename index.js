require("dotenv").config();
const http = require("http");
const cors = require("cors");
const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const compression = require("compression");
const mongoose = require("mongoose");
const Sentry = require("@sentry/node");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { Expo } = require("expo-server-sdk");

const faqsRoute = require("./routes/faqs");
const usersRoute = require("./routes/users");
const authRoute = require("./routes/auth");
const categoriesRoute = require("./routes/categories");
const listingsRoute = require("./routes/listings");
const orderRoute = require("./routes/order");
const my = require("./routes/my");
const messages = require("./routes/messages");

const Messages = require("./models/Messages");
const User = require("./models/User");
const sendPushNotification = require("./utilities/pushNotifications");

const app = express();
const server = http.createServer(app);

// Ensure required directories exist
const fs = require("fs");
const path = require("path");
const requiredDirs = ["public", "public/assets", "uploads", "profile"];
requiredDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});


// ─── Socket.IO ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

/**
 * JWT auth middleware for Socket.IO.
 * The client sends the token as: io({ auth: { token } })
 * We verify it with the same JWT_SECRET used by the REST middleware.
 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication error: no token"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SEC);
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error("Authentication error: invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.user?.userId || socket.data.user?._id;

  if (userId) {
    // Each user joins their own room so we can target them directly
    socket.join(`user:${userId}`);
  }

  // ── Incoming message from sender ──────────────────────────────────────────
  socket.on("chat:send", async (msg) => {
    try {
      const { clientMsgId, fromUserId, toUserId, content } = msg;

      // Idempotency: return existing if already saved
      if (clientMsgId) {
        const existing = await Messages.findOne({ clientMsgId });
        if (existing) {
          socket.emit("chat:ack", {
            clientMsgId,
            _id: existing._id.toString(),
            status: "sent",
          });
          return;
        }
      }

      const saved = await new Messages({
        clientMsgId: clientMsgId ?? undefined,
        fromUserId,
        toUserId,
        content,
        sender: msg.sender,
        receiver: msg.receiver,
        senderImg: msg.senderImg,
        receiverImg: msg.receiverImg,
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        createdDate: msg.date,
        createdTime: msg.time,
        status: "sent",
      }).save();

      // Ack to sender — lets them confirm message was stored
      socket.emit("chat:ack", {
        clientMsgId,
        _id: saved._id.toString(),
        status: "sent",
      });

      // Deliver to recipient if they're online
      io.to(`user:${toUserId}`).emit("chat:receive", saved);

      // Push notification if recipient has no active socket in their room
      const recipientSockets = await io.in(`user:${toUserId}`).fetchSockets();
      if (recipientSockets.length === 0) {
        const targetUser = await User.findById(toUserId);
        if (targetUser?.expoPushToken && Expo.isExpoPushToken(targetUser.expoPushToken)) {
          await sendPushNotification(targetUser.expoPushToken, saved);
        }
      }
    } catch (err) {
      console.error("chat:send error", err);
    }
  });

  // ── Recipient acknowledges delivery ──────────────────────────────────────
  socket.on("chat:delivered", async ({ _id }) => {
    try {
      await Messages.findByIdAndUpdate(_id, { status: "delivered" });
      const msg = await Messages.findById(_id);
      if (msg) {
        io.to(`user:${msg.fromUserId}`).emit("chat:status", {
          _id,
          status: "delivered",
        });
      }
    } catch (err) {
      console.error("chat:delivered error", err);
    }
  });

  // ── Recipient marks messages as read ─────────────────────────────────────
  socket.on("chat:read", async ({ ids, fromUserId }) => {
    try {
      await Messages.updateMany({ _id: { $in: ids } }, { status: "read" });
      io.to(`user:${fromUserId}`).emit("chat:status_bulk", {
        ids,
        status: "read",
      });
    } catch (err) {
      console.error("chat:read error", err);
    }
  });

  // ── Typing Indicator events ───────────────────────────────────────────────
  socket.on("typing:start", ({ chatroomId, userId }) => {
    io.to(`user:${chatroomId}`).emit("typing:start", { fromUserId: userId });
  });

  socket.on("typing:stop", ({ chatroomId, userId }) => {
    io.to(`user:${chatroomId}`).emit("typing:stop", { fromUserId: userId });
  });

  socket.on("disconnect", () => {
    // Socket.IO handles room cleanup automatically on disconnect
  });
});

// Make io accessible in route handlers if needed
app.set("io", io);

// ─── Express middleware ──────────────────────────────────────────────────────
Sentry.init({
  dsn: process.env.DSN,
  tracesSampleRate: 1.0,
});

const mongoUrl = process.env.MONGO_URL;
mongoose
  .connect(mongoUrl)
  .then(() => console.log("DB Connected"))
  .catch((error) => console.log("error: ", error));

app.use(cors());
app.use(express.static("public"));
app.use(express.json());
app.use(helmet());
app.use(compression());

app.use("/api/users", usersRoute);
app.use("/api/auth", authRoute);
app.use("/api/categories", categoriesRoute);
app.use("/api/faqs", faqsRoute);
app.use("/api/listings", listingsRoute);
app.use("/api/orders", orderRoute);
app.use("/api/my", my);
app.use("/api/messages", messages);

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.json({ message: "file is too large" });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.json({ message: "too many files at once" });
    }
  }
  next(error);
});

// ─── Start ───────────────────────────────────────────────────────────────────
const port = process.env.PORT;
server.listen(port, () => {
  console.log(`Server started on port ${port}...`);
});
