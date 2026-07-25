import { Router } from 'express';
import { getProfile, updateProfile, searchUsers } from '../controllers/user.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileValidator } from '../validators/auth.validator.js';
import { setUploadFolder, upload } from '../middleware/upload.js';

const router = Router();

router.use(protect);
router.get('/search', searchUsers);
router.get('/:id', getProfile);
router.patch(
  '/me',
  setUploadFolder('avatars'),
  upload.single('profilePicture'),
  updateProfileValidator,
  validate,
  updateProfile
);

export default router;
