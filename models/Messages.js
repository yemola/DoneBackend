const mongoose = require("mongoose");

const MessagesSchema = new mongoose.Schema({
  // clientMsgId: UUID generated on the client before sending.
  // sparse: true — existing documents without this field are not indexed,
  // so old messages without a clientMsgId won't cause a unique-key error.
  clientMsgId: { type: String, unique: true, sparse: true },
  fromUserId: { type: String, required: true },
  toUserId: { type: String, required: true },
  listingId: { type: String },
  listItem: { type: String },
  content: { type: String },
  sender: { type: String },
  receiver: { type: String },
  senderImg: { type: String },
  receiverImg: { type: String },
  createdAt: { type: Date },
  createdDate: { type: String },
  createdTime: { type: String },
  status: { type: String, default: "sent" },
});

module.exports = mongoose.model("Messages", MessagesSchema);
