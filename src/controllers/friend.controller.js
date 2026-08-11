import FriendRequest from '../models/FriendRequest.js';
import Friendship from '../models/Friendship.js';
import Chat from '../models/Chat.js';
import { isBlockedEitherWay } from '../helpers/block.js';
import { createNotification } from '../services/notification.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

export const sendFriendRequest = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    throw new AppError('User ID is required', 400);
  }
  if (String(userId) === String(req.user._id)) {
    throw new AppError('Cannot send request to yourself', 400);
  }

  if (await isBlockedEitherWay(req.user._id, userId)) {
    throw new AppError('Unable to send request', 403);
  }

  const existingFriendship = await Friendship.findOne({
    users: { $all: [req.user._id, userId] },
  });
  if (existingFriendship) throw new AppError('Already friends', 409);

  const existingRequest = await FriendRequest.findOne({
    $or: [
      { from: req.user._id, to: userId },
      { from: userId, to: req.user._id },
    ],
    status: 'pending',
  });
  if (existingRequest) throw new AppError('Friend request already exists', 409);

  const request = await FriendRequest.create({ from: req.user._id, to: userId });
  await request.populate('from', 'name username profilePicture');

  const io = req.app.get('io');
  await createNotification({
    recipient: userId,
    sender: req.user._id,
    type: 'friend_request',
    title: 'Friend request',
    body: `${req.user.name} sent you a friend request`,
    data: { requestId: request._id },
    io,
  });

  io?.to(`user:${userId}`).emit('friend:request', request);

  res.status(201).json({ success: true, message: 'Friend request sent', data: { request } });
});

export const respondFriendRequest = asyncHandler(async (req, res) => {
  const { action } = req.body;
  if (!['accept', 'reject'].includes(action)) {
    throw new AppError('Action must be accept or reject', 400);
  }

  const request = await FriendRequest.findById(req.params.id);
  if (!request || String(request.to) !== String(req.user._id)) {
    throw new AppError('Friend request not found', 404);
  }
  if (request.status !== 'pending') {
    throw new AppError('Request already handled', 400);
  }

  request.status = action === 'accept' ? 'accepted' : 'rejected';
  await request.save();

  const io = req.app.get('io');

  if (action === 'accept') {
    await Friendship.create({ users: [request.from, request.to] });

    let chat = await Chat.findOne({
      type: 'private',
      participants: { $all: [request.from, request.to], $size: 2 },
    });

    if (!chat) {
      chat = await Chat.create({
        type: 'private',
        participants: [request.from, request.to],
        unreadCounts: {
          [String(request.from)]: 0,
          [String(request.to)]: 0,
        },
      });
    }

    await createNotification({
      recipient: request.from,
      sender: req.user._id,
      type: 'friend_accepted',
      title: 'Friend request accepted',
      body: `${req.user.name} accepted your friend request`,
      data: { chatId: chat._id },
      io,
    });

    io?.to(`user:${request.from}`).emit('friend:accepted', {
      request,
      chat,
      by: req.user.toSafeObject(),
    });
  }

  res.json({
    success: true,
    message: `Friend request ${action}ed`,
    data: { request },
  });
});

export const getFriends = asyncHandler(async (req, res) => {
  const friendships = await Friendship.find({ users: req.user._id }).populate(
    'users',
    'name username email mobile profilePicture bio statusMessage isOnline lastSeen'
  );

  const friends = friendships.map((f) => {
    const other = f.users.find((u) => String(u._id) !== String(req.user._id));
    const safe = other?.toSafeObject?.() || other;
    if (!safe) return null;
    const uid = safe.id || safe._id;
    return { ...safe, id: uid, _id: uid };
  }).filter(Boolean);

  res.json({ success: true, data: { friends } });
});

export const getFriendRequests = asyncHandler(async (req, res) => {
  const incoming = await FriendRequest.find({ to: req.user._id, status: 'pending' })
    .populate('from', 'name username profilePicture email mobile isOnline lastSeen')
    .sort({ createdAt: -1 });

  const outgoing = await FriendRequest.find({ from: req.user._id, status: 'pending' })
    .populate('to', 'name username profilePicture email mobile isOnline lastSeen')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: { incoming, outgoing } });
});
