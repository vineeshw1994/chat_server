import { body } from 'express-validator';

export const signupValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
];

export const loginValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

export const otpValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
];

export const resetPasswordValidator = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
];

export const updateProfileValidator = [
  body('name').optional().trim().isLength({ min: 1, max: 80 }),
  body('mobile').optional().trim().notEmpty(),
  body('bio').optional().isLength({ max: 300 }),
  body('statusMessage').optional().isLength({ max: 140 }),
  body('password').optional().isLength({ min: 6 }),
];
