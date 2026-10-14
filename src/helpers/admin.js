import config from '../config/index.js';

export const isAdminEmail = (email) => {
  const adminEmail = config.adminEmail;
  if (!adminEmail || !email) return false;
  return String(email).toLowerCase().trim() === adminEmail;
};

export const promoteIfAdminEmail = async (user) => {
  if (!user || !isAdminEmail(user.email)) return user;
  if (user.role !== 'admin') {
    user.role = 'admin';
    if (!user.status || user.status === 'banned') user.status = 'active';
    await user.save();
  }
  return user;
};
