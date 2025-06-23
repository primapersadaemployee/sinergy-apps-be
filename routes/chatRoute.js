import express from "express";
import {
  getAllChatFriends,
  getArchivedChats,
  createGroupChat,
  updateGroupChat,
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
chatRouter.post("/group", upload.single("image"), createGroupChat);
chatRouter.get("/group/:chatId", getListGroupChat);
chatRouter.patch("/group/:chatId", upload.single("image"), updateGroupChat);
chatRouter.post("/group/:chatId/members", addGroupMembers);

// Message routes
chatRouter.get("/:chatId/messages", getChatMessages);
chatRouter.post("/image", upload.single("image"), uploadChatImage);
chatRouter.post("/:chatId/clear-my-history", clearMyChatHistory);

// Archive routes
chatRouter.patch("/:chatId/archive", toggleArchiveChat);

export default chatRouter;
