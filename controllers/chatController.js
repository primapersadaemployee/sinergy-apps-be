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
import fs from "fs";

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

    // Ambil otherMemberIds dan cek kalau ada
    const otherMemberIds = chats
      .map((chat) => chat.members.find((m) => m.userId !== userId)?.user.id)
      .filter(Boolean);
    let onlineStatuses, unreadCounts;

    if (otherMemberIds.length === 0) {
      // Kalau gak ada member lain, set status online manual dan ambil unreadCount
      onlineStatuses = chats.map(() => false);
      unreadCounts = await Promise.all(
        chats.map((chat) =>
          redisClient
            .get(`unread:${userId}:${chat.id}`)
            .then((count) => (count !== null ? parseInt(count) : 0))
        )
      );
    } else {
      // Pake mget kalau ada member lain
      onlineStatuses = await redisClient.mget(
        otherMemberIds.map((id) => `online:${id}`)
      );
      const unreadCountKeys = chats.map(
        (chat) => `unread:${userId}:${chat.id}`
      );
      unreadCounts = await redisClient.mget(unreadCountKeys);
    }

    // Format data
    const formattedChats = chats.map((chat, index) => {
      const otherMembers = chat.members.filter((m) => m.userId !== userId);
      const lastMessage = chat.messages[0];
      let content = lastMessage?.content;
      const messageType = lastMessage?.messageType;

      if (messageType === "image") content = "📷 Foto";

      const created = lastMessage
        ? dayjs(lastMessage.createdAt).tz(timezone)
        : null;
      let time = "";
      if (created) {
        if (created.isToday()) time = created.format("HH:mm");
        else if (created.isYesterday()) time = "Kemarin";
        else time = created.format("DD-MM-YYYY");
      }

      const isOnline =
        otherMemberIds.length > 0 ? onlineStatuses[index] === "true" : false;
      let unreadCount =
        otherMemberIds.length > 0
          ? parseInt(unreadCounts[index] || "0")
          : unreadCounts[index] !== null
          ? unreadCounts[index]
          : 0;
      if (unreadCount === 0 && lastMessage?.senderId === userId) {
        unreadCount = 0;
      }

      return {
        id: chat.id,
        userId: otherMembers[0]?.user.id,
        type: chat.type,
        name: otherMembers[0]?.user.username || "Unknown User",
        image: otherMembers[0]?.user.image || null,
        lastMessage: lastMessage
          ? { content, sender: lastMessage.sender.username, time }
          : null,
        unreadCount: unreadCount || 0,
        isOnline,
      };
    });

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

    // Ambil otherMemberIds dan cek kalau ada
    const otherMemberIds = chats
      .map((chat) => chat.members.find((m) => m.userId !== userId)?.user.id)
      .filter(Boolean);
    let unreadCounts;

    if (otherMemberIds.length === 0) {
      unreadCounts = await Promise.all(
        chats.map((chat) =>
          redisClient
            .get(`unread:${userId}:${chat.id}`)
            .then((count) => (count !== null ? parseInt(count) : 0))
        )
      );
    } else {
      const unreadCountKeys = chats.map(
        (chat) => `unread:${userId}:${chat.id}`
      );
      unreadCounts = await redisClient.mget(unreadCountKeys);
    }

    // Format data
    const formattedChats = chats.map((chat, index) => {
      const otherMembers = chat.members.filter((m) => m.userId !== userId);
      const lastMessage = chat.messages[0];
      let content = lastMessage?.content;
      const messageType = lastMessage?.messageType;

      if (messageType === "image") content = "📷 Foto";

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

      let unreadCount =
        otherMemberIds.length > 0
          ? parseInt(unreadCounts[index] || "0")
          : unreadCounts[index] !== null
          ? unreadCounts[index]
          : 0;
      if (unreadCount === 0 && lastMessage?.senderId === userId) {
        unreadCount = 0;
      }

      return {
        id: chat.id,
        type: chat.type,
        name: chat.name,
        image: chat.icon,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              sender: lastMessage.sender.username,
              time: time,
            }
          : null,
        unreadCount: unreadCount || 0,
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
  const { name, memberIds } = req.body;
  const image = req.file;

  // console.log(memberIds);

  // Parse memberIds dari string JSON ke array
  let parsedMemberIds = [];
  parsedMemberIds = JSON.parse(memberIds); // Ubah string "[...]" menjadi array
  if (!Array.isArray(parsedMemberIds)) {
    throw new Error("memberIds must be an array");
  }

  // console.log(parsedMemberIds);

  try {
    // Termasuk user sendiri
    const uniqueMemberIds = [...new Set([userId, ...parsedMemberIds])];
    // console.log(uniqueMemberIds);

    // Upload image ke cloudinary
    let icon = null;
    if (image) {
      const imageUrl = await uploadToCloudinary(image.path);
      icon = imageUrl;
      fs.unlinkSync(image.path);
    }

    // Buat grup chat
    const newGroupChat = await prisma.chat.create({
      data: {
        type: "group",
        name,
        icon,
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
          icon: newGroupChat.icon,
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
        icon: newGroupChat.icon,
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
  const { chatId } = req.params;

  try {
    const groupChat = await prisma.chat.findUnique({
      where: {
        id: chatId,
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

// Update Grup Chat
const updateGroupChat = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;
  const data = { ...req.body };
  const image = req.file;

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
        message: "Only admin can update group chat",
      });
    }

    // Cek icon grup
    const latestGroup = await prisma.chat.findUnique({
      where: {
        id: chatId,
      },
      select: {
        icon: true,
      },
    });

    // Upload image ke cloudinary
    if (image) {
      if (latestGroup.icon !== null) {
        const publicId = latestGroup.icon
          .split("/")
          .slice(-2)
          .join("/")
          .replace(/\.[^.]+$/, "");
        await cloudinary.uploader.destroy(publicId);
      }

      // Upload icon baru
      const imageUrl = await uploadToCloudinary(image.path);
      data.icon = imageUrl;
      fs.unlinkSync(image.path);
    }

    // Update grup chat
    const updatedGroupChat = await prisma.chat.update({
      where: {
        id: chatId,
      },
      data,
    });

    // Semua member masuk room
    const members = await prisma.chatMember.findMany({
      where: {
        chatId,
      },
      select: {
        userId: true,
      },
    });

    for (const member of members) {
      const socketId = await getSocketId(member.userId);
      if (socketId) {
        io.to(socketId).emit("updatedGroupChat", {
          id: updatedGroupChat.id,
          name: updatedGroupChat.name,
          icon: updatedGroupChat.icon,
          description: updatedGroupChat.description,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Group chat updated successfully",
      data: {
        id: updatedGroupChat.id,
        name: updatedGroupChat.name,
        icon: updatedGroupChat.icon,
        description: updatedGroupChat.description,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error updating group chat",
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

    if (membership.deletedAt) {
      messageWhereClause.createdAt = {
        gte: membership.deletedAt,
      };
    }

    // Ambil informasi chat
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

    // Ambil semua pesan
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
      await prisma.messageRead.createMany({
        data: unreadMessages.map((msg) => ({
          messageId: msg.id,
          userId: userId,
          readAt: new Date(),
        })),
      });

      // Set unreadCount ke 0 di database dan Redis
      await prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { unreadCount: 0 },
      });
      await redisClient.set(`unread:${userId}:${chatId}`, 0, "EX", 3600);

      // Emit event Socket.IO ke semua member chat
      io.to(chatId).emit("unreadCountUpdate", {
        chatId,
        userId,
      });
    }

    // Data Online Status
    let onlineStatus = {};
    if (chat.type === "private") {
      const otherMember = chat.members.find((m) => m.userId !== userId);
      onlineStatus = otherMember
        ? {
            type: "private",
            friend: {
              userId: otherMember.userId,
              username: otherMember.user.username,
              image: otherMember.user.image,
              isOnline:
                (await redisClient.get(`online:${otherMember.userId}`)) ===
                "true",
            },
          }
        : {};
    } else {
      const onlineMembers = await redisClient.mget(
        chat.members
          .filter((m) => m.userId !== userId)
          .map((m) => `online:${m.userId}`)
      );
      onlineStatus = {
        type: "group",
        // onlineCount: onlineMembers.filter(Boolean).length,
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

    if (chat.type === "nearby") {
      return res.status(200).json({
        success: true,
        message: "Successfully retrieved chat messages",
        data: {
          messages: groupedArray,
        },
      });
    }

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
// Membuat chat private dengan teman
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

    try {
      const socketId = await redisClient.get(`user:${userId}`);
      if (socketId) {
        io.to(socketId).emit("newPrivateChat", formattedNewPrivateChat);
      }
    } catch (error) {
      console.error("Error sending newPrivateChat event:", error);
    }
  } catch (error) {
    console.error("Error starting private chat:", error);

    callback({ success: false, message: "Error creating private chat" });
  }
};

// Bergabung room chat
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

// Keluar room chat
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
      transformation: [{ quality: 75 }, { fetch_format: "auto" }],
    });

    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw new Error("Image upload failed");
  }
};

// Upload foto dari room chat
const uploadChatImage = async (req, res) => {
  const userId = req.user;
  const image = req.file;
  try {
    if (!image) {
      return res
        .status(400)
        .json({ success: false, message: "No image found" });
    }

    const imageUrl = await uploadToCloudinary(image.path);
    fs.unlinkSync(image.path); // Hapus file lokal

    return res.status(200).json({
      success: true,
      imageUrl: imageUrl,
      message: "Image uploaded successfully",
    });
  } catch (error) {
    console.error("Error uploading chat image:", error);

    // Hapus file lokal jika ada error
    if (image && image.path && fs.existsSync(image.path)) {
      fs.unlinkSync(image.path);
    }
    return res
      .status(500)
      .json({ success: false, message: "Image upload failed" });
  }
};

// Helper function untuk mengirim notifikasi
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
      await admin.messaging().sendEachForMulticast(message);
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  }
};

// Helper function untuk mengirim pesan
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

    // Buat data message
    const messageData = {
      chatId,
      senderId: userId,
      content: content,
      messageType,
      reads: {
        create: [{ userId: userId, readAt: new Date() }],
      },
    };

    // Buat Pesan Baru
    const message = await prisma.message.create({
      data: messageData,
      include: {
        sender: { select: { id: true, username: true, image: true } },
        reads: true,
      },
    });

    // Set unreadCount pengirim ke 0 di database dan Redis
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { unreadCount: 0 },
    });
    await redisClient.set(`unread:${userId}:${chatId}`, 0, "EX", 3600);

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
        // Set unreadCount ke 0 di database dan Redis untuk user di room
        await prisma.chatMember.update({
          where: { chatId_userId: { chatId, userId: member.userId } },
          data: { unreadCount: 0 },
        });
        await redisClient.set(
          `unread:${member.userId}:${chatId}`,
          0,
          "EX",
          3600
        );
      } else if (member.userId !== userId) {
        // Tambah unreadCount di database untuk user yang tidak di room
        await prisma.chatMember.update({
          where: { chatId_userId: { chatId, userId: member.userId } },
          data: { unreadCount: { increment: 1 } },
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
      const unreadCount = (
        await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId, userId: member.userId } },
          select: { unreadCount: true },
        })
      ).unreadCount;

      await redisClient.set(
        `unread:${member.userId}:${chatId}`,
        unreadCount,
        "EX",
        3600
      );

      const isOnline =
        (await redisClient.get(`online:${member.userId}`)) === "true";

      const otherMember = chat.members.find((m) => m.userId !== member.userId);
      const name =
        chat.type === "private" ? otherMember.user.username : chat.name;
      const image =
        chat.type === "private" ? otherMember.user.image : chat.icon;

      let lastMessageContent = message.content;
      if (messageType === "image") {
        lastMessageContent = "📷 Foto";
      }

      formattedLastMessages[member.userId] = {
        chatId,
        type: chat.type,
        name,
        image,
        lastMessage: {
          content: lastMessageContent,
          sender: message.sender.username,
          time: dayjs(message.createdAt).tz(timezone).format("HH:mm"),
        },
        unreadCount,
        isOnline,
      };
    }

    // Kirim newLastMessage ke semua anggota
    for (const member of chatMembers) {
      const socketId = await redisClient.get(`user:${member.userId}`);
      if (socketId) {
        if (chat.type === "private") {
          io.to(socketId).emit(
            "newLastMessage",
            formattedLastMessages[member.userId]
          );
        } else {
          io.to(socketId).emit(
            "newGroupLastMessage",
            formattedLastMessages[member.userId]
          );
        }
      }
    }

    // Kirim newMessage dan unreadUpdate ke semua anggota
    if (chat.type === "private") {
      io.to(chatId).emit("newMessage", formattedMessage);
    } else {
      io.to(chatId).emit("newGroupMessage", formattedMessage);
    }
    io.to(chatId).emit("unreadCountUpdate", { chatId, userId });

    // Format notification content
    let notificationContent = content;
    if (messageType === "image") {
      notificationContent = "📷 Foto";
    }

    // Kirim notifikasi ke anggota selain pengirim
    for (const member of chatMembers) {
      if (member.userId !== userId) {
        if (chat.type === "private") {
          await sendNotification(
            member.userId,
            `Pesan baru dari ${username}`,
            notificationContent,
            chatId
          );
        } else {
          await sendNotification(
            member.userId,
            chat.name,
            message.sender.username + ": " + notificationContent,
            chatId
          );
        }
      }
    }
  } catch (error) {
    console.error("Error sending message:", error);
  }
};

