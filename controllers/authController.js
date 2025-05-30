import { prisma } from "../lib/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import validator from "validator";

// Create Token (Done)
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET);
};

// Register User (Done)
const registerUser = async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    // Validasi input
    if (!username || !email || !password || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required!" });
    }

    // Validasi email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email!" });
    }

    // Validasi password
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters!",
      });
    }

    // Check if email already exists
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

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Register user and create profile
    await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        phone,
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

// Login User (Done)
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

    return res
      .status(200)
      .json({ success: true, message: "Login success", token });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Error" });
  }
};

export { registerUser, loginUser };
