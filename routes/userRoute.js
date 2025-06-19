import express from "express";
import { registerUser, loginUser } from "../controllers/authController.js";
import {
  updateFcmToken,
  getUserProfile,
  updateUserProfile,
  sendFriendRequest,
  checkFriendRequest,
  acceptRejectFriendRequest,
  getAllFriend,
  recommendationFriend,
  getUserProfileByUserId,
  searchByUsernameOrPhone,
  deleteFriend,
  updateLocation,
  getPeopleNearby,
} from "../controllers/userController.js";
import { logoutUser } from "../controllers/authController.js";
import authMiddleware from "../middleware/auth.js";
import upload from "../config/multer.js";
import uploadSizeImage from "../middleware/uploadSizeImage.js";

const userRouter = express.Router();

userRouter.post("/register", registerUser);
userRouter.post("/login", loginUser);
userRouter.post("/update-fcm-token", updateFcmToken);
userRouter.delete("/logout", authMiddleware, logoutUser);
userRouter.get("/profile", authMiddleware, getUserProfile);
userRouter.patch(
  "/profile",
  authMiddleware,
  upload.single("image"),
  uploadSizeImage,
  updateUserProfile
);
userRouter.patch("/update-location", authMiddleware, updateLocation);
userRouter.get("/people-nearby", authMiddleware, getPeopleNearby);
userRouter.post("/friend/request", authMiddleware, sendFriendRequest);
userRouter.get("/friend/requests", authMiddleware, checkFriendRequest);
userRouter.patch(
  "/friend/requests/:requestId",
  authMiddleware,
  acceptRejectFriendRequest
);
userRouter.get("/friends", authMiddleware, getAllFriend);
userRouter.get("/friends/search", authMiddleware, searchByUsernameOrPhone);
userRouter.get("/friends/recommendation", authMiddleware, recommendationFriend);
userRouter.delete("/friend/:friendId", authMiddleware, deleteFriend);
userRouter.get("/:id", authMiddleware, getUserProfileByUserId);

export default userRouter;
