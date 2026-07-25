import User from '../models/User.js';
import { signToken, generateUsername } from '../helpers/token.js';
import { createAndSendOTP, verifyOTPCode } from '../services/otp.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';

const setAuthCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const signup = asyncHandler(async (req, res) => {
  const { name, email, mobile, password } = req.body;

  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { mobile }],
  });

  if (existing) {
    throw new AppError('Email or mobile already registered', 409);
  }

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
    isVerified: false,
  });

  const otpResult = await createAndSendOTP(email, 'signup');

  res.status(201).json({
    success: true,
    message: 'Account created. Please verify OTP sent to your email.',
    data: {
      email: user.email,
      otpDevCode: otpResult.devMode ? otpResult.code : undefined,
    },
  });
});

export const verifySignupOTP = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  await verifyOTPCode(email, code, 'signup');

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new AppError('User not found', 404);

  user.isVerified = true;
  await user.save();

  const token = signToken(user._id);
  setAuthCookie(res, token);

  res.json({
    success: true,
    message: 'Account verified successfully',
    data: { token, user: user.toSafeObject() },
  });
});

export const resendOTP = asyncHandler(async (req, res) => {
  const { email, purpose = 'signup' } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new AppError('User not found', 404);

  const otpPurpose = purpose === 'forgot_password' ? 'forgot_password' : 'signup';
  const otpResult = await createAndSendOTP(email, otpPurpose);

  res.json({
    success: true,
    message: 'OTP resent successfully',
    data: { otpDevCode: otpResult.devMode ? otpResult.code : undefined },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isVerified) {
    const otpResult = await createAndSendOTP(email, 'signup');
    return res.status(403).json({
      success: false,
      message: 'Account not verified. OTP sent to email.',
      data: {
        requiresVerification: true,
        email: user.email,
        otpDevCode: otpResult.devMode ? otpResult.code : undefined,
      },
    });
  }

  const token = signToken(user._id);
  setAuthCookie(res, token);

  res.json({
    success: true,
    message: 'Login successful',
    data: { token, user: user.toSafeObject() },
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new AppError('User not found', 404);

  const otpResult = await createAndSendOTP(email, 'forgot_password');

  res.json({
    success: true,
    message: 'Password reset OTP sent to email',
    data: { otpDevCode: otpResult.devMode ? otpResult.code : undefined },
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;
  await verifyOTPCode(email, code, 'forgot_password');

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) throw new AppError('User not found', 404);

  user.password = password;
  await user.save();

  res.json({ success: true, message: 'Password reset successful' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeObject() } });
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});
