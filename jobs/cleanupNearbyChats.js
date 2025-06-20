import { prisma } from "../lib/prisma.js";

const cleanupNearbyChats = async () => {
  try {
    const expiredChats = await prisma.chat.findMany({
      where: {
        type: "nearby",
        expiresAt: { lte: new Date() },
      },
      select: {
        id: true,
      },
    });

    for (const chat of expiredChats) {
      await prisma.chat.delete({
        where: {
          id: chat.id,
        },
      });
    }

    console.log(`${expiredChats.length} Expired nearby chats cleaned up.`);
  } catch (error) {
    console.error("Error in cleanupNearbyChats:", error);
  }
};

export { cleanupNearbyChats };
