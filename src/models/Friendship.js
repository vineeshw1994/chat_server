import mongoose from 'mongoose';

const friendshipSchema = new mongoose.Schema(
  {
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
  },
  { timestamps: true }
);

friendshipSchema.index({ users: 1 });

const Friendship = mongoose.model('Friendship', friendshipSchema);
export default Friendship;
