import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import Friendship from '../models/Friendship.js';
import GroupMember from '../models/GroupMember.js';
import { isBlockedEitherWay } from '../helpers/block.js';
import { createNotification } from '../services/notification.service.js';
import { getOnlineUsers } from '../socket/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

const populateChat = (query) =>
  query
    .populate('participants', 'name username profilePicture isOnline lastSeen statusMessage')
    .populate('group', 'name image description owner')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name username profilePicture' },
    });

export const getChats = asyncHandler(async (req, res) => {
  const archived = req.query.archived === 'true';
  const filter = {
    participants: req.user._id,
  };

  if (archived) {
    filter.archivedBy = req.user._id;
  } else {
    filter.archivedBy = { $ne: req.user._id };
  }

  const chats = await populateChat(
    Chat.find(filter).sort({ lastMessageAt: -1 })
  );

  const result = chats.map((chat) => {
    const obj = chat.toObject();
    obj.unreadCount = chat.unreadCounts?.get?.(String(req.user._id)) || 0;
    obj.isPinned = chat.pinnedBy?.some((id) => String(id) === String(req.user._id));
    if (chat.type === 'private') {
      obj.otherUser = chat.participants.find((p) => String(p._id) !== String(req.user._id));
    }
    return obj;
  });

  result.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

  res.json({ success: true, data: { chats: result } });
});

export const getOrCreatePrivateChat = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) throw new AppError('User ID is required', 400);

  const friendship = await Friendship.findOne({
    users: { $all: [req.user._id, userId] },
  });
  if (!friendship) throw new AppError('You can only chat with friends', 403);
  if (await isBlockedEitherWay(req.user._id, userId)) {
    throw new AppError('Unable to chat with this user', 403);
  }

  let chat = await Chat.findOne({
    type: 'private',
    participants: { $all: [req.user._id, userId], $size: 2 },
  });

  if (!chat) {
    chat = await Chat.create({
      type: 'private',
      participants: [req.user._id, userId],
      unreadCounts: {
        [String(req.user._id)]: 0,
        [String(userId)]: 0,
      },
    });
  }

  chat = await populateChat(Chat.findById(chat._id));
  const obj = chat.toObject();
  obj.otherUser = chat.participants.find((p) => String(p._id) !== String(req.user._id));
  obj.unreadCount = chat.unreadCounts?.get?.(String(req.user._id)) || 0;

  res.json({ success: true, data: { chat: obj } });
});

export const pinChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat || !chat.participants.some((p) => String(p) === String(req.user._id))) {
    throw new AppError('Chat not found', 404);
  }

  const pinned = chat.pinnedBy.some((id) => String(id) === String(req.user._id));
  if (pinned) {
    chat.pinnedBy = chat.pinnedBy.filter((id) => String(id) !== String(req.user._id));
  } else {
    chat.pinnedBy.push(req.user._id);
  }
  await chat.save();

  res.json({ success: true, message: pinned ? 'Chat unpinned' : 'Chat pinned', data: { isPinned: !pinned } });
});

export const archiveChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat || !chat.participants.some((p) => String(p) === String(req.user._id))) {
    throw new AppError('Chat not found', 404);
  }

  const archived = chat.archivedBy.some((id) => String(id) === String(req.user._id));
  if (archived) {
    chat.archivedBy = chat.archivedBy.filter((id) => String(id) !== String(req.user._id));
  } else {
    chat.archivedBy.push(req.user._id);
  }
  await chat.save();

  res.json({ success: true, message: archived ? 'Chat unarchived' : 'Chat archived', data: { isArchived: !archived } });
});

const assertChatAccess = async (chatId, userId) => {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.participants.some((p) => String(p) === String(userId))) {
    throw new AppError('Chat not found', 404);
  }
  return chat;
};

