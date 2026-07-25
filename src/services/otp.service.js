import OTP from '../models/OTP.js';
import config from '../config/index.js';
import { generateOTP } from '../helpers/token.js';
import { sendOTPEmail } from './email.service.js';
import AppError from '../utils/AppError.js';

export const createAndSendOTP = async (email, purpose) => {
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);

  await OTP.deleteMany({ email, purpose, isUsed: false });
  await OTP.create({ email, code, purpose, expiresAt });

  const result = await sendOTPEmail(email, code, purpose);
  return { expiresAt, ...result };
};

export const verifyOTPCode = async (email, code, purpose) => {
  const otp = await OTP.findOne({
    email: email.toLowerCase(),
    code,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  });

  if (!otp) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  otp.isUsed = true;
  await otp.save();
  return true;
};
