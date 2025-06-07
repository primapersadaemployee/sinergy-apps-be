import { prisma } from "../lib/prisma.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { getSocketId } from "../socket.js";
import { io } from "../index.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
// import { userSocketMap } from "../socket.js";

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

    // Check if username already exists
    const checkUsername = await prisma.user.findUnique({
      where: {
        username: username,
      },
    });

    if (checkUsername) {
      return res
        .status(400)
        .json({ success: false, message: "Username already exists!" });
    }

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
  const { timezone = "Asia/Jakarta" } = req.query;

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
    const receiverSocketId = await getSocketId(receiverId);
    // const receiverSocketId = userSocketMap.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friendRequest", {
        requestId: friendRequest.id,
        senderId: userId,
        username: friendRequest.sender.username,
        date: dayjs(friendRequest.createdAt).tz(timezone).format("DD-MM-YYYY"),
        time: dayjs(friendRequest.createdAt).tz(timezone).format("HH:mm"),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Success send friend request",
      data: {
        requestId: friendRequest.id,
        date: dayjs(friendRequest.createdAt).tz(timezone).format("DD-MM-YYYY"),
        time: dayjs(friendRequest.createdAt).tz(timezone).format("HH:mm"),
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
      orderBy: {
        createdAt: "desc",
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
        sender: {
          select: {
            id: true,
            username: true,
            bio: true,
            image: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            bio: true,
            image: true,
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

      // Send notification realtime
      const senderId = friendRequest.sender.id;
      const receiverId = friendRequest.receiver.id;

      // Notify sender
      const senderSocketId = await getSocketId(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("friendAccepted", {
          userId: receiverId,
          username: friendRequest.receiver.username,
          bio: friendRequest.receiver.bio,
          image: friendRequest.receiver.image,
        });
      }

      // Notify receiver
      const receiverSocketId = await getSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("friendAccepted", {
          userId: senderId,
          username: friendRequest.sender.username,
          bio: friendRequest.sender.bio,
          image: friendRequest.sender.image,
        });
      }
    }

    if (status === "rejected") {
      await prisma.friendRequest.delete({
        where: { id: requestId },
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
  const { timezone = "Asia/Jakarta" } = req.query;

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
            bio: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            image: true,
            bio: true,
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
        bio: friend.bio,
        image: friend.image,
      };
    });

    const sortedFriends = formattedFriends.sort((a, b) =>
      a.username.localeCompare(b.username)
    );

    return res.status(200).json({
      success: true,
      message: "Success get all friend",
      data: sortedFriends,
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

// Search by username or phone
const searchByUsernameOrPhone = async (req, res) => {
  const userId = req.user;
  const { keyword } = req.query;

  if (!keyword) {
    return res.status(400).json({
      success: false,
      message: "Keyword is required",
    });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                username: {
                  contains: keyword,
                  mode: "insensitive",
                },
              },
              {
                phone: {
                  contains: keyword,
                  mode: "insensitive",
                },
              },
            ],
          },
          {
            id: {
              not: userId,
            },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        first_name: true,
        last_name: true,
        phone: true,
        image: true,
        sentFriendRequests: {
          where: {
            receiverId: userId,
          },
          select: {
            status: true,
          },
        },
        receivedFriendRequests: {
          where: {
            senderId: userId,
          },
          select: {
            status: true,
          },
        },
      },
    });

    const formattedUsers = users.map((user) => {
      const fullname = `${user.first_name} ${user.last_name}`;
      const status =
        user.sentFriendRequests?.length > 0
          ? user.sentFriendRequests[0].status
          : user.receivedFriendRequests?.length > 0
          ? user.receivedFriendRequests[0].status
          : "available";

      return {
        id: user.id,
        username: user.username,
        fullname: fullname,
        image: user.image,
        status: status,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Success search by username or phone",
      data: formattedUsers,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Error search by username or phone",
      error: error.message,
    });
  }
};

// Recommendation Friend
const recommendationFriend = async (req, res) => {
  const userId = req.user;

  try {
    // 1. Ambil data user (cek apakah isi jobs atau tidak)
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        jobs: true,
      },
    });

    // 2. Ambil semua teman user
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: {
        user1Id: true,
        user2Id: true,
      },
    });

    const friendIds = friendships.map((f) =>
      f.user1Id === userId ? f.user2Id : f.user1Id
    );

    // 3. Ambil user yang sudah kirim/terima request
    const allFriendRequests = await prisma.friendRequest.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        senderId: true,
        receiverId: true,
      },
    });

    const requestedUserIds = allFriendRequests.map((r) =>
      r.senderId === userId ? r.receiverId : r.senderId
    );

    // 4. Kumpulan ID yang harus dikecualikan dari hasil
    const excludeIds = [userId, ...friendIds, ...requestedUserIds];

    let recommendedUsers = [];

    // 5. Jika user punya `jobs`, cari user lain dengan jobs yang sama
    if (currentUser.jobs && currentUser.jobs.trim() !== "") {
      const keyword =
        currentUser.jobs?.split(" ").filter((k) => k.length > 2) || [];

      const jobFilters = keyword.map((word) => ({
        jobs: {
          contains: word,
          mode: "insensitive",
        },
      }));

      recommendedUsers = await prisma.user.findMany({
        where: {
          id: { notIn: excludeIds },
          OR: jobFilters,
        },
        select: {
          id: true,
          username: true,
          bio: true,
          image: true,
          jobs: true,
        },
        take: 6,
      });
    }

    // 6. Jika user tidak punya teman & jobs tidak diisi, tampilkan random 6 user
    if (
      (!currentUser.jobs || currentUser.jobs.trim() === "") &&
      friendIds.length === 0
    ) {
      const candidates = await prisma.user.findMany({
        where: {
          id: { notIn: excludeIds },
        },
        select: {
          id: true,
          username: true,
          bio: true,
          image: true,
          jobs: true,
        },
      });

      recommendedUsers = candidates.sort(() => Math.random() - 0.5).slice(0, 6);
    }

    // Emit ke client jika pakai socket
    const receiverSocketId = await getSocketId(userId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("recommendation-friend", recommendedUsers);
    }

    return res.status(200).json({
      success: true,
      message: "Success get recommendation friend",
      data: recommendedUsers,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error get recommendation friend",
      error: error.message,
    });
  }
};

// Delete Friend
const deleteFriend = async (req, res) => {
  const userId = req.user;
  const { friendId } = req.params;

  try {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: friendId },
          { user1Id: friendId, user2Id: userId },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: "Friendship not found",
      });
    }

    await prisma.$transaction([
      prisma.friendship.delete({
        where: {
          id: friendship.id,
        },
      }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: userId, receiverId: friendId },
            { senderId: friendId, receiverId: userId },
          ],
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Friend deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error deleting friend",
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
  searchByUsernameOrPhone,
  recommendationFriend,
  deleteFriend,
};
