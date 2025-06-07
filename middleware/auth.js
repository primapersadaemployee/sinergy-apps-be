import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Authorization header is missing" });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ message: "Invalid token format" });
    }

    const token = parts[1];

    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({ message: "Token is missing or invalid" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = user.id;
    next();
  } catch (error) {
    console.log("Authentication error :", error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Token invalid" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default authMiddleware;
