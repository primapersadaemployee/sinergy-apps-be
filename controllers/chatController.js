import { prisma } from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import isToday from "dayjs/plugin/isToday.js";
import isYesterday from "dayjs/plugin/isYesterday.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

// Get all chats friends for the current user
const getAllChatFriends = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        type: "private",
        members: {
          some: {
            userId: userId,
            isArchived: false,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const formattedChats = chats.map((chat) => {
      const otherMembers = chat.members.filter(
        (member) => member.userId !== userId
      );
      const lastMessage = chat.messages[0];
      const created = dayjs(lastMessage.createdAt).tz(timezone);
      let time = "";
      if (created.isToday()) {
        time = created.format("HH:mm");
      } else if (created.isYesterday()) {
        time = "Kemarin";
      } else {
        time = created.format("DD-MM-YYYY");
      }

      return {
        id: chat.id,
        type: chat.type,
        name: otherMembers[0]?.user.username,
        image: otherMembers[0]?.user.image,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              sender: lastMessage.sender.username,
              time: time,
              createdAt: lastMessage.createdAt,
            }
          : null,
        // members: chat.members.map(member => ({
        //   userId: member.user.id,
        //   username: member.user.username,
        //   image: member.user.image,
        //   role: member.role,
        // })),
      };
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved all chats",
      data: formattedChats,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving chats",
      error: error.message,
    });
  }
};

// Get all chats group
const getAllChatGroups = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        type: "group",
        members: {
          some: {
            userId: userId,
            isArchived: false,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const formattedChats = chats.map((chat) => {
      const lastMessage = chat.messages[0];
      const created = dayjs(lastMessage.createdAt).tz(timezone);
      let time = "";
      if (created.isToday()) {
        time = created.format("HH:mm");
      } else if (created.isYesterday()) {
        time = "Kemarin";
      } else {
        time = created.format("DD-MM-YYYY");
      }

      return {
        id: chat.id,
        type: chat.type,
        groupName: chat.name,
        image: chat.icon,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              sender: lastMessage.sender.username,
              time: time,
              createdAt: lastMessage.createdAt,
            }
          : null,
        // members: chat.members.map(member => ({
        //   userId: member.user.id,
        //   username: member.user.username,
        //   image: member.user.image,
        //   role: member.role,
        // })),
      };
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved all chats",
      data: formattedChats,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving chats",
      error: error.message,
    });
  }
};

