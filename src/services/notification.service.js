import Notification from '../models/Notification.js';

export const createNotification = async ({
  recipient,
  sender = null,
  type,
  title,
  body = '',
  data = {},
  io = null,
}) => {
  const notification = await Notification.create({
    recipient,
    sender,
    type,
    title,
    body,
    data,
  });

  const populated = await Notification.findById(notification._id).populate(
    'sender',
    'name username profilePicture'
  );

  const plain = populated?.toObject?.() ?? populated?.toJSON?.() ?? populated;

  // Always emit only to the recipient's private room (never broadcast globally)
  if (io && recipient) {
    io.to(`user:${String(recipient)}`).emit('notification:new', {
      ...plain,
      recipient: String(recipient),
    });
  }

  return plain;
};
