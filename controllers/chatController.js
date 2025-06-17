import { prisma } from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isToday from "dayjs/plugin/isToday.js";
import isYesterday from "dayjs/plugin/isYesterday.js";
import { getSocketId, io } from "../socket.js";
import redisClient from "../lib/redis.js";
import admin from "../lib/firebase.js";
import { v2 as cloudinary } from "cloudinary";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

// Semua Pesan Private
const getAllChatFriends = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        type: "private",
        members: {
          some: {
            userId: userId,
            isArchived: false,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const formattedChats = await Promise.all(
      chats.map(async (chat) => {
        const otherMembers = chat.members.filter(
          (member) => member.userId !== userId
        );
        const lastMessage = chat.messages[0];
        const created = lastMessage
          ? dayjs(lastMessage.createdAt).tz(timezone)
          : null;
        let time = "";
        if (created) {
          if (created.isToday()) {
            time = created.format("HH:mm");
          } else if (created.isYesterday()) {
            time = "Kemarin";
          } else {
            time = created.format("DD-MM-YYYY");
          }
        }

        // Data status online
        const isOnline =
          (await redisClient.get(`online:${otherMembers[0].user.id}`)) ===
          "true";

        // Ambil unreadCount dari Redis, dengan fallback ke database
        let unreadCount;
        try {
          unreadCount = await redisClient.get(`unread:${userId}:${chat.id}`);
        } catch (error) {
          console.log(
            `Redis error for user ${userId} and chat ${chat.id}:`,
            error.message
          );
          unreadCount = null;
        }
        if (unreadCount === null || lastMessage?.senderId === userId) {
          if (lastMessage?.senderId === userId) {
            unreadCount = 0;
            try {
              await redisClient.set(`unread:${userId}:${chat.id}`, 0, {
                EX: 3600, // Expire dalam 1 jam
              });
            } catch (error) {
              console.log(`Redis set error:`, error.message);
            }
          } else {
            unreadCount = await prisma.message.count({
              where: {
                chatId: chat.id,
                NOT: {
                  reads: {
                    some: { userId: userId },
                  },
                },
              },
            });
            try {
              await redisClient.set(
                `unread:${userId}:${chat.id}`,
                unreadCount,
                {
                  EX: 3600, // Expire dalam 1 jam
                }
              );
            } catch (error) {
              console.log(`Redis set error:`, error.message);
            }
          }
        }

        return {
          id: chat.id,
          userId: otherMembers[0]?.user.id,
          type: chat.type,
          name: otherMembers[0]?.user.username || "Unknown User",
          image: otherMembers[0]?.user.image || null,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                sender: lastMessage.sender.username,
                time: time,
              }
            : null,
          unreadCount: parseInt(unreadCount || "0"),
          isOnline: isOnline,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved all chats",
      data: formattedChats,
    });
  } catch (error) {
    console.error("Error in getAllChatFriends:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving chats",
      error: error.message,
    });
  }
};

// Semua Pesan Group
const getAllChatGroups = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        type: "group",
        members: {
          some: {
            userId: userId,
            isArchived: false,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const formattedChats = chats.map((chat) => {
      const lastMessage = chat.messages[0];
      const created = lastMessage
        ? dayjs(lastMessage.createdAt).tz(timezone)
        : null;
      let time = "";
      if (created) {
        if (created.isToday()) {
          time = created.format("HH:mm");
        } else if (created.isYesterday()) {
          time = "Kemarin";
        } else {
          time = created.format("DD-MM-YYYY");
        }
      }

      return {
        id: chat.id,
        type: chat.type,
        groupName: chat.name,
        image: chat.icon,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              sender: lastMessage.sender.username,
              time: time,
              createdAt: lastMessage.createdAt,
            }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved all chats",
      data: formattedChats,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving chats",
      error: error.message,
    });
  }
};

