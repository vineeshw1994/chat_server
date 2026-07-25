import Call from '../models/Call.js';
import { createNotification } from './notification.service.js';

const ringTimers = new Map();
const RING_TIMEOUT_MS = 45000;

const populateCall = (id) =>
  Call.findById(id)
    .populate('caller', 'name username profilePicture')
    .populate('receiver', 'name username profilePicture')
    .populate('participants', 'name username profilePicture');

export const clearRingTimer = (callId) => {
  const key = String(callId);
  const timer = ringTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    ringTimers.delete(key);
  }
};

export const scheduleMissedCall = (callId, io) => {
  clearRingTimer(callId);
  const timer = setTimeout(async () => {
    ringTimers.delete(String(callId));
    try {
      const call = await Call.findById(callId);
      if (!call || call.status !== 'ringing') return;

      call.status = 'missed';
      call.endedAt = new Date();
      await call.save();

      const populated = await populateCall(callId);

      for (const uid of [call.caller, call.receiver]) {
        await createNotification({
          recipient: uid,
          sender: call.caller,
          type: 'missed_call',
          title: `Missed ${call.type} call`,
          body:
            String(uid) === String(call.receiver)
              ? `${populated.caller?.name || 'Someone'} called you`
              : 'No answer',
          data: { callId: call._id, type: call.type },
          io,
        });
      }

      io?.to(`user:${call.caller}`).emit('call:status', populated);
      io?.to(`user:${call.receiver}`).emit('call:status', populated);
    } catch (err) {
      console.error('Missed call timer error', err);
    }
  }, RING_TIMEOUT_MS);

  ringTimers.set(String(callId), timer);
};

export { populateCall };
