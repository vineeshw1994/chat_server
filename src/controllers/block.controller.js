import BlockedUser from '../models/BlockedUser.js';
import Friendship from '../models/Friendship.js';
import FriendRequest from '../models/FriendRequest.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

export const blockUser = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) throw new AppError('User ID is required', 400);
  if (String(userId) === String(req.user._id)) {
    throw new AppError('Cannot block yourself', 400);
  }

  await BlockedUser.findOneAndUpdate(
    { blocker: req.user._id, blocked: userId },
    { blocker: req.user._id, blocked: userId },
    { upsert: true, new: true }
  );

  await Friendship.deleteOne({ users: { $all: [req.user._id, userId] } });
  await FriendRequest.deleteMany({
    $or: [
      { from: req.user._id, to: userId },
      { from: userId, to: req.user._id },
    ],
  });

  res.json({ success: true, message: 'User blocked' });
});

export const unblockUser = asyncHandler(async (req, res) => {
  await BlockedUser.deleteOne({ blocker: req.user._id, blocked: req.params.userId });
  res.json({ success: true, message: 'User unblocked' });
});

export const getBlockedUsers = asyncHandler(async (req, res) => {
  const blocked = await BlockedUser.find({ blocker: req.user._id })
    .populate('blocked', 'name username profilePicture email mobile')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: {
      blocked: blocked.map((b) => ({
        id: b._id,
        user: b.blocked?.toSafeObject?.() || b.blocked,
        blockedAt: b.createdAt,
      })),
    },
  });
});