// Membuat chat dengan orang sekitar
const startNearbyChat = async (socket, io, { userId, peopleId }, callback) => {
  try {
    // Validasi peopleId
    if (!peopleId || peopleId === userId) {
      callback({ success: false, message: "Invalid people ID" });
      return;
    }

    // Cek apakah chat sudah ada
    const existingChat = await prisma.chat.findFirst({
      where: {
        type: "nearby",
        AND: [
          { members: { some: { userId: userId, isArchived: false } } },
          { members: { some: { userId: peopleId, isArchived: false } } },
        ],
      },
      include: {
        members: true,
      },
    });

    if (existingChat) {
      callback({
        success: true,
        message: "Chat with people nearby already exists",
        chatId: existingChat.id,
      });
      return;
    }

    // Buat chat baru
    const newChat = await prisma.chat.create({
      data: {
        type: "nearby",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 Hari
        members: {
          create: [
            { userId: userId, role: "member", isArchived: false },
            { userId: peopleId, role: "member", isArchived: false },
          ],
        },
      },
      include: {
        members: true,
      },
    });

    // Balas ke pengirim
    callback({
      success: true,
      message: "Chat with people nearby started successfully",
      chatId: newChat.id,
    });

    const people = await prisma.user.findUnique({
      where: { id: peopleId },
      select: { username: true, image: true, isOnline: true },
    });

    // Kirim event ke socket
    const formattedNewNearbyChat = {
      id: newChat.id,
      type: newChat.type,
      name: people.username,
      image: people.image ?? null,
      lastMessage: null,
      unreadCount: 0,
      isOnline: people.isOnline ?? false,
    };

    const socketId = await redisClient.get(`user:${userId}`);
    if (socketId) {
      io.to(socketId).emit("newNearbyChat", formattedNewNearbyChat);
    }
  } catch (error) {
    console.error("Error starting nearby chat:", error);
    callback({ success: false, message: "Failed to start nearby chat" });
  }
};

