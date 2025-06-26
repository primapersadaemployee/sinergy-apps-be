import { prisma } from "../lib/prisma.js";

const addGames = async (req, res) => {
  const { name, desc, image, url } = req.body;
  const { key } = req.query;
  try {
    if (key !== process.env.GAMES_KEY) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized access" });
    }

    const game = await prisma.games.create({
      data: {
        name,
        desc,
        image,
        url,
      },
    });
    return res
      .status(200)
      .json({ success: true, message: "Game added successfully", data: game });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to add game" });
  }
};

const getAllGames = async (req, res) => {
  try {
    const games = await prisma.games.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return res.status(200).json({
      success: true,
      message: "Games fetched successfully",
      data: games,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch games" });
  }
};

export { addGames, getAllGames };