// Get archived chats
const getArchivedChats = async (req, res) => {
  const userId = req.user;
  const { timezone = "Asia/Jakarta" } = req.query;

  try {
    const archivedChats = await prisma.chat.findMany({
      where: {
        members: {
          some: {
            userId: userId,
            isArchived: true,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const formattedChats = archivedChats.map((chat) => {
      const created = dayjs(chat.messages[0].createdAt).tz(timezone);
      let time = "";
      if (created.isToday()) {
        time = created.format("HH:mm");
      } else if (created.isYesterday()) {
        time = "Kemarin";
      } else {
        time = created.format("DD-MM-YYYY");
      }

      return {
        id: chat.id,
        type: chat.type,
        name:
          chat.type === "private"
            ? chat.members.find((member) => member.userId !== userId)?.user
                .username
            : chat.name,
        image:
          chat.type === "private"
            ? chat.members.find((member) => member.userId !== userId)?.user
                .image
            : chat.icon,
        lastMessage: chat.messages[0]
          ? {
              content: chat.messages[0].content,
              sender: chat.messages[0].sender.username,
              time: time,
              createdAt: chat.messages[0].createdAt,
            }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved archived chats",
      data: formattedChats,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving archived chats",
      error: error.message,
    });
  }
};

// Start a private chat with a friend
const startPrivateChat = async (req, res) => {
  const userId = req.user;
  const { friendId } = req.body;

  try {
    // Check if users are friends
    const areFriends = await prisma.friendship.findFirst({
      where: {
        OR: [
          { AND: [{ user1Id: userId }, { user2Id: friendId }] },
          { AND: [{ user1Id: friendId }, { user2Id: userId }] },
        ],
      },
    });

    if (!areFriends) {
      return res.status(400).json({
        success: false,
        message: "You can only start a chat with your friends",
      });
    }

    // Check if a private chat already exists
    const existingChat = await prisma.chat.findFirst({
      where: {
        type: "private",
        AND: [
          {
            members: {
              some: {
                userId: userId,
              },
            },
          },
          {
            members: {
              some: {
                userId: friendId,
              },
            },
          },
        ],
      },
    });

    if (existingChat) {
      return res.status(200).json({
        success: true,
        message: "Chat already exists",
        data: { chatId: existingChat.id },
      });
    }

    // Create new private chat
    const newChat = await prisma.chat.create({
      data: {
        type: "private",
        members: {
          create: [
            {
              userId: userId,
              role: "member",
            },
            {
              userId: friendId,
              role: "member",
            },
          ],
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Private chat created successfully",
      data: { chatId: newChat.id },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error creating private chat",
      error: error.message,
    });
  }
};

// Create a group chat
const createGroupChat = async (req, res) => {
  const userId = req.user;
  const { name, description, memberIds } = req.body;

  try {
    // Include the creator in the member list
    const uniqueMemberIds = [...new Set([userId, ...memberIds])];

    // Create group chat
    const newGroupChat = await prisma.chat.create({
      data: {
        type: "group",
        name,
        description,
        members: {
          create: uniqueMemberIds.map((memberId) => ({
            userId: memberId,
            role: memberId === userId ? "admin" : "member",
          })),
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Group chat created successfully",
      data: {
        id: newGroupChat.id,
        name: newGroupChat.name,
        description: newGroupChat.description,
        members: newGroupChat.members.map((member) => ({
          userId: member.user.id,
          username: member.user.username,
          image: member.user.image,
          role: member.role,
        })),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error creating group chat",
      error: error.message,
    });
  }
};

// Get list group chat
const getListGroupChat = async (req, res) => {
  const userId = req.user;
  const { groupId } = req.params;

  try {
    const groupChat = await prisma.chat.findUnique({
      where: {
        id: groupId,
        type: "group",
        members: {
          some: {
            userId: userId,
            isArchived: false,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: "Group chat not found",
      });
    }

    const formattedGroupChat = {
      id: groupChat.id,
      name: groupChat.name,
      icon: groupChat.icon,
      description: groupChat.description,
      members: groupChat.members.map((member) => ({
        userId: member.user.id,
        username: member.user.username,
        image: member.user.image,
        role: member.role,
      })),
    };

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved list group chat",
      data: formattedGroupChat,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error getting list group chat",
      error: error.message,
    });
  }
};

// Add members to group chat
const addGroupMembers = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;
  const { memberIds } = req.body;

  try {
    // Check if user is admin of the group
    const userMembership = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
        role: "admin",
      },
    });

    if (!userMembership) {
      return res.status(403).json({
        success: false,
        message: "Only admin can add members to the group",
      });
    }

    // Add new members
    const newMembers = await prisma.chatMember.createMany({
      data: memberIds.map((memberId) => ({
        chatId,
        userId: memberId,
        role: "member",
      })),
    });

    return res.status(200).json({
      success: true,
      message: "Members added successfully",
      data: {
        addedCount: newMembers.count,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error adding members to group",
      error: error.message,
    });
  }
};

// Get chat messages
const getChatMessages = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;
  const { page = 1, limit = 50, timezone = "Asia/Jakarta" } = req.query;

  try {
    // Cek keanggotaan
    const isMember = await prisma.chatMember.findFirst({
      where: { chatId, userId },
    });

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this chat",
      });
    }

    // Ambil pesan
    const messages = await prisma.message.findMany({
      where: { chatId },
      include: {
        sender: { select: { id: true, username: true, image: true } },
        reads: { select: { userId: true, readAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Format pesan
    const formattedMessages = messages.map((msg) => {
      const created = dayjs(msg.createdAt).tz(timezone);
      return {
        id: msg.id,
        content: msg.content,
        messageType: msg.messageType,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        sender: {
          id: msg.sender.id,
          username: msg.sender.username,
          image: msg.sender.image,
        },
        reads: msg.reads,
        date: created.format("DD-MM-YYYY"),
        time: created.format("HH:mm"),
        createdAt: msg.createdAt,
      };
    });

    // Grouping berdasarkan tanggal
    const grouped = {};
    formattedMessages.forEach((msg) => {
      const created = dayjs(msg.createdAt).tz(timezone);
      let label = created.format("DD-MM-YYYY");

      if (created.isToday()) label = "Hari Ini";
      else if (created.isYesterday()) label = "Kemarin";

      if (!grouped[label]) {
        grouped[label] = {
          label,
          date: created.format("YYYY-MM-DD"),
          messages: [],
        };
      }

      grouped[label].messages.push(msg);
    });

    const groupedArray = Object.values(grouped).sort((a, b) => {
      return dayjs(b.date).valueOf() - dayjs(a.date).valueOf();
    });

    // Update last read
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved chat messages",
      data: groupedArray,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving chat messages",
      error: error.message,
    });
  }
};

// Send message
const sendMessage = async (req, res) => {
  const userId = req.user;
  const { chatId, timezone = "Asia/Jakarta" } = req.params;
  const { content, messageType = "text" } = req.body;

  try {
    // Check if user is a member of the chat
    const chatMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
      },
    });

    if (!chatMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this chat",
      });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        content,
        messageType,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
      },
    });

    // Update chat's updatedAt
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    // Get all chat members except sender
    const chatMembers = await prisma.chatMember.findMany({
      where: {
        chatId,
        userId: {
          not: userId,
        },
      },
      select: {
        userId: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: {
        id: message.id,
        content: message.content,
        messageType: message.messageType,
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          image: message.sender.image,
        },
        time: dayjs(message.createdAt).tz(timezone).format("HH:mm"),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error sending message",
      error: error.message,
    });
  }
};

// Archive/Unarchive chat
const toggleArchiveChat = async (req, res) => {
  const userId = req.user;
  const { chatId } = req.params;

  try {
    const chatMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
      },
    });

    const archive = chatMember.isArchived ? false : true;

    if (!chatMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this chat",
      });
    }

    await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      data: {
        isArchived: archive,
        archivedAt: archive ? new Date() : null,
      },
    });

    return res.status(200).json({
      success: true,
      message: archive
        ? "Chat archived successfully"
        : "Chat unarchived successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error toggling chat archive status",
      error: error.message,
    });
  }
};

export {
  getAllChatFriends,
  getAllChatGroups,
  getArchivedChats,
  startPrivateChat,
  createGroupChat,
  getListGroupChat,
  addGroupMembers,
  getChatMessages,
  sendMessage,
  toggleArchiveChat,
};
