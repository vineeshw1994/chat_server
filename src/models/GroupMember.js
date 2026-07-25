import mongoose from 'mongoose';

const groupMemberSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
  },
  { timestamps: true }
);

groupMemberSchema.index({ group: 1, user: 1 }, { unique: true });

const GroupMember = mongoose.model('GroupMember', groupMemberSchema);
export default GroupMember;
