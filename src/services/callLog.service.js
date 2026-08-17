import Chat from '../models/Chat.js';
import Message from '../models/Message.js';

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const buildCallLogContent = (call) => {
  const label = call.type === 'video' ? 'Video call' : 'Audio call';

  if (call.status === 'missed') return `Missed ${label.toLowerCase()}`;
  if (call.status === 'rejected') return `${label} · Declined`;
  if (call.status === 'ended' && call.duration > 0) {
    return `${label} · ${formatDuration(call.duration)}`;
  }
  if (call.status === 'ended') return label;
  return null;
};

const resolveChatId = async (call) => {
  const direct = call.chat?._id || call.chat;
  if (direct) return direct;

  const caller = call.caller?._id || call.caller;
  const receiver = call.receiver?._id || call.receiver;
  if (!caller || !receiver) return null;

  const chat = await Chat.findOne({
    type: 'private',
    participants: { $all: [caller, receiver], $size: 2 },
  });
  return chat?._id || chat?.id || null;
};

export const createCallLogMessage = async (call, io) => {
  const content = buildCallLogContent(call);
  if (!content) return null;

  const chatId = await resolveChatId(call);
  if (!chatId) return null;

  const chat = await Chat.findById(chatId);
  if (!chat) return null;

  const callerId = call.caller?._id || call.caller;
  const message = await Message.create({
    chat: chatId,
    sender: callerId,
    type: 'system',
    content,
    status: 'delivered',
    deliveredTo: chat.participants || [],
    seenBy: [],
  });

  chat.lastMessage = message._id;
  chat.lastMessageAt = new Date();
  await chat.save();

  const populated = await Message.findById(message._id).populate(
    'sender',
    'name username profilePicture'
  );

  io?.to(`chat:${chatId}`).emit('message:new', populated);

  for (const participantId of chat.participants || []) {
    io?.to(`user:${participantId}`).emit('chat:updated', {
      chatId: String(chatId),
      lastMessage: populated,
      lastMessageAt: chat.lastMessageAt,
    });
  }

  return message;
};
