import { Router } from 'express';
import {
  getNotifications,
  markNotificationRead,
  markAllRead,
} from '../controllers/notification.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', getNotifications);
router.post('/read-all', markAllRead);
router.post('/:id/read', markNotificationRead);

export default router;
