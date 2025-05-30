import express from "express";
import { registerUser, loginUser } from "../controllers/authController.js";
import {
  getUserProfile,
  updateUserProfile,
  sendFriendRequest,
  checkFriendRequest,
  acceptRejectFriendRequest,
  getAllFriend,
  searchByUsername,
  recommendationFriend,
  getUserProfileByUserId,
} from "../controllers/userController.js";
import authMiddleware from "../middleware/auth.js";
import multer from "multer";

const userRouter = express.Router();

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

userRouter.post("/register", registerUser);
userRouter.post("/login", loginUser);
userRouter.get("/profile", authMiddleware, getUserProfile);
userRouter.patch(
  "/profile",
  authMiddleware,
  upload.single("image"),
  updateUserProfile
);
userRouter.post("/friend/request", authMiddleware, sendFriendRequest);
userRouter.get("/friend/requests", authMiddleware, checkFriendRequest);
userRouter.patch(
  "/friend/requests/:requestId",
  authMiddleware,
  acceptRejectFriendRequest
);
userRouter.get("/friends", authMiddleware, getAllFriend);
userRouter.get("/friends/search", authMiddleware, searchByUsername);
userRouter.get("/friends/recommendation", authMiddleware, recommendationFriend);
userRouter.get("/:id", authMiddleware, getUserProfileByUserId);


export default userRouter;
