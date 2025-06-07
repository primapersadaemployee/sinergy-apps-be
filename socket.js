import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "./lib/prisma.js";
import { createClient } from "redis";

// Initialize Redis
const redisClient = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err.message);
  console.error("Error details:", err);
});

redisClient.on("connect", () => {
  console.log("Berhasil terhubung ke Redis Cloud!");
});

// Connect to Redis Cloud
(async () => {
  await redisClient.connect();
})();

let io;
// const userSocketMap = new Map();

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
        where: {
          id: decoded.id,
        },
        select: {
          username: true,
        },
      });
      socket.username = user.username;
      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    console.log(
      `User connected with ID: ${socket.userId}, Username: ${socket.username}`
    );
    // userSocketMap.set(socket.userId, socket.id);

    // Save mapping userId to socket.id in Redis
    await redisClient.set(`user:${socket.userId}`, socket.id);

    // Save online status in Redis
    // await redisClient.set(`online:${socket.userId}`, "true");

    socket.on("disconnect", async () => {
      console.log(
        `User disconnected with ID: ${socket.userId}, Username: ${socket.username}`
      );
      // userSocketMap.delete(socket.userId);

      // Delete mapping userId to socket.id in Redis
      await redisClient.del(`user:${socket.userId}`);

      // Delete online status in Redis
      // await redisClient.del(`online:${socket.userId}`);
    });
  });

  return io;
};

// Get socket id by user id
const getSocketId = async (userId) => {
  return await redisClient.get(`user:${userId}`);
};

export { initSocket, getSocketId };