// Helper function untuk mengirim pesan people nearby
const sendNearbyMessage = async (
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

    // Buat data pesan
    const messageData = {
      chatId,
      senderId: userId,
      content,
      messageType,
      reads: {
        create: [{ userId: userId, readAt: new Date() }],
      },
    };

    // Buat pesan baru
    const message = await prisma.message.create({
      data: messageData,
      include: {
        sender: {
          select: { id: true, username: true, image: true },
        },
        reads: true,
      },
    });

    // Set unreadCount pengirim ke 0 di database dan redis
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { unreadCount: 0 },
    });
    await redisClient.set(`unread:${userId}:${chatId}`, 0, "EX", 3600);

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

    // Format pesan untuk event newNearbyMessage
    const formattedMessage = {
      chatId,
      type: chat.type,
      name: message.sender.username,
      image: message.sender.image ?? null,
      message: {
        id: message.id,
        content: message.content,
        messageType: message.messageType,
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          image: message.sender.image ?? null,
        },
        reads: message.reads,
        date: dayjs(message.createdAt).tz(timezone).format("DD-MM-YYYY"),
        time: dayjs(message.createdAt).tz(timezone).format("HH:mm"),
        createdAt: message.createdAt.toISOString(),
      },
    };

    // Ambil semua member chat
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

    // Tandai pesan sebagai dibaca untuk pengguna yang tergabung dalam room chat
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
        // Set unreadCount ke 0 di database dan redis untuk user di room
        await prisma.chatMember.update({
          where: { chatId_userId: { chatId: chatId, userId: member.userId } },
          data: { unreadCount: 0 },
        });
        await redisClient.set(
          `unread:${member.userId}:${chatId}`,
          0,
          "EX",
          3600
        );
      } else if (member.userId !== userId) {
        // Tambah unreadCount di database dan redis untuk user yang tidak tergabung dalam room chat
        await prisma.chatMember.update({
          where: { chatId_userId: { chatId: chatId, userId: member.userId } },
          data: { unreadCount: { increment: 1 } },
        });
      }
    }

    // Update formattedMessage dengan reads terbaru
    formattedMessage.message.reads = await prisma.messageRead.findMany({
      where: { messageId: message.id },
      select: { userId: true, readAt: true },
    });

    // Hitung unreadCount untuk setiap anggota dan simpan ke redis
    const formattedLastMessages = {};
    for (const member of chat.members) {
      const unreadCount = (
        await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: chatId, userId: member.userId } },
          select: { unreadCount: true },
        })
      ).unreadCount;

      await redisClient.set(
        `unread:${member.userId}:${chatId}`,
        unreadCount,
        "EX",
        3600
      );

      const isOnline =
        (await redisClient.get(`online:${member.userId}`)) === "true";

      const otherMember = chat.members.find((m) => m.userId !== member.userId);
      const name = otherMember.user.username;
      const image = otherMember.user.image ?? null;

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

    // Kirim newNearbyLastMessage", ke semua anggota chat
    for (const member of chatMembers) {
      const socketId = await redisClient.get(`user:${member.userId}`);
      if (socketId) {
        io.to(socketId).emit(
          "newNearbyLastMessage",
          formattedLastMessages[member.userId]
        );
      }
    }

    // Kirim newNearbyMessage dan unreadUpdate ke semua anggota chat
    io.to(chatId).emit("newNearbyMessage", formattedMessage);
    io.to(chatId).emit("unreadCountUpdate", { chatId, userId });

    // Kirim notifikasi ke user selain pengirim
    for (const member of chatMembers) {
      if (member.userId !== userId) {
        await sendNotification(
          member.userId,
          `Pesan dari orang sekitar ${username}`,
          message.content,
          chatId
        );
      }
    }
  } catch (error) {
    console.error("Error sending message nearby:", error);
  }
};

