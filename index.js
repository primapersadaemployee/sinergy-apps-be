import express from "express";
import cors from "cors";
import "dotenv/config";
import { createServer } from "http";
import userRouter from "./routes/userRoute.js";
import chatRouter from "./routes/chatRoute.js";
import { initSocket } from "./socket.js";
import setupSwagger from "./swagger.js";

// App Config
const app = express();
const port = process.env.PORT;

// Create HTTP server
const server = createServer(app);

// Initialize Socket.IO
initSocket(server);

// Middlewares
app.use(express.json());
app.use(cors());

// API Endpoints
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
setupSwagger(app);

app.get("/", (req, res) => {
  res.send("API Working!");
});

server.listen(port, "0.0.0.0", () => {
  console.log("Server running on port :", port);
});
