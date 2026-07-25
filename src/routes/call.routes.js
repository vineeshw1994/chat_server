import { Router } from 'express';
import {
  initiateCall,
  inviteToCall,
  updateCallStatus,
  getCallHistory,
  getPendingCalls,
} from '../controllers/call.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/history', getCallHistory);
router.get('/pending', getPendingCalls);
router.post('/initiate', initiateCall);
router.post('/:id/invite', inviteToCall);
router.patch('/:id/status', updateCallStatus);

export default router;
