import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    title: { type: String },
    url: { type: String },
    source: { type: String },
    // Kept so Compose can ground the final post in the same research
    // without searching again.
    content: { type: String },
  },
  { _id: false }
);

const ideaSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['trending', 'evergreen'], required: true },
    topic: { type: String, required: true },
    whyTrending: { type: String },
    angle: { type: String },
    keyPoints: { type: [String], default: [] },
    suggestedFormat: { type: String, enum: ['text', 'text_image', 'text_image_prompts'], default: 'text' },
    sources: { type: [sourceSchema], default: [] },
  },
  { _id: false }
);

// One research run: the daily scheduled one, or a "Get fresh ideas" click.
const ideaBatchSchema = new mongoose.Schema(
  {
    trigger: { type: String, enum: ['scheduled', 'manual'], required: true },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running', index: true },
    failureReason: { type: String },
    articleCount: { type: Number, default: 0 },
    // The evergreen topic searched this run, so the next runs pick another.
    evergreenQuery: { type: String },
    ideas: { type: [ideaSchema], default: [] },
    // Old batches expire on their own after 30 days.
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export default mongoose.model('IdeaBatch', ideaBatchSchema);
