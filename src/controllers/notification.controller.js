import Notification from '../models/Notification.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ recipient: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('sender', 'name username profilePicture');

  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  res.json({ success: true, data: { notifications, unreadCount } });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  await Notification.updateOne(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true }
  );
  res.json({ success: true, message: 'Marked as read' });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { isRead: true }
  );
  res.json({ success: true, message: 'All notifications marked as read' });
});
