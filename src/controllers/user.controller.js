import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  res.json({ success: true, data: { user: user.toSafeObject() } });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, mobile, bio, statusMessage, password, settings } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (name) user.name = name;
  if (mobile && mobile !== user.mobile) {
    const exists = await User.exists({ mobile, _id: { $ne: user._id } });
    if (exists) throw new AppError('Mobile number already in use', 409);
    user.mobile = mobile;
  }
  if (bio !== undefined) user.bio = bio;
  if (statusMessage !== undefined) user.statusMessage = statusMessage;
  if (password) user.password = password;
  if (req.file) {
    user.profilePicture = `/uploads/avatars/${req.file.filename}`;
  }

  if (settings) {
    const parsed = typeof settings === 'string' ? JSON.parse(settings) : settings;
    user.settings = { ...(user.settings?.toObject?.() || user.settings || {}), ...parsed };
  }

  await user.save();
  res.json({ success: true, message: 'Profile updated', data: { user: user.toSafeObject() } });
});

export const searchUsers = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json({ success: true, data: { users: [] } });
  }

  const users = await User.find({
    _id: { $ne: req.user._id },
    isVerified: true,
    $or: [
      { email: q.toLowerCase() },
      { mobile: q },
      { username: new RegExp(q, 'i') },
      { name: new RegExp(q, 'i') },
    ],
  })
    .limit(20)
    .select('name username email mobile profilePicture bio statusMessage isOnline lastSeen');

  res.json({
    success: true,
    data: {
      users: users.map((u) => {
        const safe = u.toSafeObject();
        const uid = safe.id || safe._id;
        return { ...safe, id: uid, _id: uid };
      }),
    },
  });
});
