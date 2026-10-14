import Call from '../models/Call.js';
import Chat from '../models/Chat.js';
import Friendship from '../models/Friendship.js';
import { isBlockedEitherWay } from '../helpers/block.js';
import { createNotification } from '../services/notification.service.js';
import {
  clearRingTimer,
  populateCall,
  scheduleMissedCall,
} from '../services/callRing.service.js';
import { createCallLogMessage } from '../services/callLog.service.js';
import { getOnlineUsers } from '../socket/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

const isCallParticipant = (call, userId) =>
  call.participants?.some((p) => String(p._id || p) === String(userId)) ||
  String(call.caller) === String(userId) ||
  String(call.receiver) === String(userId);

export const initiateCall = asyncHandler(async (req, res) => {
  const { receiverId, type = 'audio', chatId = null } = req.body;
  if (!['audio', 'video'].includes(type)) throw new AppError('Invalid call type', 400);

  let chat = null;
  if (chatId) {
    chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.some((p) => String(p) === String(req.user._id))) {
      throw new AppError('Chat not found', 404);
    }
  }

  let participantIds = [];
  let primaryReceiver = receiverId;

  if (chat?.type === 'group') {
    participantIds = [...new Set(chat.participants.map(String))];
    const others = participantIds.filter((id) => id !== String(req.user._id));
    if (!others.length) throw new AppError('No other members to call', 400);
    primaryReceiver = others[0];
  } else {
    if (!receiverId) throw new AppError('Receiver ID is required', 400);
    const friendship = await Friendship.findOne({
      users: { $all: [req.user._id, receiverId] },
    });
    if (!friendship) throw new AppError('You can only call friends', 403);
    if (await isBlockedEitherWay(req.user._id, receiverId)) {
      throw new AppError('Unable to call this user', 403);
    }
    participantIds = [String(req.user._id), String(receiverId)];
    primaryReceiver = receiverId;
  }

  const call = await Call.create({
    caller: req.user._id,
    receiver: primaryReceiver,
    participants: participantIds,
    chat: chat?._id || chatId || null,
    type,
    status: 'ringing',
  });

  const populated = await populateCall(call._id);
  const io = req.app.get('io');
  const onlineUsers = getOnlineUsers();
  const others = participantIds.filter((id) => id !== String(req.user._id));
  const receiverOnline = others.some((id) => onlineUsers.has(String(id)));
  const isGroupCall = chat?.type === 'group';
  const incomingPayload = {
    ...(populated.toObject?.() || populated),
    isGroupCall,
  };

  for (const uid of others) {
    io?.to(`user:${uid}`).emit('call:incoming', {
      ...incomingPayload,
      isGroupInvite: isGroupCall,
    });
    await createNotification({
      recipient: uid,
      sender: req.user._id,
      type: 'incoming_call',
      title: isGroupCall ? `Incoming group ${type} call` : `Incoming ${type} call`,
      body: `${req.user.name} is calling you`,
      data: { callId: call._id, type, callerId: req.user._id, chatId: chat?._id || chatId },
      io,
    });
  }

  scheduleMissedCall(call._id, io);

  res.status(201).json({
    success: true,
    data: {
      call: populated,
      receiverOnline,
      message: receiverOnline
        ? 'Calling...'
        : 'No one is online — they will be notified when back online',
    },
  });
});

export const inviteToCall = asyncHandler(async (req, res) => {
  const { userIds = [] } = req.body;
  if (!Array.isArray(userIds) || !userIds.length) {
    throw new AppError('Select at least one person to add', 400);
  }

  const call = await Call.findById(req.params.id);
  if (!call) throw new AppError('Call not found', 404);
  if (!['ringing', 'accepted'].includes(call.status)) {
    throw new AppError('Call is no longer active', 400);
  }
  if (!isCallParticipant(call, req.user._id)) {
    throw new AppError('Not allowed', 403);
  }

  const io = req.app.get('io');
  const added = [];

  for (const userId of userIds) {
    const uid = String(userId);
    if (call.participants.some((p) => String(p) === uid)) continue;

    const friendship = await Friendship.findOne({
      users: { $all: [req.user._id, userId] },
    });
    if (!friendship) continue;
    if (await isBlockedEitherWay(req.user._id, userId)) continue;

    call.participants.push(userId);
    added.push(userId);

    const populated = await populateCall(call._id);

    io?.to(`user:${uid}`).emit('call:incoming', {
      ...populated.toObject?.() || populated,
      isGroupInvite: true,
      invitedBy: req.user._id,
    });

    await createNotification({
      recipient: userId,
      sender: req.user._id,
      type: 'incoming_call',
      title: `Join ${call.type} call`,
      body: `${req.user.name} added you to a ${call.type} call`,
      data: { callId: call._id, type: call.type, callerId: call.caller },
      io,
    });
  }

  await call.save();
  const populated = await populateCall(call._id);

  for (const pid of call.participants) {
    io?.to(`user:${pid}`).emit('call:participant-added', {
      call: populated,
      addedUserIds: added,
    });
  }

  res.json({ success: true, data: { call: populated, addedUserIds: added } });
});

export const updateCallStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const call = await Call.findById(req.params.id);
  if (!call) throw new AppError('Call not found', 404);

  if (!isCallParticipant(call, req.user._id)) {
    throw new AppError('Not allowed', 403);
  }

  const previousStatus = call.status;

  if (['accepted', 'rejected', 'ended', 'missed'].includes(status)) {
    clearRingTimer(call._id);
  }

  call.status = status;
  if (status === 'accepted') call.startedAt = new Date();
  if (['ended', 'rejected', 'missed'].includes(status)) {
    call.endedAt = new Date();
    if (call.startedAt) {
      call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
    }
  }
  await call.save();

  const populated = await populateCall(call._id);
  const io = req.app.get('io');

  if (
    ['ended', 'rejected', 'missed'].includes(status) &&
    !['ended', 'rejected', 'missed'].includes(previousStatus)
  ) {
    await createCallLogMessage(populated, io);
  }

  for (const pid of call.participants) {
    io?.to(`user:${pid}`).emit('call:status', populated);
  }

  res.json({ success: true, data: { call: populated } });
});

export const getCallHistory = asyncHandler(async (req, res) => {
  const calls = await Call.find({
    $or: [{ caller: req.user._id }, { receiver: req.user._id }, { participants: req.user._id }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('caller', 'name username profilePicture')
    .populate('receiver', 'name username profilePicture')
    .populate('participants', 'name username profilePicture');

  res.json({ success: true, data: { calls } });
});

export const getPendingCalls = asyncHandler(async (req, res) => {
  const calls = await Call.find({
    status: 'ringing',
    $or: [{ receiver: req.user._id }, { participants: req.user._id }],
    caller: { $ne: req.user._id },
  })
    .populate('caller', 'name username profilePicture')
    .populate('receiver', 'name username profilePicture')
    .populate('participants', 'name username profilePicture');

  res.json({ success: true, data: { calls } });
});
