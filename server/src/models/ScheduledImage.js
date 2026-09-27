import mongoose from 'mongoose';

// Image bytes for a post that is not on LinkedIn yet: scheduled, or failed
// and waiting to be fixed and retried from the Dashboard. Stored in MongoDB
// rather than on disk so this keeps working on hosts without a persistent
// filesystem (e.g. Vercel). One document per image keeps each under
// MongoDB's 16MB limit (uploads are capped at 10MB). Deleted once the post
// is published or cancelled.
const scheduledImageSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  order: { type: Number, required: true },
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true },
  prompt: { type: String },
});

export default mongoose.model('ScheduledImage', scheduledImageSchema);
