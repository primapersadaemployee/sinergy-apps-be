import express from "express";
import {
  getAllChatFriends,
  getArchivedChats,
  startPrivateChat,
  createGroupChat,
  addGroupMembers,
  getChatMessages,
  sendMessage,
  toggleArchiveChat,
  getAllChatGroups,
  getListGroupChat,
} from "../controllers/chatController.js";
import authMiddleware from "../middleware/auth.js";

const chatRouter = express.Router();

// Apply auth middleware to all chat routes
chatRouter.use(authMiddleware);

// Chat list routes
chatRouter.get("/", getAllChatFriends);
chatRouter.get("/groups", getAllChatGroups);
chatRouter.get("/archived", getArchivedChats);

// Private chat routes
chatRouter.post("/private", startPrivateChat);

// Group chat routes
chatRouter.post("/group", createGroupChat);
chatRouter.post("/group/:chatId/members", addGroupMembers);
chatRouter.get("/group/:groupId", getListGroupChat);

// Message routes
chatRouter.get("/:chatId/messages", getChatMessages);
chatRouter.post("/:chatId/messages", sendMessage);

// Archive routes
chatRouter.patch("/:chatId/archive", toggleArchiveChat);

export default chatRouter; 