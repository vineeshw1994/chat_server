import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const uploadsRoot = path.join(__dirname, '../../uploads');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

['avatars', 'chat', 'groups'].forEach((folder) => {
  ensureDir(path.join(uploadsRoot, folder));
});

const allowedMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/x-m4a',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/octet-stream',
]);

const isAllowedMime = (mime) => {
  if (!mime) return false;
  const base = mime.split(';')[0].trim().toLowerCase();
  if (allowedMimes.has(base)) return true;
  if (base.startsWith('audio/') || base.startsWith('video/') || base.startsWith('image/')) {
    return true;
  }
  return false;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.uploadFolder || 'chat';
    const dest = path.join(uploadsRoot, folder);
    ensureDir(dest);
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname);
    const baseMime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (!ext && baseMime.startsWith('audio/')) ext = '.webm';
    if (!ext && baseMime.startsWith('video/')) ext = '.webm';
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || ''}`;
    cb(null, safe);
  },
});

const fileFilter = (req, file, cb) => {
  if (!isAllowedMime(file.mimetype)) {
    return cb(new AppError(`File type not allowed: ${file.mimetype}`, 400), false);
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.uploadMaxSize },
});

export const setUploadFolder = (folder) => (req, res, next) => {
  req.uploadFolder = folder;
  next();
};
