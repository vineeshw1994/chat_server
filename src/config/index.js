import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});

const config = {
  port: Number(process.env.PORT) || 4000,

  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'chat_app',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  jwtSecret: process.env.JWT_SECRET || 'dev_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  clientUrl:
    process.env.CLIENT_URL || 'https://chat.genzcodershub.com',

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from:
      process.env.EMAIL_FROM ||
      'Zgen Chat <noreply@chat.app>',
  },

  uploadMaxSize:
    Number(process.env.UPLOAD_MAX_SIZE) || 50 * 1024 * 1024,

  otpExpiryMinutes: 5,
};

export default config;