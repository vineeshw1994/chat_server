import BlockedUser from '../models/BlockedUser.js';

export const isBlockedEitherWay = async (userA, userB) => {
  const block = await BlockedUser.findOne({
    $or: [
      { blocker: userA, blocked: userB },
      { blocker: userB, blocked: userA },
    ],
  });
  return Boolean(block);
};

export const hasBlocked = async (blocker, blocked) => {
  const block = await BlockedUser.findOne({ blocker, blocked });
  return Boolean(block);
};