export const getMessages = asyncHandler(async (req, res) => {
  const chat = await assertChatAccess(req.params.chatId, req.user._id);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 30);
  const skip = (page - 1) * limit;

  const messages = await Message.find({
    chat: chat._id,
    deletedFor: { $ne: req.user._id },
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'name username profilePicture')
    .populate({
      path: 'replyTo',
      populate: { path: 'sender', select: 'name username' },
    })
    .populate('forwardedFrom', 'name username');

  res.json({
    success: true,
    data: {
      messages: messages.reverse(),
      page,
      hasMore: messages.length === limit,
    },
  });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const chat = await assertChatAccess(req.params.chatId, req.user._id);

  if (chat.type === 'private') {
    const other = chat.participants.find((p) => String(p) !== String(req.user._id));
    if (await isBlockedEitherWay(req.user._id, other)) {
      throw new AppError('Cannot send message', 403);
    }
  }

  let type = req.body.type || 'text';
  let fileUrl = '';
  let fileName = '';
  let fileSize = 0;
  let mimeType = '';

  if (req.file) {
    fileUrl = `/uploads/chat/${req.file.filename}`;
    fileName = req.file.originalname;
    fileSize = req.file.size;
    mimeType = (req.file.mimetype || '').split(';')[0].trim();
    if (mimeType.startsWith('image/')) type = 'image';
    else if (mimeType.startsWith('video/')) type = 'video';
    else if (mimeType.startsWith('audio/')) {
      type = req.body.isVoiceNote === 'true' || req.body.isVoiceNote === true ? 'voice' : 'audio';
    } else type = 'document';
  }

  if (!req.body.content && !req.file) {
    throw new AppError('Message content or file is required', 400);
  }

  const message = await Message.create({
    chat: chat._id,
    sender: req.user._id,
    type,
    content: req.body.content || (type === 'voice' ? 'Voice note' : ''),
    fileUrl,
    fileName,
    fileSize,
    mimeType,
    isVoiceNote: type === 'voice',
    replyTo: req.body.replyTo || null,
    forwardedFrom: req.body.forwardedFrom || null,
    status: 'sent',
    deliveredTo: [],
    seenBy: [req.user._id],
  });

  const onlineUsers = getOnlineUsers();
  for (const participantId of chat.participants) {
    const key = String(participantId);
    if (key !== String(req.user._id) && onlineUsers.has(key)) {
      message.deliveredTo.push(participantId);
    }
  }
  if (message.deliveredTo.length > 0) message.status = 'delivered';
  await message.save();

  chat.lastMessage = message._id;
  chat.lastMessageAt = new Date();

  for (const participantId of chat.participants) {
    const key = String(participantId);
    if (key !== String(req.user._id)) {
      const current = chat.unreadCounts.get(key) || 0;
      chat.unreadCounts.set(key, current + 1);
    }
  }
  await chat.save();

  const populated = await Message.findById(message._id)
    .populate('sender', 'name username profilePicture')
    .populate({
      path: 'replyTo',
      populate: { path: 'sender', select: 'name username' },
    });

  const io = req.app.get('io');
  io?.to(`chat:${chat._id}`).emit('message:new', populated);

  if (message.status === 'delivered') {
    io?.to(`chat:${chat._id}`).emit('message:delivered', {
      messageId: message._id,
      chatId: String(chat._id),
      status: 'delivered',
    });
  }

  for (const participantId of chat.participants) {
    if (String(participantId) !== String(req.user._id)) {
      io?.to(`user:${participantId}`).emit('chat:updated', {
        chatId: chat._id,
        lastMessage: populated,
        lastMessageAt: chat.lastMessageAt,
        unreadCount: chat.unreadCounts.get(String(participantId)) || 0,
      });

      await createNotification({
        recipient: participantId,
        sender: req.user._id,
        type: 'new_message',
        title: req.user.name,
        body: type === 'text' ? (req.body.content || '').slice(0, 80) : `Sent a ${type}`,
        data: { chatId: chat._id, messageId: message._id },
        io,
      });
    }
  }

  res.status(201).json({ success: true, data: { message: populated } });
});

export const editMessage = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message || String(message.sender) !== String(req.user._id)) {
    throw new AppError('Message not found', 404);
  }
  if (message.type !== 'text') throw new AppError('Only text messages can be edited', 400);

  message.content = req.body.content;
  message.edited = true;
  message.editedAt = new Date();
  await message.save();

  const populated = await message.populate('sender', 'name username profilePicture');
  req.app.get('io')?.to(`chat:${message.chat}`).emit('message:edited', populated);

  res.json({ success: true, data: { message: populated } });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const { scope = 'me' } = req.body;
  const message = await Message.findById(req.params.id);
  if (!message) throw new AppError('Message not found', 404);

  await assertChatAccess(message.chat, req.user._id);

  if (scope === 'everyone') {
    if (String(message.sender) !== String(req.user._id)) {
      throw new AppError('Only sender can delete for everyone', 403);
    }
    message.deletedForEveryone = true;
    message.content = 'This message was deleted';
    message.fileUrl = '';
    await message.save();
    req.app.get('io')?.to(`chat:${message.chat}`).emit('message:deleted', {
      messageId: message._id,
      scope: 'everyone',
    });
  } else {
    if (!message.deletedFor.some((id) => String(id) === String(req.user._id))) {
      message.deletedFor.push(req.user._id);
      await message.save();
    }
  }

  res.json({ success: true, message: 'Message deleted' });
});

export const searchMessages = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success: true, data: { messages: [] } });

  const chats = await Chat.find({ participants: req.user._id }).select('_id');
  const chatIds = chats.map((c) => c._id);

  const filter = {
    chat: { $in: chatIds },
    deletedFor: { $ne: req.user._id },
    deletedForEveryone: false,
    content: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  };

  if (req.query.chatId) filter.chat = req.query.chatId;
  if (req.query.userId) filter.sender = req.query.userId;

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(40)
    .populate('sender', 'name username profilePicture')
    .populate('chat', 'type participants group');

  res.json({ success: true, data: { messages } });
});

export const markSeen = asyncHandler(async (req, res) => {
  const chat = await assertChatAccess(req.params.chatId, req.user._id);

  await Message.updateMany(
    {
      chat: chat._id,
      sender: { $ne: req.user._id },
      seenBy: { $ne: req.user._id },
    },
    {
      $addToSet: { seenBy: req.user._id, deliveredTo: req.user._id },
      $set: { status: 'seen' },
    }
  );

  chat.unreadCounts.set(String(req.user._id), 0);
  await chat.save();

  req.app.get('io')?.to(`chat:${chat._id}`).emit('message:seen', {
    chatId: String(chat._id),
    userId: String(req.user._id),
  });

  res.json({ success: true, message: 'Marked as seen' });
});
