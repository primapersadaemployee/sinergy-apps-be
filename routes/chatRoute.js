import express from "express";
import {
  getAllChatFriends,
  getArchivedChats,
  createGroupChat,
  addGroupMembers,
  getChatMessages,
  toggleArchiveChat,
  getAllChatGroups,
  getListGroupChat,
  clearMyChatHistory,
  uploadChatImage,
} from "../controllers/chatController.js";
import authMiddleware from "../middleware/auth.js";
import upload from "../config/multer.js";

const chatRouter = express.Router();

// Apply auth middleware to all chat routes
chatRouter.use(authMiddleware);

// Chat list routes
chatRouter.get("/", getAllChatFriends);
chatRouter.get("/groups", getAllChatGroups);
chatRouter.get("/archived", getArchivedChats);

// Group chat routes
chatRouter.post("/group", createGroupChat);
chatRouter.post("/group/:chatId/members", addGroupMembers);
chatRouter.get("/group/:groupId", getListGroupChat);

// Message routes
chatRouter.get("/:chatId/messages", getChatMessages);
chatRouter.post(
  "/image",
  authMiddleware,
  upload.single("image"),
  uploadChatImage
);
chatRouter.post("/:chatId/clear-my-history", clearMyChatHistory);

// Archive routes
chatRouter.patch("/:chatId/archive", toggleArchiveChat);

export default chatRouter;
