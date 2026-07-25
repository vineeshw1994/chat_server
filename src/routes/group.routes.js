import { Router } from 'express';
import {
  createGroup,
  getGroup,
  updateGroup,
  addMembers,
  removeMember,
  changeRole,
  leaveGroup,
  deleteGroup,
} from '../controllers/group.controller.js';
import { protect } from '../middleware/auth.js';
import { setUploadFolder, upload } from '../middleware/upload.js';

const router = Router();
router.use(protect);

router.post('/', setUploadFolder('groups'), upload.single('image'), createGroup);
router.get('/:id', getGroup);
router.patch('/:id', setUploadFolder('groups'), upload.single('image'), updateGroup);
router.post('/:id/members', addMembers);
router.delete('/:id/members/:userId', removeMember);
router.patch('/:id/members/:userId/role', changeRole);
router.post('/:id/leave', leaveGroup);
router.delete('/:id', deleteGroup);

export default router;
