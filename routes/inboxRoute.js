import express from "express";
import {
  getAllChatNearby,
  getChatMessages,
} from "../controllers/chatController.js";
import authMiddleware from "../middleware/auth.js";

const inboxRouter = express.Router();

// Apply auth middleware to all inbox routes
inboxRouter.use(authMiddleware);

// Inbox list routes
inboxRouter.get("/nearby", getAllChatNearby);
inboxRouter.get("/:chatId/messages", getChatMessages);

export default inboxRouter;
