import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema(
  {
    url: { type: String },
    prompt: { type: String },
    role: { type: String }, // e.g. "cover", "sql", "nosql"
    linkedInAssetUrn: { type: String },
  },
  { _id: false }
);

const analyticsSchema = new mongoose.Schema(
  {
    impressions: { type: Number, default: 0 },
    reactions: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    reshares: { type: Number, default: 0 },
    lastSyncedAt: { type: Date },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    // Optional: this is currently a single-user app with no login, so
    // posts aren't scoped to a session. Kept on the schema (unused for
    // now) for whenever multi-user auth is revisited.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    prompt: { type: String, required: true },
    category: { type: String },

    status: {
      type: String,
      // "publishing" is a short-lived claim state: the cron scheduler
      // (jobs/scheduler.js) flips a due "scheduled" post to "publishing"
      // atomically before actually calling the LinkedIn API, so a second
      // tick (or a future second instance) can't double-publish it.
      // "cancelled" posts are kept (not deleted) so the Dashboard's record
      // of everything created stays complete.
      enum: ['draft', 'generating', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'],
      default: 'draft',
      index: true,
    },

    // What the author chose in Compose. Backfilled for older posts from
    // their images (jobs/backfillPosts.js).
    postType: { type: String, enum: ['text', 'text_image', 'text_image_prompts'], index: true },
    // "idea" when written from a trending-idea card on the Schedule page.
    source: { type: String, enum: ['manual', 'idea'], default: 'manual' },
    ideaTopic: { type: String },
    // How the author asked for it to go out; status says what happened.
    publishMode: { type: String, enum: ['now', 'scheduled'] },
    failedAt: { type: Date },
    cancelledAt: { type: Date },
    // Fine-grained step within status "generating" - the Compose screen
    // polls GET /api/posts/:id every couple seconds and shows this
    // (researching -> writing -> generating_images -> publishing -> done)
    // since we're not using a push transport like Socket.io.
    progressStep: { type: String },
    failureReason: { type: String },

    content: {
      text: { type: String },
      hashtags: { type: [String], default: [] },
    },
    images: { type: [imageSchema], default: [] },

    linkedInPostUrn: { type: String },
    linkedInPostUrl: { type: String },

    scheduledFor: { type: Date },
    publishedAt: { type: Date },

    analytics: { type: analyticsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model('Post', postSchema);
