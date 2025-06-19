import express from "express";
import cors from "cors";
import "dotenv/config";
import userRouter from "./routes/userRoute.js";
import chatRouter from "./routes/chatRoute.js";
import { initSocket } from "./socket.js";
import admin from "./lib/firebase.js";
import rateLimit from "express-rate-limit";
// import { syncUnreadCounts } from "./jobs/syncUnreadCounts.js";
// import cron from "node-cron";

// Initialize Express
const app = express();
const port = process.env.PORT;

// Middleware
app.use(express.json());
app.use(cors());

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // Batasi setiap IP hingga 100 request per 'windowMs'
  standardHeaders: true, // Kirim header 'RateLimit-*'
  legacyHeaders: false, // Nonaktifkan header 'X-RateLimit-*'
  message: {
    success: false,
    message:
      "Terlalu banyak request dari IP ini, silakan coba lagi setelah 15 menit.",
  },
});
app.use("/api/", apiLimiter);

// Cron Job Every 15 minutes
// cron.schedule("*/15 * * * *", () => {
//   console.log("Running syncUnreadCounts job....");
//   syncUnreadCounts();
// });

// Routes
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);

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