// Semua Pesan Private
const getAllChatNearby = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        type: "nearby",
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

    // Ambil otherMemberIds dan cek kalau ada
    const otherMemberIds = chats
      .map((chat) => chat.members.find((m) => m.userId !== userId)?.user.id)
      .filter(Boolean);
    let unreadCounts;

    if (otherMemberIds.length === 0) {
      // Kalau gak ada member lain, set status online manual dan ambil unreadCount
      // onlineStatuses = chats.map(() => false);
      unreadCounts = await Promise.all(
        chats.map((chat) =>
          redisClient
            .get(`unread:${userId}:${chat.id}`)
            .then((count) => (count !== null ? parseInt(count) : 0))
        )
      );
    } else {
      // Pake mget kalau ada member lain
      // onlineStatuses = await redisClient.mget(
      //   otherMemberIds.map((id) => `online:${id}`)
      // );
      const unreadCountKeys = chats.map(
        (chat) => `unread:${userId}:${chat.id}`
      );
      unreadCounts = await redisClient.mget(unreadCountKeys);
    }

    // Format data
    const formattedChats = chats.map((chat, index) => {
      const otherMembers = chat.members.filter((m) => m.userId !== userId);
      const lastMessage = chat.messages[0];
      let content = lastMessage?.content;
      const messageType = lastMessage?.messageType;

      if (messageType === "image") content = "📷 Foto";

      const created = lastMessage
        ? dayjs(lastMessage.createdAt).tz(timezone)
        : null;
      let time = "";
      if (created) {
        if (created.isToday()) time = created.format("HH:mm");
        else if (created.isYesterday()) time = "Kemarin";
        else time = created.format("DD-MM-YYYY");
      }

      // const isOnline =
      //   otherMemberIds.length > 0 ? onlineStatuses[index] === "true" : false;
      let unreadCount =
        otherMemberIds.length > 0
          ? parseInt(unreadCounts[index] || "0")
          : unreadCounts[index] !== null
          ? unreadCounts[index]
          : 0;
      if (unreadCount === 0 && lastMessage?.senderId === userId) {
        unreadCount = 0;
      }

      const request = friendRequests.find(
        (r) =>
          (r.senderId === userId &&
            r.receiverId === otherMembers[0]?.user.id) ||
          (r.receiverId === userId && r.senderId === otherMembers[0]?.user.id)
      );

      const status = request?.status ?? "available";

      return {
        id: chat.id,
        userId: otherMembers[0]?.user.id,
        type: chat.type,
        name: otherMembers[0]?.user.username || "Unknown User",
        image: otherMembers[0]?.user.image || null,
        lastMessage: lastMessage
          ? { content, sender: lastMessage.sender.username, time }
          : null,
        unreadCount: unreadCount || 0,
        status,
        // isOnline,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved all chats from people nearby",
      data: formattedChats,
    });
  } catch (error) {
    console.error("Error in getAllChatNearby:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving chats",
      error: error.message,
    });
  }
};

export {
  getAllChatFriends,
  getAllChatGroups,
  getArchivedChats,
  createGroupChat,
  getListGroupChat,
  updateGroupChat,
  addGroupMembers,
  getChatMessages,
  toggleArchiveChat,
  clearMyChatHistory,
  startPrivateChat,
  joinChat,
  leaveChat,
  sendMessage,
  uploadChatImage,
  startNearbyChat,
  sendNearbyMessage,
  getAllChatNearby,
};
