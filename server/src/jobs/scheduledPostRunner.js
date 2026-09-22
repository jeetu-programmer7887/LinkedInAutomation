import Post from '../models/Post.js';

// Runs on every scheduler tick (see jobs/scheduler.js). A ~1 minute
// polling granularity is fine here - a LinkedIn post firing a few seconds
// after its scheduled minute is imperceptible, and this trades away a
// Redis/BullMQ dependency for "just query MongoDB", which is all this
// app's actual volume (1-2 posts/day) needs.
export async function runDueScheduledPosts() {
  const now = new Date();
  const duePosts = await Post.find({ status: 'scheduled', scheduledFor: { $lte: now } }).select('_id');

  for (const { _id } of duePosts) {
    // Atomic claim: only the tick that actually flips scheduled -> publishing
    // proceeds. Guards against double-publishing if a run overlaps the next
    // tick, or (later) if this ever runs as more than one instance.
    const claimed = await Post.findOneAndUpdate({ _id, status: 'scheduled' }, { status: 'publishing' }, { new: true });
    if (!claimed) continue;

    try {
      // TODO (Feature 2 build-out): call linkedinService.createPost with
      // the content/images that were pre-generated at schedule time, then
      // set status: 'published', publishedAt, linkedInPostUrn/Url.
      console.log(`[scheduler] post ${claimed._id} is due - publish pipeline not wired up yet`);
    } catch (err) {
      await Post.findByIdAndUpdate(claimed._id, { status: 'failed', failureReason: err.message });
    }
  }
}
