import { Router } from 'express';
import {
  getChats,
  getOrCreatePrivateChat,
  pinChat,
  archiveChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  searchMessages,
  markSeen,
} from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.js';
import { setUploadFolder, upload } from '../middleware/upload.js';

const router = Router();
router.use(protect);

router.get('/', getChats);
router.post('/private', getOrCreatePrivateChat);
router.get('/messages/search', searchMessages);
router.post('/:id/pin', pinChat);
router.post('/:id/archive', archiveChat);
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/messages', setUploadFolder('chat'), upload.single('file'), sendMessage);
router.post('/:chatId/seen', markSeen);
router.patch('/messages/:id', editMessage);
router.delete('/messages/:id', deleteMessage);

export default router;
