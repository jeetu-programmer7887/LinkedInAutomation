import Activity from '../models/Activity.js';

/**
 * Records one activity. Never throws: a failed log write must not fail
 * the publish/schedule it describes.
 */
export async function logActivity(type, message, { postId } = {}) {
  try {
    await Activity.create({ type, message, postId });
  } catch (err) {
    console.error(`[activity] could not log ${type}:`, err.message);
  }
}

/** First ~60 characters of a caption, for activity messages. */
export function captionSnippet(text = '') {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}
