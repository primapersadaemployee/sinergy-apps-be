import { prisma } from "../lib/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import validator from "validator";

// Buat Token
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET);
};

// Register User
const registerUser = async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    // Validasi input
    if (!username || !email || !password || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required!" });
    }

    // Cek apakah username sudah ada
    const checkUsername = await prisma.user.findUnique({
      where: {
        username: username,
      },
    });

    if (checkUsername) {
      return res
        .status(400)
        .json({ success: false, message: "Username already exists!" });
    }

    // Validasi email
    if (!validator.isEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email!" });
    }

    // Validasi password
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters!",
      });
    }

    // Cek apakah email sudah ada
    const checkEmail = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });

    if (checkEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists!" });
    }

    // Cek apakah phone sudah ada
    const checkPhone = await prisma.user.findFirst({
      where: {
        phone: phone,
      },
    });

    if (checkPhone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number already exists!" });
    }

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Register user
    await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        phone,
        bio: "Hi there I am using Sinergy App",
        fcmTokens: [],
        locations: null,
      },
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully!",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Login User
const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: {
        email: email,
      },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid password" });
    }

    const token = createToken(user.id);

    // Ambil FCM token dari header atau body (misal dikirim dari Flutter)
    const fcmToken = req.body.fcmToken;
    if (fcmToken) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          fcmTokens: {
            set: [...new Set([...(user.fcmTokens || []), fcmToken])], // Hindari duplikat
          },
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login success",
      token,
      userId: user.id,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

const logoutUser = async (req, res) => {
  const userId = req.user;
  const { fcmToken } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Filter array untuk hapus fcmToken yang sesuai
    const updatedTokens = user.fcmTokens.filter((t) => t !== fcmToken);
    await prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: updatedTokens },
    });

    return res
      .status(200)
      .json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export { registerUser, loginUser, logoutUser };
