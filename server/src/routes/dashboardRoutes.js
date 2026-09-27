import express from 'express';
import Post from '../models/Post.js';
import Activity from '../models/Activity.js';

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_ACTIVITY = 30;

// { key: count } from a $group on `field`, with missing values under "unknown".
async function countBy(field) {
  const rows = await Post.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id ?? 'unknown', r.count]));
}

// Summary of everything the app has recorded. A "post" is one created
// through the app (published, scheduled, failed, or cancelled) - caption
// and idea generations are never counted.
router.get('/', async (req, res) => {
  const now = Date.now();
  const [total, byStatus, byType, bySource, last7Days, last30Days, activity] = await Promise.all([
    Post.countDocuments(),
    countBy('status'),
    countBy('postType'),
    countBy('source'),
    Post.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY_MS) } }),
    Post.countDocuments({ createdAt: { $gte: new Date(now - 30 * DAY_MS) } }),
    Activity.find().sort({ createdAt: -1 }).limit(RECENT_ACTIVITY),
  ]);

  res.json({ total, byStatus, byType, bySource, last7Days, last30Days, activity });
});

export default router;
