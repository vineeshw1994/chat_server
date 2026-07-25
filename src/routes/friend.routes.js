import { Router } from 'express';
import {
  sendFriendRequest,
  respondFriendRequest,
  getFriends,
  getFriendRequests,
} from '../controllers/friend.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', getFriends);
router.get('/requests', getFriendRequests);
router.post('/request', sendFriendRequest);
router.post('/request/:id/respond', respondFriendRequest);

export default router;
