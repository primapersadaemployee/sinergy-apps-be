import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "./lib/prisma.js";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import redisClient from "./lib/redis.js";
import {
  startPrivateChat,
  joinChat,
  leaveChat,
  sendMessage,
} from "./controllers/chatController.js";

dayjs.extend(timezone);

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: Token not found"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { username: true },
      });
      socket.username = user.username;
      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(
      `User connected with ID: ${userId}, Username: ${socket.username}, Socket ID: ${socket.id}`
    );

    // Save mapping userId to socket.id in Redis
    await redisClient.set(`user:${userId}`, socket.id);

    // Save online status in Redis
    await redisClient.set(`online:${userId}`, "true", { EX: 600 });

    const onlineUsers = await redisClient.keys("online:*");
    console.log(`Online Users: ${onlineUsers.length}`);

    // Set status online user to true in socket
    io.to(socket.id).emit("userStatusUpdate", {
      userId: socket.userId,
      username: socket.username,
      isOnline: true,
    });

    // Handle startPrivateChat
    socket.on("startPrivateChat", (data, callback) => {
      startPrivateChat(socket, io, data, callback);
    });

    // Event untuk join chat room
    socket.on("joinChat", (data) => {
      joinChat(socket, io, data);
    });

    // Event untuk leave chat room
    socket.on("leaveChat", (data) => {
      leaveChat(socket, io, data);
    });

    // Handle sendMessage
    socket.on("sendMessage", (data) => {
      sendMessage(socket, io, data);
    });

    socket.on("disconnect", async () => {
      console.log(
        `User disconnected with ID: ${socket.userId}, Username: ${socket.username}, Socket ID: ${socket.id}`
      );

      // Cleanup existing listeners
      socket.removeAllListeners();

      // Hapus mapping userId dan status online di Redis
      await redisClient.del(`user:${socket.userId}`);
      await redisClient.del(`online:${socket.userId}`);

      // Kirim userStatusUpdate ke anggota chat yang relevan
      const chats = await prisma.chat.findMany({
        where: {
          members: {
            some: { userId: socket.userId, isArchived: false },
          },
        },
        select: {
          id: true,
          members: { select: { userId: true } },
        },
      });

      for (const chat of chats) {
        const otherMembers = chat.members.filter(
          (m) => m.userId !== socket.userId
        );
        for (const member of otherMembers) {
          const socketId = await redisClient.get(`user:${member.userId}`);
          if (socketId) {
            io.to(socketId).emit("userStatusUpdate", {
              userId: socket.userId,
              username: socket.username,
              isOnline: false,
              chatId: chat.id,
              chatType: chat.type,
            });
          }
        }
      }

      const onlineUsers = await redisClient.keys("online:*");
      console.log(`Online Users: ${onlineUsers.length}`);
    });
  });

  return io;
};

const getSocketId = async (userId) => {
  return await redisClient.get(`user:${userId}`);
};

const joinChatRoom = async (userId, chatId) => {
  const socketId = await getSocketId(userId);
  if (socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(chatId);
      console.log(`User ${userId} joined chat room: ${chatId}`);
    }
  }
};

const leaveChatRoom = async (userId, chatId) => {
  const socketId = await getSocketId(userId);
  if (socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(chatId);
      console.log(`User ${userId} left chat room: ${chatId}`);
    }
  }
};

export { initSocket, getSocketId, io, joinChatRoom, leaveChatRoom };
