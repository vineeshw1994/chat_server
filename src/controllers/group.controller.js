import Group from '../models/Group.js';
import GroupMember from '../models/GroupMember.js';
import Chat from '../models/Chat.js';
import Friendship from '../models/Friendship.js';
import Message from '../models/Message.js';
import { createNotification } from '../services/notification.service.js';
import { setUnread } from '../helpers/unread.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

const getMembership = async (groupId, userId) =>
  GroupMember.findOne({ group: groupId, user: userId });

const parseIdList = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export const createGroup = asyncHandler(async (req, res) => {
  const { name, description = '', memberIds = [] } = req.body;
  if (!name?.trim()) throw new AppError('Group name is required', 400);

  let members = parseIdList(memberIds);
  members = [...new Set(members)].filter((id) => id !== String(req.user._id));
  const adminIds = new Set(parseIdList(req.body.adminIds).filter((id) => members.includes(id)));

  for (const memberId of members) {
    const friendship = await Friendship.findOne({
      users: { $all: [req.user._id, memberId] },
    });
    if (!friendship) throw new AppError('You can only invite friends', 400);
  }

  const group = await Group.create({
    name: name.trim(),
    description,
    owner: req.user._id,
    image: req.file ? `/uploads/groups/${req.file.filename}` : '',
  });

  const participantIds = [req.user._id, ...members];
  const unreadCounts = {};
  participantIds.forEach((id) => {
    unreadCounts[String(id)] = 0;
  });

  const chat = await Chat.create({
    type: 'group',
    participants: participantIds,
    group: group._id,
    unreadCounts,
  });

  group.chat = chat._id;
  await group.save();

  await GroupMember.create({ group: group._id, user: req.user._id, role: 'owner' });
  await GroupMember.insertMany(
    members.map((userId) => ({
      group: group._id,
      user: userId,
      role: adminIds.has(String(userId)) ? 'admin' : 'member',
    }))
  );

  await Message.create({
    chat: chat._id,
    sender: req.user._id,
    type: 'system',
    content: `${req.user.name} created the group`,
  });

  const io = req.app.get('io');
  for (const memberId of members) {
    await createNotification({
      recipient: memberId,
      sender: req.user._id,
      type: 'group_invite',
      title: 'Group invite',
      body: `${req.user.name} added you to ${group.name}`,
      data: { groupId: group._id, chatId: chat._id },
      io,
    });
    io?.to(`user:${memberId}`).emit('group:invite', { group, chatId: chat._id });
  }

  const populated = await Group.findById(group._id).populate('owner', 'name username profilePicture');

  res.status(201).json({
    success: true,
    message: 'Group created',
    data: { group: populated, chatId: chat._id },
  });
});

export const getGroup = asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user._id);
  if (!membership) throw new AppError('Group not found', 404);

  const group = await Group.findById(req.params.id).populate('owner', 'name username profilePicture');
  const members = await GroupMember.find({ group: req.params.id })
    .populate('user', 'name username profilePicture isOnline lastSeen')
    .sort({ role: 1 });

  res.json({
    success: true,
    data: {
      group,
      members,
      myRole: membership.role,
    },
  });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user._id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new AppError('Not allowed', 403);
  }

  const group = await Group.findById(req.params.id);
  if (!group) throw new AppError('Group not found', 404);

  if (req.body.name) group.name = req.body.name;
  if (req.body.description !== undefined) group.description = req.body.description;
  if (req.file) group.image = `/uploads/groups/${req.file.filename}`;
  await group.save();

  res.json({ success: true, data: { group } });
});

export const addMembers = asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user._id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new AppError('Not allowed', 403);
  }

  const { memberIds = [] } = req.body;
  const group = await Group.findById(req.params.id);
  const chat = await Chat.findById(group.chat);
  const io = req.app.get('io');

  for (const userId of memberIds) {
    const exists = await GroupMember.findOne({ group: group._id, user: userId });
    if (exists) continue;

    const friendship = await Friendship.findOne({
      users: { $all: [req.user._id, userId] },
    });
    if (!friendship) continue;

    await GroupMember.create({ group: group._id, user: userId, role: 'member' });
    if (!chat.participants.some((p) => String(p) === String(userId))) {
      chat.participants.push(userId);
      setUnread(chat, userId, 0);
    }

    await createNotification({
      recipient: userId,
      sender: req.user._id,
      type: 'group_invite',
      title: 'Group invite',
      body: `${req.user.name} added you to ${group.name}`,
      data: { groupId: group._id, chatId: chat._id },
      io,
    });
  }

  await chat.save();
  res.json({ success: true, message: 'Members added' });
});

export const removeMember = asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user._id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new AppError('Not allowed', 403);
  }

  const target = await getMembership(req.params.id, req.params.userId);
  if (!target) throw new AppError('Member not found', 404);
  if (target.role === 'owner') throw new AppError('Cannot remove the group owner', 400);
  if (target.role === 'admin') {
    throw new AppError('Cannot remove group admins', 403);
  }

  await GroupMember.deleteOne({ _id: target._id });
  const group = await Group.findById(req.params.id);
  const chat = await Chat.findById(group.chat);
  chat.participants = chat.participants.filter((p) => String(p) !== String(req.params.userId));
  await chat.save();

  res.json({ success: true, message: 'Member removed' });
});

export const changeRole = asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user._id);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new AppError('Only group admins can change roles', 403);
  }

  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) throw new AppError('Invalid role', 400);

  const target = await getMembership(req.params.id, req.params.userId);
  if (!target || target.role === 'owner') throw new AppError('Invalid member', 400);

  if (role === 'member' && target.role === 'admin' && membership.role !== 'owner') {
    throw new AppError('Only the group owner can demote admins', 403);
  }

  target.role = role;
  await target.save();

  res.json({
    success: true,
    message: role === 'admin' ? 'Member is now a group admin' : 'Admin demoted to member',
    data: { member: target },
  });
});

export const leaveGroup = asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user._id);
  if (!membership) throw new AppError('Not a member', 404);
  if (membership.role === 'owner') {
    throw new AppError('Owner must delete the group or transfer ownership first', 400);
  }

  await GroupMember.deleteOne({ _id: membership._id });
  const group = await Group.findById(req.params.id);
  const chat = await Chat.findById(group.chat);
  chat.participants = chat.participants.filter((p) => String(p) !== String(req.user._id));
  await chat.save();

  res.json({ success: true, message: 'Left group' });
});

export const deleteGroup = asyncHandler(async (req, res) => {
  const membership = await getMembership(req.params.id, req.user._id);
  if (!membership || membership.role !== 'owner') {
    throw new AppError('Only owner can delete group', 403);
  }

  const group = await Group.findById(req.params.id);
  await GroupMember.deleteMany({ group: group._id });
  await Message.deleteMany({ chat: group.chat });
  await Chat.deleteOne({ _id: group.chat });
  await Group.deleteOne({ _id: group._id });

  res.json({ success: true, message: 'Group deleted' });
});
