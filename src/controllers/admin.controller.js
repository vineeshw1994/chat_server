import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import Group from '../models/Group.js';
import Call from '../models/Call.js';
import { getOnlineUsers } from '../socket/index.js';
import { generateUsername } from '../helpers/token.js';
import { sanitizePermissions } from '../helpers/permissions.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

const activeFilter = (extra = {}) => ({ deletedAt: null, ...extra });

const populateChat = (query) =>
  query
    .populate('participants', 'name username email profilePicture isOnline lastSeen role status')
    .populate('group', 'name image description owner')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name username profilePicture' },
    });

const serializeChat = (chat) => {
  const obj = chat.toObject ? chat.toObject() : chat;
  obj.participants = (chat.participants || []).map((p) =>
    p?.toSafeObject ? p.toSafeObject() : p
  );
  return obj;
};

export const getStats = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    users,
    verified,
    online,
    banned,
    admins,
    staff,
    chats,
    groups,
    messages,
    messagesToday,
    calls,
  ] = await Promise.all([
    User.countDocuments(activeFilter()),
    User.countDocuments(activeFilter({ isVerified: true })),
    User.countDocuments(activeFilter({ isOnline: true })),
    User.countDocuments(activeFilter({ status: 'banned' })),
    User.countDocuments(activeFilter({ role: 'admin' })),
    User.countDocuments(activeFilter({ role: 'staff' })),
    Chat.countDocuments(),
    Group.countDocuments(),
    Message.countDocuments(),
    Message.countDocuments({ createdAt: { $gt: startOfDay } }),
    Call.countDocuments(),
  ]);

  res.json({
    success: true,
    data: {
      stats: {
        users,
        verified,
        online,
        banned,
        admins,
        staff,
        chats,
        groups,
        messages,
        messagesToday,
        calls,
        socketOnline: getOnlineUsers().size,
      },
    },
  });
});

export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const q = (req.query.q || '').trim();

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.online === 'true') filter.isOnline = true;
  if (req.query.online === 'false') filter.isOnline = false;
  if (req.query.deleted === 'true') filter.deletedAt = { $ne: null };
  else if (req.query.includeDeleted !== 'true') filter.deletedAt = null;
  if (q) {
    filter.$or = [
      { email: q.toLowerCase() },
      { mobile: q },
      { username: new RegExp(q, 'i') },
      { name: new RegExp(q, 'i') },
    ];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  res.json({
    success: true,
    data: {
      users: users.map((u) => u.toSafeObject()),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);

  const chats = await populateChat(
    Chat.find({ participants: user._id }).sort({ lastMessageAt: -1 }).limit(50)
  );

  res.json({
    success: true,
    data: {
      user: user.toSafeObject(),
      chats: chats.map(serializeChat),
    },
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, mobile, password, role = 'user' } = req.body;
  if (!name || !email || !mobile || !password) {
    throw new AppError('Name, email, mobile and password are required', 400);
  }
  if (password.length < 6) throw new AppError('Password must be at least 6 characters', 400);

  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { mobile }],
  });
  if (existing) throw new AppError('Email or mobile already registered', 409);

  let username = generateUsername(name, email);
  while (await User.exists({ username })) {
    username = generateUsername(name, email);
  }

  const user = await User.create({
    name,
    email,
    mobile,
    password,
    username,
    isVerified: true,
    role: role === 'admin' ? 'admin' : 'user',
    status: 'active',
  });

  res.status(201).json({
    success: true,
    message: 'User created',
    data: { user: user.toSafeObject() },
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);

  const { name, mobile, role, status, isVerified } = req.body;

  if (String(user._id) === String(req.user._id) && role && role !== 'admin') {
    throw new AppError('You cannot demote your own admin account', 400);
  }
  if (String(user._id) === String(req.user._id) && status === 'banned') {
    throw new AppError('You cannot ban your own account', 400);
  }

  if (name) user.name = name;
  if (mobile) user.mobile = mobile;
  if (role === 'admin' || role === 'user' || role === 'staff') user.role = role;
  if (status === 'active' || status === 'banned') user.status = status;
  if (typeof isVerified === 'boolean') user.isVerified = isVerified;

  await user.save();

  res.json({
    success: true,
    message: 'User updated',
    data: { user: user.toSafeObject() },
  });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  if (String(user._id) === String(req.user._id)) {
    throw new AppError('You cannot delete your own account', 400);
  }

  user.deletedAt = new Date();
  user.status = 'banned';
  user.isOnline = false;
  user.socketId = null;
  await user.save();

  res.json({
    success: true,
    message: 'User removed',
    data: { user: user.toSafeObject() },
  });
});

