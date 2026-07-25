import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import friendRoutes from './friend.routes.js';
import blockRoutes from './block.routes.js';
import chatRoutes from './chat.routes.js';
import groupRoutes from './group.routes.js';
import callRoutes from './call.routes.js';
import notificationRoutes from './notification.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API is healthy' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/friends', friendRoutes);
router.use('/blocks', blockRoutes);
router.use('/chats', chatRoutes);
router.use('/groups', groupRoutes);
router.use('/calls', callRoutes);
router.use('/notifications', notificationRoutes);

export default router;
