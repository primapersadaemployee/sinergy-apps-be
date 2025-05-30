import { prisma } from "../lib/prisma.js";
import { getIO } from "../socket.js";

// Get all chats friends for the current user
const getAllChatFriends = async (req, res) => {
  const userId = req.user;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        type: 'private',
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
            createdAt: 'desc',
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
        updatedAt: 'desc',
      },
    });

    const formattedChats = chats.map(chat => {
      const otherMembers = chat.members.filter(member => member.userId !== userId);
      const lastMessage = chat.messages[0];

      return {
        id: chat.id,
        type: chat.type,
        name: chat.type === 'private' 
          ? otherMembers[0]?.user.username 
          : chat.name,
        image: chat.type === 'private'
          ? otherMembers[0]?.user.image
          : chat.icon,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          sender: lastMessage.sender.username,
          createdAt: lastMessage.createdAt,
        } : null,
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

  try {
    const chats = await prisma.chat.findMany({
      where: {
        type: 'group',
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
            createdAt: 'desc',
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
        updatedAt: 'desc',
      },
    });

    const formattedChats = chats.map(chat => {
      const otherMembers = chat.members.filter(member => member.userId !== userId);
      const lastMessage = chat.messages[0];

      return {
        id: chat.id,
        type: chat.type,
        groupName: chat.name,
        name: otherMembers[0]?.user.username,
        image: chat.icon,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          sender: lastMessage.sender.username,
          createdAt: lastMessage.createdAt,
        } : null,
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
            createdAt: 'desc',
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
        updatedAt: 'desc',
      },
    });

    const formattedChats = archivedChats.map(chat => ({
      id: chat.id,
      type: chat.type,
      name: chat.type === 'private'
        ? chat.members.find(member => member.userId !== userId)?.user.username
        : chat.name,
      image: chat.type === 'private'
        ? chat.members.find(member => member.userId !== userId)?.user.image
        : chat.icon,
      lastMessage: chat.messages[0] ? {
        content: chat.messages[0].content,
        sender: chat.messages[0].sender.username,
        createdAt: chat.messages[0].createdAt,
      } : null,
    }));

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
        type: 'private',
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
        type: 'private',
        members: {
          create: [
            {
              userId: userId,
              role: 'member',
            },
            {
              userId: friendId,
              role: 'member',
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
        type: 'group',
        name,
        description,
        members: {
          create: uniqueMemberIds.map(memberId => ({
            userId: memberId,
            role: memberId === userId ? 'admin' : 'member',
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

    // Notify all members about the new group
    const io = getIO();
    uniqueMemberIds.forEach(memberId => {
      if (memberId !== userId) {
        io.to(`user_${memberId}`).emit('new_group_chat', {
          chatId: newGroupChat.id,
          name: newGroupChat.name,
          creator: userId,
        });
      }
    });

    return res.status(201).json({
      success: true,
      message: "Group chat created successfully",
      data: {
        id: newGroupChat.id,
        name: newGroupChat.name,
        description: newGroupChat.description,
        members: newGroupChat.members.map(member => ({
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
                members: {
                    some: {
                        userId: userId,
                        isArchived: false,
                    }
                }
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                image: true,
                            }
                        }
                    }
                }
            }
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
            members: groupChat.members.map(member => ({
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

}

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
        role: 'admin',
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
      data: memberIds.map(memberId => ({
        chatId,
        userId: memberId,
        role: 'member',
      })),
    });

    // Notify new members
    const io = getIO();
    memberIds.forEach(memberId => {
      io.to(`user_${memberId}`).emit('added_to_group', {
        chatId,
      });
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
  const { page = 1, limit = 50 } = req.query;

  try {
    // Check if user is a member of the chat
    const isMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId,
      },
    });

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this chat",
      });
    }

    // Get messages with pagination
    const messages = await prisma.message.findMany({
      where: {
        chatId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            image: true,
          },
        },
        reads: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Update last read timestamp
    await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Successfully retrieved chat messages",
      data: messages.map(message => ({
        id: message.id,
        content: message.content,
        messageType: message.messageType,
        fileUrl: message.fileUrl,
        fileName: message.fileName,
        fileSize: message.fileSize,
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          image: message.sender.image,
        },
        reads: message.reads,
        createdAt: message.createdAt,
      })),
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
  const { chatId } = req.params;
  const { content, messageType = 'text' } = req.body;

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

    // Notify other members
    const io = getIO();
    chatMembers.forEach(member => {
      io.to(`user_${member.userId}`).emit('new_message', {
        chatId,
        message: {
          id: message.id,
          content: message.content,
          messageType: message.messageType,
          sender: {
            id: message.sender.id,
            username: message.sender.username,
            image: message.sender.image,
          },
          createdAt: message.createdAt,
        },
      });
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
        createdAt: message.createdAt,
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
      message: archive ? "Chat archived successfully" : "Chat unarchived successfully",
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