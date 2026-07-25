import User from '../models/User.js';
import { verifyToken } from '../helpers/token.js';
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

  if (!user) {
    throw new AppError('User no longer exists', 401);
  }

  if (!user.isVerified) {
    throw new AppError('Please verify your email first', 403);
  }

  req.user = user;
  next();
});
