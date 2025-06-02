import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "./lib/prisma.js";

let io;
const userSocketMap = new Map();
console.log(userSocketMap);

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

  io.on("connection", (socket) => {
    console.log(
      `User connected with ID: ${socket.userId}, Username: ${socket.username}`
    );
    userSocketMap.set(socket.userId, socket.id);

    socket.on("disconnect", () => {
      console.log(
        `User disconnected with ID: ${socket.userId}, Username: ${socket.username}`
      );
      userSocketMap.delete(socket.userId);
    });
  });

  return io;
};

export { initSocket, userSocketMap };
