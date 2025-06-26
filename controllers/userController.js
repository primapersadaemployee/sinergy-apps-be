import { prisma } from "../lib/prisma.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { getSocketId } from "../socket.js";
import { io } from "../index.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { ObjectId } from "mongodb";

dayjs.extend(utc);
dayjs.extend(timezone);

// Update FCM Token
const updateFcmToken = async (req, res) => {
  const { userId, fcmToken, oldToken } = req.body;

  if (!userId || !fcmToken) {
    return res
      .status(400)
      .json({ success: false, message: "userId and fcmToken are required" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Ambil token yang sudah ada, tambahkan token baru, dan hapus duplikat
    const currentTokens = user.fcmTokens || [];
    // console.log("Current tokens:", currentTokens);
    let updatedTokens;

    if (oldToken) {
      console.log(
        `Refreshing token for user ${userId}: replacing ${oldToken} with ${fcmToken}`
      );

      updatedTokens = currentTokens.map((token) =>
        token === oldToken ? fcmToken : token
      );

      if (!updatedTokens.includes(fcmToken)) {
        updatedTokens.push(fcmToken);
      }
    } else {
      console.log(`Adding new token for user ${userId}: ${fcmToken}`);
      updatedTokens = [...currentTokens, fcmToken];
    }

    const finalTokens = [...new Set(updatedTokens)];

    await prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: finalTokens },
    });

    return res
      .status(200)
      .json({ success: true, message: "FCM token processed successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Cek Profil Pribadi
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

// Lihat Profil Teman
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

    const formattedUserProfile = {
      username: userProfile.username,
      first_name: userProfile.first_name ?? "",
      last_name: userProfile.last_name ?? "",
      image: userProfile.image ?? "",
      gender: userProfile.gender ?? "",
      marriage_status: userProfile.marriage_status ?? "",
      phone: userProfile.phone,
      bio: userProfile.bio ?? "",
      desc: userProfile.desc ?? "",
      jobs: userProfile.jobs ?? "",
      location: userProfile.location ?? "",
    };

    return res.status(200).json({
      success: true,
      message: "Success get user profile",
      data: formattedUserProfile,
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

// Helper function untuk upload image ke cloudinary
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

// Update Profil User
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user;
    const data = { ...req.body }; // copy field yang dikirim user
    const image = req.file;

    // Ambil data user sekarang
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Validasi username jika dikirim dan diubah
    if (data.username && data.username !== currentUser.username) {
      const usernameExist = await prisma.user.findUnique({
        where: { username: data.username },
      });

      if (usernameExist) {
        return res
          .status(400)
          .json({ success: false, message: "Username already exists!" });
      }
    }

    // Handle image upload (optional)
    if (image) {
      // Delete image lama kalau ada
      if (currentUser.image) {
        const publicId = currentUser.image
          .split("/")
          .slice(-2)
          .join("/")
          .replace(/\.[^.]+$/, "");
        await cloudinary.uploader.destroy(publicId);
      }

      // Upload baru
      const imageUrl = await uploadToCloudinary(image.path);
      data.image = imageUrl;

      fs.unlinkSync(image.path); // Hapus file lokal
    }

    // Update hanya field yang dikirim
    await prisma.user.update({
      where: { id: userId },
      data,
    });

    return res
      .status(200)
      .json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

// Kirim Permintaan Pertemanan
const sendFriendRequest = async (req, res) => {
  const userId = req.user;
  const { receiverId } = req.body;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    // Cek apakah sudah ada permintaan pertemanan
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

    // Buat permintaan pertemanan
    const friendRequest = await prisma.friendRequest.create({
      data: {
        senderId: userId,
        receiverId,
      },
      include: {
        sender: {
          select: {
            username: true,
            image: true,
          },
        },
      },
    });

    // Kirim notifikasi ke penerima
    const receiverSocketId = await getSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friendRequest", {
        requestId: friendRequest.id,
        senderId: userId,
        username: friendRequest.sender.username,
        image: friendRequest.sender.image ?? null,
        date: dayjs(friendRequest.createdAt).tz(timezone).format("DD-MM-YYYY"),
        time: dayjs(friendRequest.createdAt).tz(timezone).format("HH:mm"),
      });
    }
    // if (receiverSocketId) {
    //   for (const sid of receiverSocketId) {
    //     io.to(sid).emit("friendRequest", {
    //       requestId: friendRequest.id,
    //       senderId: userId,
    //       username: friendRequest.sender.username,
    //       image: friendRequest.sender.image ?? null,
    //       date: dayjs(friendRequest.createdAt)
    //         .tz(timezone)
    //         .format("DD-MM-YYYY"),
    //       time: dayjs(friendRequest.createdAt).tz(timezone).format("HH:mm"),
    //     });
    //   }
    // }

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

// Cek Permintaan Pertemanan
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
            bio: true,
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
        image: request.sender.image ?? null,
        bio: request.sender.bio,
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

// Terima / Tolak Permintaan Pertemanan
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

      // Kirim Notifikasi Realtime
      const senderId = friendRequest.sender.id;
      const receiverId = friendRequest.receiver.id;

      // Notifikasi Pengirim
      const senderSocketId = await getSocketId(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit("friendAccepted", {
          userId: receiverId,
          username: friendRequest.receiver.username,
          bio: friendRequest.receiver.bio,
          image: friendRequest.receiver.image,
        });
      }
      // if (senderSocketId) {
      //   for (const sid of senderSocketId) {
      //     io.to(sid).emit("friendAccepted", {
      //       userId: receiverId,
      //       username: friendRequest.receiver.username,
      //       bio: friendRequest.receiver.bio,
      //       image: friendRequest.receiver.image,
      //     });
      //   }
      // }

      // Notifikasi Penerima
      const receiverSocketId = await getSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("friendAccepted", {
          userId: senderId,
          username: friendRequest.sender.username,
          bio: friendRequest.sender.bio,
          image: friendRequest.sender.image,
        });
      }
      // if (receiverSocketId) {
      //   for (const sid of receiverSocketId) {
      //     io.to(sid).emit("friendAccepted", {
      //       userId: senderId,
      //       username: friendRequest.sender.username,
      //       bio: friendRequest.sender.bio,
      //       image: friendRequest.sender.image,
      //     });
      //   }
      // }

      // Cek apakah sebelumnya sudah chat di nearby
      const existingChat = await prisma.chat.findFirst({
        where: {
          type: "nearby",
          AND: [
            { members: { some: { userId: senderId, isArchived: false } } },
            { members: { some: { userId: receiverId, isArchived: false } } },
          ],
        },
        select: {
          id: true,
        },
      });

      if (existingChat) {
        await prisma.chat.delete({
          where: { id: existingChat.id },
        });

        io.to(senderSocketId).emit("deleteNearbyChat", {
          chatId: existingChat.id,
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

// Lihat Semua Teman
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

    // Gunakan Set untuk melacak ID teman yang sudah diproses
    const seenFriendIds = new Set();
    const formattedFriends = friends
      .map((friendship) => {
        const friend =
          friendship.user1Id === userId ? friendship.user2 : friendship.user1;
        // Lewati jika ID teman sudah ada
        if (seenFriendIds.has(friend.id)) return null;
        seenFriendIds.add(friend.id);
        return {
          userId: friend.id,
          username: friend.username,
          bio: friend.bio,
          image: friend.image,
        };
      })
      // Filter entri null (duplikat yang dilewati)
      .filter((friend) => friend !== null);

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

// Cari User dengan Username atau Nomor Telepon
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
        fullname: fullname == "null null" ? "" : fullname,
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

// Rekomendasi Teman
const recommendationFriend = async (req, res) => {
  const userId = req.user;

  try {
    // Ambil data user (cek apakah user memiliki lokasi atau tidak)
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        locations: true,
      },
    });

    // Ambil semua teman user
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

    // Ambil user yang sudah kirim/terima request
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

    // Kumpulan ID yang harus dikecualikan dari hasil
    const excludeIds = [userId, ...friendIds, ...requestedUserIds];
    const excludeObjectIds = excludeIds.map((id) => new ObjectId(id));

    let recommendedUsers = [];

    // Jika user punya lokasi, cari user lain dengan lokasi terdekat
    if (currentUser.locations !== null) {
      const pipeline = [
        {
          $geoNear: {
            near: currentUser.locations, // GeoJSON
            distanceField: "distance",
            maxDistance: 10000, // 10km
            spherical: true,
          },
        },
        {
          $match: {
            _id: { $nin: excludeObjectIds },
          },
        },
        {
          $project: {
            _id: 1,
            username: 1,
            bio: 1,
            image: 1,
            jobs: 1,
            distance: 1,
          },
        },
        { $sort: { distance: 1 } },
        { $limit: 6 },
      ];

      const result = await prisma.$runCommandRaw({
        aggregate: "users",
        pipeline,
        cursor: {},
      });

      const excludeIdStrs = excludeIds.map(String); // Semua jadi string

      recommendedUsers =
        result?.cursor?.firstBatch
          ?.filter((user) => !excludeIdStrs.includes(user._id["$oid"])) // Filter semua
          ?.map((user) => ({
            id: user._id["$oid"],
            username: user.username,
            bio: user.bio ?? null,
            image: user.image ?? null,
            jobs: user.jobs ?? null,
          })) ?? [];
    }

    // Jika user tidak punya teman & lokasi tidak diisi, tampilkan random 6 user
    if (currentUser.locations === null && friendIds.length === 0) {
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

// Hapus Teman
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

// Update Lokasi User
const updateLocation = async (req, res) => {
  const userId = req.user;
  const { latitude, longitude } = req.body;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        locations: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        locationsUpdatedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
    });
  } catch (error) {
    console.error("Error in updateLocation:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating location",
      error: error.message,
    });
  }
};

// Cari Orang Terdekat
const getPeopleNearby = async (req, res) => {
  const userId = req.user;
  const { radius = 10000, gender } = req.query;

  try {
    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const currentObjectId = new ObjectId(userId);

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { locations: true, username: true },
    });

    if (!currentUser || !currentUser.locations) {
      return res.status(400).json({
        success: false,
        message: "User not found or location not set",
      });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { user1Id: true, user2Id: true },
    });

    const friendIdsSet = new Set();
    for (const f of friendships) {
      const friendId = String(f.user1Id === userId ? f.user2Id : f.user1Id);
      friendIdsSet.add(friendId);
    }

    const friendRequests = await prisma.friendRequest.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        senderId: true,
        receiverId: true,
        status: true,
      },
    });

    // Build aggregation pipeline
    const pipeline = [
      {
        $geoNear: {
          near: currentUser.locations, // GeoJSON { type: 'Point', coordinates: [lng, lat] }
          distanceField: "distance",
          maxDistance: parseInt(radius),
          spherical: true,
        },
      },
      {
        $match: {
          _id: { $ne: currentObjectId },
          ...(gender ? { gender } : {}),
        },
      },
      {
        $project: {
          _id: 1,
          username: 1,
          bio: 1,
          gender: 1,
          image: 1,
          distance: 1,
        },
      },
      {
        $sort: { distance: 1 },
      },
    ];

    const usersRawResult = await prisma.$runCommandRaw({
      aggregate: "users",
      pipeline,
      cursor: {},
    });

    const rawUsers = usersRawResult?.cursor?.firstBatch ?? [];

    // Tambahan filter manual agar user sendiri tidak terbawa
    const filteredRawUsers = rawUsers.filter(
      (user) => user._id?.["$oid"] !== userId
    );

    const nearbyUsers = await Promise.all(
      filteredRawUsers.map(async (user) => {
        const userIdString = user._id?.["$oid"];
        const isFriend = friendIdsSet.has(userIdString);

        const request = friendRequests.find(
          (r) =>
            (r.senderId === userId && r.receiverId === userIdString) ||
            (r.receiverId === userId && r.senderId === userIdString)
        );

        const status = request?.status ?? "available";

        return {
          id: userIdString,
          username: user.username,
          bio: user.bio ?? null,
          gender: user.gender ?? null,
          image: user.image ?? null,
          distance: user.distance.toFixed(0),
          isFriend,
          status,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved nearby users",
      data: nearbyUsers,
    });
  } catch (error) {
    console.error("Error in getPeopleNearby:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving nearby users",
      error: error.message,
    });
  }
};

export {
  updateFcmToken,
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
  updateLocation,
  getPeopleNearby,
};
