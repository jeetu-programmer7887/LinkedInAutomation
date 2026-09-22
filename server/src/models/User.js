import mongoose from 'mongoose';

const themeSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Kiln' },
    background: { type: String, default: '#FBF7F2' },
    text: { type: String, default: '#2B2119' },
    hover: { type: String, default: '#A65A2E' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    linkedInId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String },
    profilePictureUrl: { type: String },

    // Encrypted at rest - see utils/crypto.js. Never returned by toJSON.
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    tokenExpiresAt: { type: Date },

    theme: { type: themeSchema, default: () => ({}) },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.accessToken;
    delete ret.refreshToken;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
