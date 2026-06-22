const express = require("express");
const router = express.Router();
const yup = require("yup");
const { Expo } = require("expo-server-sdk");

const User = require("../models/User");
const Listing = require("../models/Listing");
const Messages = require("../models/Messages");
const sendPushNotification = require("../utilities/pushNotifications");
const validateWith = require("../middleware/validation");
const errorHandler = require("../middleware/errorHandler");

const schema = yup.object().shape({
  listingId: yup.string().required(),
  message: yup.string().required(),
});

/**
 * GET /getUserChats
 *
 * Returns all messages where the requesting user is sender OR receiver.
 *
 * FIX: was querying `{ userId }` which matched nothing — the schema uses
 *      `fromUserId` and `toUserId`.
 *
 * Optional query param: ?since=<unix_ms>
 *   When provided, only messages created after that timestamp are returned.
 *   Used by the app on reconnect to fetch only the messages it missed,
 *   instead of re-downloading the full history.
 */
router.post("/getUserChats", async (req, res, next) => {
  const userId = req.body.userId;
  const since = req.query.since ? new Date(Number(req.query.since)) : null;

  try {
    const query = {
      $or: [{ fromUserId: userId }, { toUserId: userId }],
    };
    if (since) query.createdAt = { $gt: since };

    const resources = await Messages.find(query).sort({ createdAt: 1 });
    res.status(200).send(resources);
  } catch (error) {
    next(error);
  }
});

router.post("/delete", async (req, res, next) => {
  try {
    const chatsToDelete = req.body.selectedItems;

    if (!Array.isArray(chatsToDelete)) {
      return res.status(200).json("Deleted (none specified)");
    }

    if (chatsToDelete.length === 1) {
      const [chatId] = chatsToDelete;
      await Messages.findByIdAndDelete({ _id: chatId });
    }
    if (chatsToDelete.length > 1) {
      await Promise.all(chatsToDelete.map((id) => Messages.findByIdAndDelete(id)));
    }
    res.status(200).json("Deleted");
  } catch (error) {
    next(error);
  }
});

/**
 * POST /addNewChat
 *
 * REST fallback for sending a message (used when WebSocket is unavailable).
 * Idempotency: if a clientMsgId is supplied and the message already exists,
 * return the existing document instead of creating a duplicate.
 */
router.post("/addNewChat", async (req, res, next) => {
  const { newChat } = req.body;

  try {
    // Idempotency check — prevents duplicate messages on retry
    if (newChat.clientMsgId) {
      const existing = await Messages.findOne({ clientMsgId: newChat.clientMsgId });
      if (existing) return res.status(200).json(existing);
    }

    const chat = new Messages({
      clientMsgId: newChat.clientMsgId ?? undefined,
      fromUserId: newChat.fromUserId,
      toUserId: newChat.toUserId,
      listingId: "",
      listItem: "",
      content: newChat.content,
      sender: newChat.sender,
      receiver: newChat.receiver,
      senderImg: newChat.senderImg,
      receiverImg: newChat.receiverImg,
      createdAt: newChat.createdAt,
      createdDate: newChat.date,
      createdTime: newChat.time,
      status: newChat.status ?? "sent",
    });

    const savedChat = await chat.save();

    const targetUser = await User.findById(savedChat.toUserId);
    if (!targetUser) return res.status(400).json({ status: "FAILED" });

    const { expoPushToken } = targetUser;
    if (Expo.isExpoPushToken(expoPushToken))
      await sendPushNotification(expoPushToken, savedChat);

    res.status(200).json(savedChat);
  } catch (error) {
    next(error);
  }
});

router.put("/updateChats", async (req, res, next) => {
  const { idsToUpdate } = req.body;
  try {
    const result = [];
    for (const id of idsToUpdate) {
      const updatedMessage = await Messages.findByIdAndUpdate(id, {
        status: "read",
      });
      result.push(updatedMessage);
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/", validateWith(schema), async (req, res, next) => {
  const { listingId, message, user } = req.body;

  const listing = await Listing.findById(listingId);

  if (!listing)
    return res.status(400).send({ status: "FAILED", message: "Listing not found" });

  const targetUser = await User.findById(listing.userId);

  if (!targetUser)
    return res.status(400).json({ status: "FAILED", message: "User not found" });

  let now = new Date();
  const month = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const newMessage = new Messages({
    fromUserId: user.userId,
    toUserId: listing.userId,
    listingId: listingId,
    listItem: listing.title,
    content: message,
    sender: `${user.firstname} ${user.lastname}`,
    receiver: `${targetUser.firstname} ${targetUser.lastname}`,
    senderImg: user.image,
    receiverImg: targetUser.image,
    createdAt: new Date(),
    createdDate: `${month[now.getUTCMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
    createdTime: `${now.getHours()}:${now.getMinutes()}`,
    status: "sent",
  });
  await newMessage.save();

  const { expoPushToken } = targetUser;

  if (Expo.isExpoPushToken(expoPushToken))
    await sendPushNotification(expoPushToken, newMessage);

  res.status(201).send("Message sent successfully.");
});

router.use(errorHandler);

module.exports = router;

