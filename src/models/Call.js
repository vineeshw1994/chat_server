import mongoose from 'mongoose';

const callSchema = new mongoose.Schema(
  {
    caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
    type: { type: String, enum: ['audio', 'video'], required: true },
    status: {
      type: String,
      enum: ['ringing', 'accepted', 'rejected', 'ended', 'missed'],
      default: 'ringing',
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

callSchema.pre('save', function setParticipants() {
  if (!this.participants?.length) {
    this.participants = [this.caller, this.receiver];
  }
});

const Call = mongoose.model('Call', callSchema);
export default Call;
