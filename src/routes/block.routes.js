import { Router } from 'express';
import { blockUser, unblockUser, getBlockedUsers } from '../controllers/block.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', getBlockedUsers);
router.post('/', blockUser);
router.delete('/:userId', unblockUser);

export default router;
