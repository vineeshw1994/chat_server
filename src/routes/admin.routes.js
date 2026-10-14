import { Router } from 'express';
import { protect, requireAdmin, requirePermission } from '../middleware/auth.js';
import {
  getStats,
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  listChats,
  getChatMessages,
  listOnlineUsers,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  restoreStaff,
} from '../controllers/admin.controller.js';

const router = Router();

router.use(protect, requireAdmin);

router.get('/stats', requirePermission('overview', 'view'), getStats);
router.get('/users', requirePermission('users', 'view'), listUsers);
router.post('/users', requirePermission('users', 'edit'), createUser);
router.get('/users/:id', requirePermission('users', 'view'), getUser);
router.patch('/users/:id', requirePermission('users', 'update'), updateUser);
router.delete('/users/:id', requirePermission('users', 'delete'), deleteUser);
router.post('/users/:id/restore', requirePermission('users', 'update'), restoreUser);
router.get('/chats', requirePermission('chats', 'view'), listChats);
router.get('/chats/:id/messages', requirePermission('chats', 'view'), getChatMessages);
router.get('/online', requirePermission('online', 'view'), listOnlineUsers);
router.get('/staff', requirePermission('staff', 'view'), listStaff);
router.post('/staff', requirePermission('staff', 'edit'), createStaff);
router.patch('/staff/:id', requirePermission('staff', 'update'), updateStaff);
router.delete('/staff/:id', requirePermission('staff', 'delete'), deleteStaff);
router.post('/staff/:id/restore', requirePermission('staff', 'update'), restoreStaff);

export default router;
