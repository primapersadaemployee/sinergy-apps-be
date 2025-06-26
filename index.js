import express from "express";
import cors from "cors";
import "dotenv/config";
import userRouter from "./routes/userRoute.js";
import chatRouter from "./routes/chatRoute.js";
import { initSocket } from "./socket.js";
import admin from "./lib/firebase.js";
import rateLimit from "express-rate-limit";
import inboxRouter from "./routes/inboxRoute.js";
import { cleanupNearbyChats } from "./jobs/cleanupNearbyChats.js";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import gameRouter from "./routes/gameRoute.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();
const port = process.env.PORT;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  max: 1000, // Batasi setiap IP hingga 1000 request per 'windowMs'
  standardHeaders: true, // Kirim header 'RateLimit-*'
  legacyHeaders: false, // Nonaktifkan header 'X-RateLimit-*'
  message: {
    success: false,
    message:
      "Terlalu banyak request dari IP ini, silakan coba lagi setelah 15 menit.",
  },
});
app.use("/api/", apiLimiter);

// Cron Job Every Days at 2 AM
cron.schedule("0 2 * * *", () => {
  console.log("Running cleanupNearbyChats job...");
  cleanupNearbyChats();
});

// Routes
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/inbox", inboxRouter);
app.use("/api/games", gameRouter);

// Handle Update APK
app.get("/updates", (req, res) => {
  const filePath = path.join(__dirname, "apk", "app-release.apk");

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: "File APK tidak ditemukan",
    });
  }

  res.download(filePath, "Sinergy-Apps.apk");
});

app.get("/", (req, res) => {
  res.send("Sinergy Apps BE");
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server is running on port : ${port}`);
});

// Initialize Socket.IO
const io = initSocket(server);

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  await redisClient.quit();
  server.close(() => {
    console.log("Server shut down gracefully");
    process.exit(0);
  });
});

export { io, admin };
