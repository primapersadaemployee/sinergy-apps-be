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
} from "../controllers/userController.js";
import { logoutUser } from "../controllers/authController.js";
import authMiddleware from "../middleware/auth.js";
import upload from "../config/multer.js";
import uploadSizeImage from "../middleware/uploadSizeImage.js";

const userRouter = express.Router();

/**
 * @swagger
 * /api/user/register:
 *   post:
 *     summary: Register New User
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - phone
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: secret123
 *               phone:
 *                 type: string
 *                 example: "081234567890"
 *     responses:
 *       201:
 *         description: User registered successfully!
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User registered successfully!
 *       400:
 *         description: Input not valid / Email already exists!
 *       500:
 *         description: Internal server error!
 */
userRouter.post("/register", registerUser);
/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: Login User
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: secret123
 *     responses:
 *       200:
 *         description: Login success!
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login success!
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzE3MjMwMjYzfQ.S5P8WQgKZKX555555555555555555555555555555
 *       400:
 *         description: User not found / Invalid password!
 *       500:
 *         description: Internal server error!
 */
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
