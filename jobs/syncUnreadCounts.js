import { prisma } from "../lib/prisma.js";
import redisClient from "../lib/redis.js";

// Fungsi untuk menyinkronkan unreadCount
const syncUnreadCounts = async () => {
  try {
    console.log("Starting OPTIMIZED unreadCount sync job...");

    // Tentukan rentang waktu. Karena job berjalan setiap 15 menit,
    // mengambil chat yang aktif dalam 1 jam terakhir sudah lebih dari cukup.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // 1. Ambil semua chat yang baru saja diupdate, dan langsung sertakan membernya.
    // Ini adalah satu-satunya panggilan utama ke database.
    const recentActiveChats = await prisma.chat.findMany({
      where: {
        updatedAt: { gte: oneHourAgo }, // Hanya chat yang aktif dalam 1 jam terakhir
      },
      include: {
        // Ambil semua member dari chat-chat ini
        members: {
          where: { isArchived: false }, // Kita tidak perlu sinkronisasi untuk chat yang diarsip
          select: {
            userId: true,
            deletedAt: true, // Diperlukan untuk filter pesan yang sudah dihapus
          },
        },
      },
    });

    if (recentActiveChats.length === 0) {
      console.log("No recent active chats to sync. Job finished early.");
      return;
    }

    let syncCount = 0;

    // 2. Loop melalui chat yang relevan dan membernya
    for (const chat of recentActiveChats) {
      for (const member of chat.members) {
        const { userId, deletedAt } = member;
        const chatId = chat.id;

        // Siapkan klausa 'where' untuk menghitung pesan yang belum dibaca
        const messageWhereClause = {
          chatId: chatId,
          NOT: {
            reads: {
              some: { userId: userId },
            },
          },
        };

        // Jika user pernah membersihkan riwayat chat, hanya hitung pesan setelahnya
        if (deletedAt) {
          messageWhereClause.createdAt = { gte: deletedAt };
        }

        const unreadCount = await prisma.message.count({
          where: messageWhereClause,
        });

        // Simpan hasilnya ke Redis
        await redisClient.set(`unread:${userId}:${chatId}`, unreadCount, {
          EX: 3600, // Expire dalam 1 jam
        });

        syncCount++;
      }
    }

    console.log(
      `Synced ${syncCount} user/chat pairs. UnreadCount sync job completed.`
    );
  } catch (error) {
    console.error("Error in OPTIMIZED syncUnreadCounts:", error);
  }
};

export { syncUnreadCounts };
