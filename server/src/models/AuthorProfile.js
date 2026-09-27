import mongoose from 'mongoose';

// Single document: who the app writes for. Seeded from
// config/defaultProfile.js on first read (services/profileService.js).
const authorProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    headline: { type: String },
    location: { type: String },
    about: { type: String },
    audience: { type: String },
    goal: { type: String },
    opinions: { type: [String], default: [] },
    // The only personal experiences the AI may claim.
    facts: { type: [String], default: [] },
    trendingTopics: { type: [String], default: [] },
    evergreenTopics: { type: [String], default: [] },
    stylePosts: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('AuthorProfile', authorProfileSchema);
