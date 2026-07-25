import { Router } from 'express';
import {
  signup,
  login,
  verifySignupOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  me,
  logout,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  signupValidator,
  loginValidator,
  otpValidator,
  resetPasswordValidator,
} from '../validators/auth.validator.js';
import { body } from 'express-validator';

const router = Router();

router.post('/signup', signupValidator, validate, signup);
router.post('/verify-otp', otpValidator, validate, verifySignupOTP);
router.post(
  '/resend-otp',
  [body('email').isEmail().normalizeEmail()],
  validate,
  resendOTP
);
router.post('/login', loginValidator, validate, login);
router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validate,
  forgotPassword
);
router.post('/reset-password', resetPasswordValidator, validate, resetPassword);
router.get('/me', protect, me);
router.post('/logout', protect, logout);

export default router;
