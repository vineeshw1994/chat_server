export const ADMIN_SECTIONS = ['overview', 'users', 'chats', 'online', 'staff'];
export const ADMIN_ACTIONS = ['view', 'edit', 'update', 'delete'];

export const emptyPermissions = () =>
  ADMIN_SECTIONS.reduce((acc, section) => {
    acc[section] = ADMIN_ACTIONS.reduce((actions, action) => {
      actions[action] = false;
      return actions;
    }, {});
    return acc;
  }, {});

export const fullPermissions = () =>
  ADMIN_SECTIONS.reduce((acc, section) => {
    acc[section] = ADMIN_ACTIONS.reduce((actions, action) => {
      actions[action] = true;
      return actions;
    }, {});
    return acc;
  }, {});

export const sanitizePermissions = (input) => {
  const next = emptyPermissions();
  if (!input || typeof input !== 'object') return next;
  for (const section of ADMIN_SECTIONS) {
    const src = input[section] || {};
    for (const action of ADMIN_ACTIONS) {
      next[section][action] = Boolean(src[action]);
    }
  }
  return next;
};

export const canAccess = (user, section, action = 'view') => {
  if (!user) return false;
  if (user.deletedAt) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  const perms = user.permissions || {};
  return Boolean(perms[section]?.[action]);
};

export const hasConsoleAccess = (user) => {
  if (!user || user.deletedAt) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'staff') return false;
  return ADMIN_SECTIONS.some((section) => canAccess(user, section, 'view'));
};