// Semua Pesan Archived
const getArchivedChats = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const archivedChats = await prisma.chat.findMany({
      where: {
        members: {
          some: {
            userId: userId,
            isArchived: true,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const formattedChats = archivedChats.map((chat) => {
      const created = chat.messages[0]
        ? dayjs(chat.messages[0].createdAt).tz(timezone)
        : null;
      let time = "";
      if (created) {
        if (created.isToday()) {
          time = created.format("HH:mm");
        } else if (created.isYesterday()) {
          time = "Kemarin";
        } else {
          time = created.format("DD-MM-YYYY");
        }
      }

      return {
        id: chat.id,
        type: chat.type,
        name:
          chat.type === "private"
            ? chat.members.find((member) => member.userId !== userId)?.user
                .username
            : chat.name,
        image:
          chat.type === "private"
            ? chat.members.find((member) => member.userId !== userId)?.user
                .image
            : chat.icon,
        lastMessage: chat.messages[0]
          ? {
              content: chat.messages[0].content,
              sender: chat.messages[0].sender.username,
              time: time,
              createdAt: chat.messages[0].createdAt,
            }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved archived chats",
      data: formattedChats,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving archived chats",
      error: error.message,
    });
  }
};

// Buat Grup Chat
const createGroupChat = async (req, res) => {
  const userId = req.user;
  const { name, description, memberIds } = req.body;

  try {
    // Termasuk user sendiri
    const uniqueMemberIds = [...new Set([userId, ...memberIds])];

    // Buat grup chat
    const newGroupChat = await prisma.chat.create({
      data: {
        type: "group",
        name,
        description,
        members: {
          create: uniqueMemberIds.map((memberId) => ({
            userId: memberId,
            role: memberId === userId ? "admin" : "member",
          })),
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Semua member masuk room
    for (const memberId of uniqueMemberIds) {
      const socketId = await getSocketId(memberId);
      if (socketId) {
        io.to(socketId).emit("newGroupChat", {
          id: newGroupChat.id,
          name: newGroupChat.name,
          description: newGroupChat.description,
          members: newGroupChat.members.map((m) => ({
            userId: m.user.id,
            username: m.user.username,
            image: m.user.image,
            role: m.role,
          })),
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "Group chat created successfully",
      data: {
        id: newGroupChat.id,
        name: newGroupChat.name,
        description: newGroupChat.description,
        members: newGroupChat.members.map((member) => ({
          userId: member.user.id,
          username: member.user.username,
          image: member.user.image,
          role: member.role,
        })),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error creating group chat",
      error: error.message,
    });
  }
};

// Lihat Detail Grup Chat
const getListGroupChat = async (req, res) => {
  const userId = req.user;
  const { groupId } = req.params;

  try {
    const groupChat = await prisma.chat.findUnique({
      where: {
        id: groupId,
        type: "group",
        members: {
          some: {
            userId: userId,
            isArchived: false,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: "Group chat not found",
      });
    }

    const formattedGroupChat = {
      id: groupChat.id,
      name: groupChat.name,
      icon: groupChat.icon,
      description: groupChat.description,
      members: groupChat.members.map((member) => ({
        userId: member.user.id,
        username: member.user.username,
        image: member.user.image,
        role: member.role,
      })),
    };

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved list group chat",
      data: formattedGroupChat,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error getting list group chat",
      error: error.message,
    });
  }
};

// Tambah Member ke Grup Chat
const addGroupMembers = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;
  const { memberIds } = req.body;

  try {
    // Cek apakah user adalah admin
    const userMembership = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
        role: "admin",
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        success: false,
        message: "Only admin can add members to the group",
      });
    }

    // Tambah member
    const newMembers = await prisma.chatMember.createMany({
      data: memberIds.map((memberId) => ({
        chatId,
        userId: memberId,
        role: "member",
        isArchived: false,
      })),
    });

    // Semua member masuk room
    for (const memberId of memberIds) {
      const socketId = await getSocketId(memberId);
      if (socketId) {
        io.to(socketId).emit("addedToGroup", {
          chatId,
          name: (await prisma.chat.findUnique({ where: { id: chatId } })).name,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Members added successfully",
      data: {
        addedCount: newMembers.count,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error adding members to group",
      error: error.message,
    });
  }
};

// Lihat Pesan
const getChatMessages = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    // Cek keanggotaan chat
    const membership = await prisma.chatMember.findFirst({
      where: { chatId, userId },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this chat",
      });
    }

    // Siapkan klausa 'where' untuk query pesan secara dinamis
    const messageWhereClause = {
      chatId,
    };

    // Jika ada timestamp 'deleted_at', filter pesan yang lebih baru saja
    if (membership.deletedAt) {
      messageWhereClause.createdAt = {
        gte: membership.deletedAt,
      };
    }

    // Ambil informasi chat untuk private / group chat
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        type: true,
        name: true,
        icon: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Ambil semua pesan tanpa pagination
    const messages = await prisma.message.findMany({
      where: messageWhereClause,
      include: {
        sender: { select: { id: true, username: true, image: true } },
        reads: { select: { userId: true, readAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Tandai pesan yang belum dibaca sebagai dibaca
    const unreadMessages = await prisma.message.findMany({
      where: {
        chatId,
        ...messageWhereClause,
        NOT: {
          reads: {
            some: { userId },
          },
        },
      },
      select: { id: true },
    });

    if (unreadMessages.length > 0) {
      // Buat entri MessageRead untuk pesan yang belum dibaca
      await prisma.messageRead.createMany({
        data: unreadMessages.map((msg) => ({
          messageId: msg.id,
          userId: userId,
          readAt: new Date(),
        })),
      });

      // Emit event Socket.IO ke semua member chat
      const chatMembers = await prisma.chatMember.findMany({
        where: { chatId, NOT: { userId }, isArchived: false },
        select: { userId: true },
      });

      // Kirim update unreadCount ke room chat
      io.to(chatId).emit("unreadCountUpdate", {
        chatId,
        userId,
      });
    }

    // Data status online
    let onlineStatus = {};
    if (chat.type === "private") {
      const otherMember = chat.members.find((m) => m.userId !== userId);
      if (otherMember) {
        const isOnline =
          (await redisClient.get(`online:${otherMember.userId}`)) === "true";
        onlineStatus = {
          type: "private",
          friend: {
            userId: otherMember.userId,
            username: otherMember.user.username,
            image: otherMember.user.image,
            isOnline,
          },
        };
      }
    } else {
      const onlineMembers = await Promise.all(
        chat.members
          .filter((m) => m.userId !== userId)
          .map(async (m) => {
            try {
              const isOnline =
                (await redisClient.get(`online:${m.userId}`)) === "true";
              return isOnline;
            } catch (error) {
              console.log(
                `Redis error checking online status for user ${m.userId}:`,
                error.message
              );
              return false;
            }
          })
      );

      const onlineCount = onlineMembers.filter(Boolean).length;
      onlineStatus = {
        type: "group",
        onlineCount,
      };
    }

    // Format pesan
    const formattedMessages = messages.map((msg) => {
      const created = dayjs(msg.createdAt).tz(timezone);
      return {
        id: msg.id,
        content: msg.content,
        messageType: msg.messageType,
        sender: {
          id: msg.sender.id,
          username: msg.sender.username,
          image: msg.sender.image,
        },
        reads: msg.reads,
        date: created.format("DD-MM-YYYY"),
        time: created.format("HH:mm"),
        createdAt: msg.createdAt,
      };
    });

    // Grouping berdasarkan tanggal
    const grouped = {};
    formattedMessages.forEach((msg) => {
      const created = dayjs(msg.createdAt).tz(timezone);
      let label = created.format("DD-MM-YYYY");

      if (created.isToday()) label = "Hari Ini";
      else if (created.isYesterday()) label = "Kemarin";

      grouped[label] = grouped[label] || {
        label,
        date: created.format("DD-MM-YYYY"),
        message: [],
      };
      grouped[label].message.push(msg);
    });

    const groupedArray = Object.values(grouped).sort((a, b) => {
      return (
        dayjs(b.date, "DD-MM-YYYY").valueOf() -
        dayjs(a.date, "DD-MM-YYYY").valueOf()
      );
    });

    // Update last read
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved chat messages",
      data: {
        messages: groupedArray,
        onlineStatus,
      },
    });
  } catch (error) {
    console.error("Error in getChatMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving chat messages",
      error: error.message,
    });
  }
};

// Archive/Unarchive chat
const toggleArchiveChat = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;

  try {
    const chatMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
      },
    });

    if (!chatMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this chat",
      });
    }

    const archive = chatMember.isArchived ? false : true;

    await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      data: {
        isArchived: archive,
        archivedAt: archive ? new Date() : null,
      },
    });

    if (!archive) {
      const socketId = await getSocketId(userId);
      if (socketId) {
        io.to(socketId).emit("unarchivedChat", { chatId });
      }
    }

    return res.status(200).json({
      success: true,
      message: archive
        ? "Chat archived successfully"
        : "Chat unarchived successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error toggling chat archive status",
      error: error.message,
    });
  }
};

// Bersihkan Riwayat Chat Sendiri
const clearMyChatHistory = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;

  try {
    // Cari member chat
    const chatMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
      },
    });

    if (!chatMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this chat",
      });
    }

    // Update deletedAt
    await prisma.chatMember.update({
      where: {
        id: chatMember.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Kirim event ke socket
    const userSocketId = await getSocketId(userId);
    if (userSocketId) {
      io.to(userSocketId).emit("clearChatHistory", chatId);
    }

    return res.status(200).json({
      success: true,
      message: "Chat history cleared successfully",
    });
  } catch (error) {
    console.error("Error in clearMyChatHistory:", error);
    return res.status(500).json({
      success: false,
      message: "Error clearing chat history",
      error: error.message,
    });
  }
};

// Socket.IO Handlers
const startPrivateChat = async (socket, io, { userId, friendId }, callback) => {
  try {
    console.log(`User ${userId} is starting a private chat with ${friendId}`);
    // Validasi friendId
    if (!friendId || friendId === userId) {
      callback({ success: false, message: "Invalid friend ID" });
      return;
    }

    // Cek apakah sudah berteman
    const areFriends = await prisma.friendship.findFirst({
      where: {
        OR: [
          { AND: [{ user1Id: userId }, { user2Id: friendId }] },
          { AND: [{ user1Id: friendId }, { user2Id: userId }] },
        ],
      },
    });

    if (!areFriends) {
      callback({
        success: false,
        message: "You can only start a chat with your friends",
      });
      return;
    }

    // Cek apakah chat sudah ada
    const existingChat = await prisma.chat.findFirst({
      where: {
        type: "private",
        AND: [
          {
            members: {
              some: { userId: userId, isArchived: false },
            },
          },
          {
            members: {
              some: { userId: friendId, isArchived: false },
            },
          },
        ],
      },
      include: { members: true },
    });

    if (existingChat) {
      callback({
        success: true,
        message: "Chat already exists",
        chatId: existingChat.id,
      });
      return;
    }

    // Buat chat baru
    const newChat = await prisma.chat.create({
      data: {
        type: "private",
        members: {
          create: [
            { userId: userId, role: "member", isArchived: false },
            { userId: friendId, role: "member", isArchived: false },
          ],
        },
      },
      include: { members: true },
    });

    // Balas ke pengirim
    callback({
      success: true,
      message: "Private chat created successfully",
      chatId: newChat.id,
    });

    const friend = await prisma.user.findUnique({
      where: { id: friendId },
      select: { username: true, image: true, isOnline: true },
    });

    // Kirim event ke socket
    const formattedNewPrivateChat = {
      id: newChat.id,
      type: newChat.type,
      name: friend.username,
      image: friend.image ?? null,
      lastMessage: null,
      unreadCount: 0,
      isOnline: friend.isOnline ?? false,
    };

    const socketId = await redisClient.get(`user:${userId}`);
    io.to(socketId).emit("newPrivateChat", formattedNewPrivateChat);
  } catch (error) {
    console.error("Error starting private chat:", error);
    callback({ success: false, message: "Error creating private chat" });
  }
};

const joinChat = async (socket, io, { chatId }) => {
  try {
    const userId = socket.userId;
    const username = socket.username;
    const chatMember = await prisma.chatMember.findFirst({
      where: { chatId, userId, isArchived: false },
    });

    if (!chatMember) {
      console.log(`User ${userId} is not a member of chat ${chatId}`);
      return;
    }

    socket.join(chatId);
    console.log(`User ${userId} joined chat room: ${chatId}`);

    // Ambil data chat untuk mendapatkan anggota lain
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        type: true,
        members: { select: { userId: true } },
      },
    });

    // Kirim userStatusUpdate ke anggota lain di chat
    const otherMembers = chat.members.filter((m) => m.userId !== userId);
    for (const member of otherMembers) {
      const socketId = await redisClient.get(`user:${member.userId}`);
      if (socketId) {
        io.to(socketId).emit("userStatusUpdate", {
          userId,
          username,
          isOnline: true,
          chatId,
          chatType: chat.type,
        });
      }
    }
  } catch (error) {
    console.error("Error joining chat:", error);
  }
};

