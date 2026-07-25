import jwt from 'jsonwebtoken';
import config from '../config/index.js';

export const signToken = (userId) =>
  jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

export const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

export const generateUsername = (name, email) => {
  const base = (name || email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}${suffix}`;
};
