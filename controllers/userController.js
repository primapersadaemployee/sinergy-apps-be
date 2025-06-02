import { prisma } from "../lib/prisma.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { userSocketMap } from "../socket.js";
import { io } from "../index.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Get User Profile
const getUserProfile = async (req, res) => {
  const userId = req.user;
  try {
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        image: true,
        first_name: true,
        last_name: true,
        email: true,
        bio: true,
        gender: true,
        location: true,
        phone: true,
        jobs: true,
        marriage_status: true,
        desc: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Success get profile",
      data: userProfile,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Error get profile" });
  }
};

// Get user profile by id (Done)
const getUserProfileByUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    const userProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        first_name: true,
        last_name: true,
        image: true,
        gender: true,
        marriage_status: true,
        phone: true,
        bio: true,
        desc: true,
        jobs: true,
        location: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Success get user profile",
      data: userProfile,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function upload image to cloudinary
const uploadToCloudinary = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "chatting-apps",
      use_filename: true,
      transformation: [
        { width: 500, height: 500, crop: "limit" },
        { quality: "auto" },
        { fetch_format: "auto" },
      ],
    });

    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw new Error("Image upload failed");
  }
};

// Update User Profile (Done)
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user;
    const {
      username,
      first_name,
      last_name,
      gender,
      marriage_status,
      phone,
      bio,
      desc,
      jobs,
      location,
    } = req.body;
    const image = req.file;

    const userImageOld = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });

    let imageUrl = null;
    if (image) {
      // Delete old image from cloudinary
      if (userImageOld.image !== null) {
        const publicId = userImageOld.image
          .split("/")
          .slice(-2)
          .join("/")
          .replace(/\.[^.]+$/, "");
        cloudinary.uploader.destroy(publicId);
      }

      // Upload to cloudinary
      imageUrl = await uploadToCloudinary(image.path);

      // Delete file local after upload
      fs.unlinkSync(image.path);
    }

    // Update user profile
    await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        first_name,
        last_name,
        image: imageUrl,
        gender,
        marriage_status,
        phone,
        bio,
        desc,
        jobs,
        location,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Success update user profile" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

// Send Friend Request
const sendFriendRequest = async (req, res) => {
  const userId = req.user;
  const { receiverId } = req.body;

  try {
    // Check if the user is already a friend
    const existingFriendship = await prisma.friendRequest.findFirst({
      where: {
        OR: [{ senderId: userId, receiverId }],
      },
      select: {
        status: true,
      },
    });

    if (existingFriendship) {
      return res.status(400).json({
        success: false,
        message: `You are already ${existingFriendship.status} with this user.`,
      });
    }

    // Create friend request
    const friendRequest = await prisma.friendRequest.create({
      data: {
        senderId: userId,
        receiverId,
      },
      include: {
        sender: {
          select: {
            username: true,
          },
        },
      },
    });

    // Send notification realtime
    const receiverSocketId = userSocketMap.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friendRequest", {
        requestId: friendRequest.id,
        senderId: userId,
        username: friendRequest.sender.username,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Success send friend request",
      data: {
        requestId: friendRequest.id,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error send friend request",
      error: error.message,
    });
  }
};

// Check friend request
const checkFriendRequest = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const friendRequests = await prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        status: "pending",
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
      },
    });

    const formattedFriendRequests = friendRequests.map((request) => {
      const date = dayjs(request.createdAt).tz(timezone).format("DD-MM-YYYY");
      const time = dayjs(request.createdAt).tz(timezone).format("HH:mm:ss");

      return {
        id: request.id,
        userId: request.sender.id,
        username: request.sender.username,
        image: request.sender.image,
        date: date,
        time: time,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Success check friend request",
      data: formattedFriendRequests,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error check friend request",
      error: error.message,
    });
  }
};

// Accept or Reject Friend Request
const acceptRejectFriendRequest = async (req, res) => {
  const userId = req.user;
  const { requestId } = req.params;
  const { status } = req.body;

  try {
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id: requestId, status: "pending" },
      include: {
        receiver: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        message: "Friend request not found",
      });
    }

    if (friendRequest.receiverId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to accept or reject this request",
      });
    }

    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status },
    });

    if (status === "accepted") {
      await prisma.friendship.create({
        data: {
          user1Id: friendRequest.senderId,
          user2Id: friendRequest.receiverId,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Friend request ${status} successfully`,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error accept or reject friend request",
      error: error.message,
    });
  }
};

// Get All Friend
const getAllFriend = async (req, res) => {
  const userId = req.user;

  try {
    const friends = await prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: {
        user1Id: true,
        user2Id: true,
        user1: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
      },
    });

    const formattedFriends = friends.map((friendship) => {
      const friend =
        friendship.user1Id === userId ? friendship.user2 : friendship.user1;
      return {
        userId: friend.id,
        username: friend.username,
        image: friend.image,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Success get all friend",
      data: formattedFriends,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error get all friend",
      error: error.message,
    });
  }
};

// Search by username
const searchByUsername = async (req, res) => {
  const userId = req.user;
  const { username } = req.query;

  try {
    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: username,
          mode: "insensitive",
        },
        NOT: {
          id: userId,
        },
      },
      select: {
        id: true,
        username: true,
        image: true,
      },
    });
    return res.status(200).json({
      success: true,
      message: "Success search by username",
      data: users,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error search by username",
      error: error.message,
    });
  }
};

// Recommendation Friend
const recommendationFriend = async (req, res) => {
  const userId = req.user;

  try {
    const mutualFriendsRecommendation = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          {
            OR: [
              {
                friendships1: {
                  some: {
                    user2: {
                      OR: [
                        { friendships1: { some: { user2Id: userId } } },
                        { friendships2: { some: { user1Id: userId } } },
                      ],
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        image: true,
      },
      take: 10,
    });
    return res.status(200).json({
      success: true,
      message: "Success get recommendation friend",
      data: mutualFriendsRecommendation,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error get recommendation friend",
      error: error.message,
    });
  }
};

export {
  getUserProfile,
  getUserProfileByUserId,
  updateUserProfile,
  sendFriendRequest,
  checkFriendRequest,
  acceptRejectFriendRequest,
  getAllFriend,
  searchByUsername,
  recommendationFriend,
};