const leaveChat = async (socket, io, { chatId }) => {
  try {
    const userId = socket.userId;
    socket.leave(chatId);
    console.log(`User ${userId} left chat room: ${chatId}`);
  } catch (error) {
    console.error("Error leaving chat:", error);
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

const sendNotification = async (receiverId, title, body, chatId) => {
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { username: true, fcmTokens: true },
  });

  console.log(
    "Receiver username & fcmTokens:",
    receiver.username,
    receiver.fcmTokens
  );

  if (receiver?.fcmTokens?.length > 0) {
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        chatId: chatId.toString(),
        type: "message",
      },
      tokens: receiver.fcmTokens,
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log("Notification response:", response);
      response.responses.forEach((res, index) => {
        if (!res.success) {
          console.error(
            `Error sending notification to token ${receiver.fcmTokens[index]}: ${res.error}`
          );
        }
      });
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  }
};

const sendMessage = async (
  socket,
  io,
  { chatId, content, messageType = "text" }
) => {
  const userId = socket.userId;
  const username = socket.username;
  const timezone = "Asia/Jakarta";

  try {
    const chatMember = await prisma.chatMember.findFirst({
      where: { chatId, userId, isArchived: false },
    });

    if (!chatMember) {
      return;
    }

    // Buat Pesan Baru
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        content,
        messageType,
        reads: {
          create: [{ userId: userId, readAt: new Date() }],
        },
      },
      include: {
        sender: { select: { id: true, username: true, image: true } },
        reads: true,
      },
    });

    // Set unreadCount pengirim ke 0
    await redisClient.set(`unread:${userId}:${chatId}`, 0, { EX: 3600 });

    // Update waktu chat
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    // Ambil data chat
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Format Pesan untuk event newMessage
    const formattedMessage = {
      chatId,
      type: chat.type,
      name: chat.type === "private" ? message.sender.username : chat.name,
      image: chat.type === "private" ? message.sender.image : chat.icon,
      message: {
        id: message.id,
        content: message.content,
        messageType: message.messageType,
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          image: message.sender.image,
        },
        reads: message.reads,
        date: dayjs(message.createdAt).tz(timezone).format("DD-MM-YYYY"),
        time: dayjs(message.createdAt).tz(timezone).format("HH:mm"),
        createdAt: message.createdAt.toISOString(),
      },
    };

    // Ambil semua anggota chat
    const chatMembers = await prisma.chatMember.findMany({
      where: { chatId, isArchived: false },
      select: { userId: true, deletedAt: true },
    });

    // Dapatkan user yang tergabung dalam room chat
    const room = io.sockets.adapter.rooms.get(chatId);
    const usersInRoom = [];
    if (room) {
      for (const socketId of room) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && socket.userId) {
          usersInRoom.push(socket.userId);
        }
      }
    }

    // Tandai pesan sebagai dibaca untuk pengguna yang tergabung dalam room
    const readByUsers = [userId];
    for (const member of chatMembers) {
      if (usersInRoom.includes(member.userId) && member.userId !== userId) {
        await prisma.messageRead.create({
          data: {
            messageId: message.id,
            userId: member.userId,
            readAt: new Date(),
          },
        });
        readByUsers.push(member.userId);
        // Set unreadCount ke 0 untuk users yang tergabung dalam room
        await redisClient.set(`unread:${member.userId}:${chatId}`, 0, {
          EX: 3600,
        });
      }
    }

    // Update formattedMessage dengan reads terbaru
    formattedMessage.message.reads = await prisma.messageRead.findMany({
      where: { messageId: message.id },
      select: { userId: true, readAt: true },
    });

    // Hitung unreadCount untuk setiap anggota dan simpan ke Redis
    const formattedLastMessages = {};
    for (const member of chatMembers) {
      const messageWhereClause = {
        chatId,
        NOT: {
          reads: {
            some: { userId: member.userId },
          },
        },
      };

      // Tambahkan filter deletedAt jika ada
      if (member.deletedAt) {
        messageWhereClause.createdAt = {
          gte: member.deletedAt,
        };
      }

      let unreadCount = await redisClient.get(
        `unread:${member.userId}:${chatId}`
      );
      if (unreadCount === null) {
        unreadCount = await prisma.message.count({
          where: messageWhereClause,
        });
        await redisClient.set(
          `unread:${member.userId}:${chatId}`,
          unreadCount,
          { EX: 3600 }
        );
      } else {
        unreadCount = parseInt(unreadCount);
        // Tambahkan 1 hanya untuk anggota yang tidak bergabung di room
        if (!readByUsers.includes(member.userId)) {
          unreadCount += 1;
          await redisClient.set(
            `unread:${member.userId}:${chatId}`,
            unreadCount,
            { EX: 3600 }
          );
        }
      }

      const isOnline =
        (await redisClient.get(`online:${member.userId}`)) === "true";

      // Ambil informasi pengguna lain untuk perspektif member
      const otherMember = chat.members.find((m) => m.userId !== member.userId);
      const name =
        chat.type === "private" ? otherMember.user.username : chat.name;
      const image =
        chat.type === "private" ? otherMember.user.image : chat.icon;

      // Buat formattedLastMessage untuk anggota ini
      formattedLastMessages[member.userId] = {
        chatId,
        type: chat.type,
        name,
        image,
        lastMessage: {
          content: message.content,
          sender: message.sender.username,
          time: dayjs(message.createdAt).tz(timezone).format("HH:mm"),
        },
        unreadCount,
        isOnline,
      };
    }

    // Kirim newLastMessage ke semua anggota, termasuk pengirim
    for (const member of chatMembers) {
      const socketId = await redisClient.get(`user:${member.userId}`);
      if (socketId) {
        io.to(socketId).emit(
          "newLastMessage",
          formattedLastMessages[member.userId]
        );
      }
    }

    // Kirim newMessage dan unreadUpdate ke semua anggota
    io.to(chatId).emit("newMessage", formattedMessage);
    io.to(chatId).emit("unreadCountUpdate", { chatId, userId });

    // Kirim notifikasi ke anggota selain pengirim
    for (const member of chatMembers) {
      if (member.userId !== userId) {
        await sendNotification(
          member.userId,
          `Pesan baru dari ${username}`,
          content,
          chatId
        );
      }
    }
  } catch (error) {
    console.error("Error sending message:", error);
  }
};

export {
  getAllChatFriends,
  getAllChatGroups,
  getArchivedChats,
  createGroupChat,
  getListGroupChat,
  addGroupMembers,
  getChatMessages,
  toggleArchiveChat,
  clearMyChatHistory,
  startPrivateChat,
  joinChat,
  leaveChat,
  sendMessage,
};
