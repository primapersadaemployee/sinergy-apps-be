import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "./lib/prisma.js";

let io;
const onlineUsers = new Map(); // Store online users with their socket IDs

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      // origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true },
      });

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Authentication error"));
    }
  });

  // Handle socket connections
  io.on("connection", async (socket) => {
    console.log(`User connected: ${socket.user.username}`);

    // Store user's socket id
    socket.join(`user_${socket.userId}`);
    
    // Add user to online users
    onlineUsers.set(socket.userId, socket.id);
    
    // Broadcast to all users that this user is online
    io.emit("user_status_change", {
      userId: socket.userId,
      status: "online"
    });

    // Send list of online users to the newly connected user
    const onlineUserIds = Array.from(onlineUsers.keys());
    socket.emit("online_users", onlineUserIds);

    // Handle friend request events
    socket.on("send_friend_request", async (data) => {
      const { receiverId } = data;
      io.to(`user_${receiverId}`).emit("friend_request_received", {
        userId: socket.userId,
        username: socket.user.username,
      });
    });

    // Handle friend request response events
    socket.on("friend_request_response", async (data) => {
      const { senderId, status } = data;
      io.to(`user_${senderId}`).emit("friend_request_updated", {
        userId: socket.userId,
        username: socket.user.username,
        status,
      });
    });

    // Handle get online status of specific users
    socket.on("get_online_status", (userIds) => {
      const onlineStatus = userIds.map(userId => ({
        userId,
        isOnline: onlineUsers.has(userId)
      }));
      socket.emit("online_status_response", onlineStatus);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user.username}`);
      
      // Remove user from online users
      onlineUsers.delete(socket.userId);
      
      // Broadcast to all users that this user is offline
      io.emit("user_status_change", {
        userId: socket.userId,
        status: "offline"
      });
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

// Helper function to check if a user is online
export const isUserOnline = (userId) => {
  return onlineUsers.has(userId);
}; 