export const restoreUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);

  user.deletedAt = null;
  user.status = 'active';
  await user.save();

  res.json({
    success: true,
    message: 'User restored',
    data: { user: user.toSafeObject() },
  });
});

const assertStaff = (user) => {
  if (!user || user.role !== 'staff') throw new AppError('Staff member not found', 404);
  return user;
};

export const listStaff = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const q = (req.query.q || '').trim();
  const filter = { role: 'staff' };
  if (req.query.deleted === 'true') filter.deletedAt = { $ne: null };
  else if (req.query.includeDeleted !== 'true') filter.deletedAt = null;
  if (q) {
    filter.$or = [
      { email: q.toLowerCase() },
      { mobile: q },
      { username: new RegExp(q, 'i') },
      { name: new RegExp(q, 'i') },
    ];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  res.json({
    success: true,
    data: {
      staff: users.map((u) => u.toSafeObject()),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const createStaff = asyncHandler(async (req, res) => {
  const { name, email, mobile, password, permissions } = req.body;
  if (!name || !email || !mobile || !password) {
    throw new AppError('Name, email, mobile and password are required', 400);
  }
  if (password.length < 6) throw new AppError('Password must be at least 6 characters', 400);

  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { mobile }],
  });
  if (existing) throw new AppError('Email or mobile already registered', 409);

  let username = generateUsername(name, email);
  while (await User.exists({ username })) {
    username = generateUsername(name, email);
  }

  const user = await User.create({
    name,
    email,
    mobile,
    password,
    username,
    isVerified: true,
    role: 'staff',
    status: 'active',
    permissions: sanitizePermissions(permissions),
  });

  res.status(201).json({
    success: true,
    message: 'Staff created',
    data: { user: user.toSafeObject() },
  });
});

export const updateStaff = asyncHandler(async (req, res) => {
  const user = assertStaff(await User.findById(req.params.id));
  const { name, mobile, permissions, status } = req.body;

  if (name) user.name = name;
  if (mobile) user.mobile = mobile;
  if (permissions) user.permissions = sanitizePermissions(permissions);
  if (status === 'active' || status === 'banned') user.status = status;

  await user.save();

  res.json({
    success: true,
    message: 'Staff updated',
    data: { user: user.toSafeObject() },
  });
});

export const deleteStaff = asyncHandler(async (req, res) => {
  const user = assertStaff(await User.findById(req.params.id));
  if (String(user._id) === String(req.user._id)) {
    throw new AppError('You cannot delete your own account', 400);
  }

  user.deletedAt = new Date();
  user.status = 'banned';
  user.isOnline = false;
  user.socketId = null;
  await user.save();

  res.json({
    success: true,
    message: 'Staff removed',
    data: { user: user.toSafeObject() },
  });
});

export const restoreStaff = asyncHandler(async (req, res) => {
  const user = assertStaff(await User.findById(req.params.id));
  user.deletedAt = null;
  user.status = 'active';
  await user.save();

  res.json({
    success: true,
    message: 'Staff restored',
    data: { user: user.toSafeObject() },
  });
});

export const listChats = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const type = req.query.type;
  const filter = {};
  if (type === 'private' || type === 'group') filter.type = type;
  if (req.query.userId) filter.participants = req.query.userId;

  const [total, chats] = await Promise.all([
    Chat.countDocuments(filter),
    populateChat(
      Chat.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ),
  ]);

  res.json({
    success: true,
    data: {
      chats: chats.map(serializeChat),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

export const getChatMessages = asyncHandler(async (req, res) => {
  const chat = await populateChat(Chat.findById(req.params.id));
  if (!chat) throw new AppError('Chat not found', 404);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(80, Number(req.query.limit) || 40);
  const skip = (page - 1) * limit;

  const messages = await Message.find({ chat: chat._id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'name username profilePicture role');

  res.json({
    success: true,
    data: {
      chat: serializeChat(chat),
      messages: messages.reverse(),
      page,
      hasMore: messages.length === limit,
    },
  });
});

export const listOnlineUsers = asyncHandler(async (req, res) => {
  const socketIds = [...getOnlineUsers().keys()];
  const users = await User.find(activeFilter({ isOnline: true }))
    .sort({ lastSeen: -1 })
    .limit(200);

  res.json({
    success: true,
    data: {
      users: users.map((u) => u.toSafeObject()),
      socketOnlineIds: socketIds,
      count: users.length,
    },
  });
});
