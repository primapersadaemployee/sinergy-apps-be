import express from "express";
import cors from "cors";
import "dotenv/config";
import userRouter from "./routes/userRoute.js";
import chatRouter from "./routes/chatRoute.js";
import setupSwagger from "./swagger.js";
import { initSocket } from "./socket.js";

// Initialize Express
const app = express();
const port = process.env.PORT;

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
setupSwagger(app);

app.get("/", (req, res) => {
  res.send("API Working!");
});

// Start the server
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port : ${port}`);
});

// Initialize Socket.IO
const io = initSocket(server);

export { io };
