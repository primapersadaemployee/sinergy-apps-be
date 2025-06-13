import { prisma } from "../lib/prisma.js";
import { redisClient } from "../socket.js";

// Fungsi untuk menyinkronkan unreadCount
const syncUnreadCounts = async () => {
  try {
    console.log("Starting unreadCount sync job...");
    const users = await prisma.user.findMany({ select: { id: true } });

    for (const user of users) {
      const chats = await prisma.chat.findMany({
        where: {
          members: { some: { userId: user.id, isArchived: false } },
        },
        select: { id: true },
      });

      for (const chat of chats) {
        const unreadCount = await prisma.message.count({
          where: {
            chatId: chat.id,
            NOT: {
              reads: {
                some: { userId: user.id },
              },
            },
          },
        });

        await redisClient.set(`unread:${user.id}:${chat.id}`, unreadCount, {
          EX: 600, // Expire dalam 10 menit
        });
        console.log(
          `Synced unreadCount for user ${user.id}, chat ${chat.id}: ${unreadCount}`
        );
      }
    }
    console.log("UnreadCount sync job completed.");
  } catch (error) {
    console.error("Error in syncUnreadCounts:", error);
  }
};

export { syncUnreadCounts };
