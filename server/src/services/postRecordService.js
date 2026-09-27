// Every publish attempt - "Post now", the scheduler, and a retry from the
// Dashboard - goes through publishPostRecord(), so each one leaves the same
// trail: the Post's status, its failure reason, and an Activity entry.
import Post from '../models/Post.js';
import ScheduledImage from '../models/ScheduledImage.js';
import { researchTimezone } from '../config/env.js';
import { publishToLinkedIn } from './publishService.js';
import { logActivity, captionSnippet } from './activityService.js';

export const POST_TYPES = ['text', 'text_image', 'text_image_prompts'];

/** "Mon 29 Sep, 11:00 am" in the app's timezone, for activity messages. */
export function formatWhen(date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: researchTimezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** Readable reason from an axios/LinkedIn error or a plain Error. */
export function failureReasonOf(err) {
  return err.response?.data?.message || err.message || 'Unknown error';
}

/** Replaces a post's stored image bytes with `images` ({ data, contentType, prompt }), in order. */
export async function storeImages(postId, images) {
  await ScheduledImage.deleteMany({ postId });
  if (images.length) {
    await ScheduledImage.insertMany(images.map((img, order) => ({ postId, order, ...img })));
  }
}

/**
 * Publishes a post whose status the caller has already claimed as
 * "publishing", using its stored images. Records the outcome on the post
 * and in the activity log. Never throws for a LinkedIn failure - the post
 * comes back with status "failed" and its reason instead.
 */
export async function publishPostRecord(post, { retry = false } = {}) {
  const stored = await ScheduledImage.find({ postId: post._id }).sort({ order: 1 });
  const snippet = captionSnippet(post.content.text);

  try {
    const { urn, url, assetUrns } = await publishToLinkedIn(
      post.content.text,
      stored.map((img) => ({ buffer: img.data, contentType: img.contentType }))
    );

    post.set({
      status: 'published',
      publishedAt: new Date(),
      failureReason: undefined,
      linkedInPostUrn: urn,
      linkedInPostUrl: url,
      images: assetUrns.map((assetUrn, i) => ({ linkedInAssetUrn: assetUrn, prompt: stored[i]?.prompt })),
    });
    await post.save();
    // LinkedIn has the images now; the bytes are no longer needed.
    await ScheduledImage.deleteMany({ postId: post._id });
    await logActivity('post_published', `${retry ? 'Retried and published' : 'Published'} "${snippet}"`, {
      postId: post._id,
    });
  } catch (err) {
    const reason = failureReasonOf(err);
    console.error(`[posts] publishing ${post._id} failed:`, reason);
    // Images are kept so the post can be fixed and retried.
    post.set({ status: 'failed', failureReason: reason, failedAt: new Date() });
    await post.save();
    await logActivity('post_failed', `Failed to publish "${snippet}": ${reason}`, { postId: post._id });
  }
  return post;
}

/**
 * Atomically moves a post from one of `fromStatuses` to "publishing", so
 * two paths (scheduler tick, Dashboard edit) can't both act on it.
 * Resolves { post, previousStatus }, or null if it was not in those states.
 */
export async function claimForPublishing(postId, fromStatuses) {
  const before = await Post.findOneAndUpdate(
    { _id: postId, status: { $in: fromStatuses } },
    { status: 'publishing' },
    { returnDocument: 'before' }
  ).catch(() => null);
  if (!before) return null;

  const previousStatus = before.status;
  before.status = 'publishing'; // mirror what the update just wrote
  return { post: before, previousStatus };
}
