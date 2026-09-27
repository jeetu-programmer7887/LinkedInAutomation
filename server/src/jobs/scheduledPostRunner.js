import Post from '../models/Post.js';
import { claimForPublishing, publishPostRecord } from '../services/postRecordService.js';

// Runs on every scheduler tick (see jobs/tick.js). A ~1 minute polling
// granularity is fine here - a LinkedIn post firing a few seconds after
// its scheduled minute is imperceptible, and this trades away a
// Redis/BullMQ dependency for "just query MongoDB", which is all this
// app's actual volume (1-2 posts/day) needs.
export async function runDueScheduledPosts() {
  const now = new Date();
  const duePosts = await Post.find({ status: 'scheduled', scheduledFor: { $lte: now } }).select('_id');

  for (const { _id } of duePosts) {
    // Atomic claim: only the tick that actually flips scheduled -> publishing
    // proceeds. Guards against double-publishing if a run overlaps the next
    // tick, a Dashboard edit, or a second instance.
    const claim = await claimForPublishing(_id, ['scheduled']);
    if (!claim) continue;

    const post = await publishPostRecord(claim.post);
    console.log(`[scheduler] scheduled post ${post._id} ${post.status}`);
  }
}
