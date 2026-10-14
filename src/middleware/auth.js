import User from '../models/User.js';
import { verifyToken } from '../helpers/token.js';
import { canAccess, hasConsoleAccess } from '../helpers/permissions.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    throw new AppError('Authentication required', 401);
  }

  const decoded = verifyToken(token);
  const user = await User.findById(decoded.id);

  if (!user || user.deletedAt) {
    throw new AppError('User no longer exists', 401);
  }

  if (!user.isVerified) {
    throw new AppError('Please verify your email first', 403);
  }

  if (user.status === 'banned') {
    throw new AppError('Your account has been suspended', 403);
  }

  req.user = user;
  next();
});

export const requireAdmin = asyncHandler(async (req, res, next) => {
  if (!hasConsoleAccess(req.user)) {
    throw new AppError('Admin access required', 403);
  }
  next();
});

export const requirePermission = (section, action = 'view') =>
  asyncHandler(async (req, res, next) => {
    if (!canAccess(req.user, section, action)) {
      throw new AppError(`You do not have ${action} access to ${section}`, 403);
    }
    next();
  });
