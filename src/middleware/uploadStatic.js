import path from 'path';
import fs from 'fs';
import express from 'express';
import { uploadsRoot } from './upload.js';

const MIME_BY_EXT = {
  '.webm': 'audio/webm',
  '.weba': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

export const uploadsStatic = [
  (req, res, next) => {
    const rel = decodeURIComponent(req.path || '');
    const filePath = path.join(uploadsRoot, rel);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next();
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(uploadsRoot, {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (mime) res.setHeader('Content-Type', mime);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
];
