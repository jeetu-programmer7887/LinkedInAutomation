import mongoose from 'mongoose';

// Append-only log of what happened in the app, for the Dashboard's
// activity feed. Caption/prompt generations are deliberately not logged:
// only posts (and the research that feeds them) count as activity.
export const ACTIVITY_TYPES = [
  'post_published',
  'post_scheduled',
  'post_failed',
  'post_cancelled',
  'post_rescheduled',
  'research_done',
  'research_failed',
  'research_time_changed',
  'theme_changed',
];

const activitySchema = new mongoose.Schema({
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  message: { type: String, required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  createdAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model('Activity', activitySchema);
