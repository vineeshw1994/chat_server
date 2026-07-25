import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Call from '../models/Call.js';
import Message from '../models/Message.js';
import { isBlockedEitherWay } from '../helpers/block.js';
import { populateCall } from '../services/callRing.service.js';
const onlineUsers = new Map();

export const getOnlineUsers = () => onlineUsers;

const initSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id);
      if (!user || !user.isVerified) return next(new Error('Invalid user'));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = String(socket.user._id);
    onlineUsers.set(userId, socket.id);

    socket.join(`user:${userId}`);

    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      socketId: socket.id,
      lastSeen: new Date(),
    });

    io.emit('user:online', { userId, isOnline: true });

    const chats = await Chat.find({ participants: userId }).select('_id');
    chats.forEach((chat) => socket.join(`chat:${chat._id}`));

    // Re-deliver ringing calls when user reconnects (offline → online)
    const pendingCalls = await Call.find({
      status: 'ringing',
      $or: [{ receiver: userId }, { participants: userId }],
      caller: { $ne: userId },
    }).limit(5);

    for (const call of pendingCalls) {
      const populated = await populateCall(call._id);
      socket.emit('call:incoming', populated);
    }

    socket.on('chat:join', (chatId) => {
      if (chatId) socket.join(`chat:${String(chatId)}`);
    });

    socket.on('typing:start', ({ chatId }) => {
      if (!chatId) return;
      const room = `chat:${String(chatId)}`;
      socket.join(room);
      socket.to(room).emit('typing:start', {
        chatId: String(chatId),
        user: {
          id: userId,
          name: socket.user.name,
        },
      });
    });

    socket.on('typing:stop', ({ chatId }) => {
      if (!chatId) return;
      socket.to(`chat:${String(chatId)}`).emit('typing:stop', {
        chatId: String(chatId),
        userId,
      });
    });

    socket.on('message:deliver', async ({ messageId }) => {
      const message = await Message.findById(messageId);
      if (!message) return;
      if (!message.deliveredTo.some((id) => String(id) === userId)) {
        message.deliveredTo.push(userId);
        if (message.status === 'sent') message.status = 'delivered';
        await message.save();
        io.to(`chat:${message.chat}`).emit('message:delivered', {
          messageId,
          chatId: String(message.chat),
          userId,
          status: message.status,
        });
      }
    });

    // WebRTC signaling
    socket.on('webrtc:offer', async ({ to, offer, callId, type }) => {
      if (await isBlockedEitherWay(userId, to)) return;
      io.to(`user:${to}`).emit('webrtc:offer', {
        from: userId,
        offer,
        callId,
        type,
        caller: {
          id: userId,
          name: socket.user.name,
          profilePicture: socket.user.profilePicture,
        },
      });
    });

    socket.on('webrtc:answer', ({ to, answer, callId }) => {
      io.to(`user:${to}`).emit('webrtc:answer', {
        from: userId,
        answer,
        callId,
      });
    });

    socket.on('webrtc:ice-candidate', ({ to, candidate, callId }) => {
      io.to(`user:${to}`).emit('webrtc:ice-candidate', {
        from: userId,
        candidate,
        callId,
      });
    });

    socket.on('webrtc:request-offer', async ({ to, callId, type }) => {
      if (await isBlockedEitherWay(userId, to)) return;
      io.to(`user:${to}`).emit('webrtc:request-offer', {
        from: userId,
        callId,
        type,
      });
    });

    socket.on('webrtc:end', ({ to, callId }) => {
      io.to(`user:${to}`).emit('webrtc:end', { from: userId, callId });
    });

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        socketId: null,
        lastSeen,
      });
      io.emit('user:offline', { userId, isOnline: false, lastSeen });
    });
  });
};

export default initSocket;
