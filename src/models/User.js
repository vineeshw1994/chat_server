import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    mobile: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    profilePicture: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 300 },
    statusMessage: { type: String, default: 'Hey there! I am using ChatApp.', maxlength: 140 },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    isVerified: { type: Boolean, default: false },
    socketId: { type: String, default: null },
    settings: {
      autoDownloadPhotos: {
        type: String,
        enum: ['never', 'wifi', 'always'],
        default: 'wifi',
      },
      autoDownloadVideos: {
        type: String,
        enum: ['never', 'wifi', 'always'],
        default: 'wifi',
      },
      autoDownloadFiles: {
        type: String,
        enum: ['never', 'wifi', 'always'],
        default: 'never',
      },
      autoDownloadVoice: {
        type: String,
        enum: ['never', 'wifi', 'always'],
        default: 'always',
      },
      notificationSound: { type: Boolean, default: true },
      messagePreview: { type: Boolean, default: true },
      showOnlineStatus: { type: Boolean, default: true },
      readReceipts: { type: Boolean, default: true },
      saveToGallery: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    name: this.name,
    username: this.username,
    email: this.email,
    mobile: this.mobile,
    profilePicture: this.profilePicture,
    bio: this.bio,
    statusMessage: this.statusMessage,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen,
    settings: this.settings || {},
    createdAt: this.createdAt,
  };
};

const User = mongoose.model('User', userSchema);
export default User;
