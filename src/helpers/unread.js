export const ensureUnreadMap = (chat) => {
  const raw = chat.unreadCounts;
  if (raw instanceof Map) return raw;
  const map = new Map(Object.entries(raw && typeof raw === 'object' ? raw : {}));
  chat.unreadCounts = map;
  return map;
};

export const getUnread = (chat, userId) => {
  const map = ensureUnreadMap(chat);
  return map.get(String(userId)) || 0;
};

export const setUnread = (chat, userId, value) => {
  const map = ensureUnreadMap(chat);
  map.set(String(userId), value);
  return value;
};

export const bumpUnread = (chat, userId) => {
  const next = getUnread(chat, userId) + 1;
  return setUnread(chat, userId, next);
};
