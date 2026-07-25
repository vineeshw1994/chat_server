import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan'; 
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import { uploadsRoot } from './middleware/upload.js';
import { uploadsStatic } from './middleware/uploadStatic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sanitizeKeys = (value) => {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
        continue;
      }
      sanitizeKeys(value[key]);
    }
  }
  return value;
};

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.body) sanitizeKeys(req.body);
  if (req.params) sanitizeKeys(req.params);
  next();
});

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/uploads', uploadsStatic);
app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

export default app;
