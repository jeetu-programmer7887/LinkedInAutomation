import Post from '../models/Post.js';

/**
 * Fills the Dashboard fields on posts created before they existed. Runs at
 * startup; idempotent, and a no-op once every post has a postType.
 * - postType from the images: none -> text, prompted -> text + image
 *   prompts, otherwise text + image
 * - source "manual" (ideas did not exist yet)
 * - publishMode from whether it was ever scheduled
 */
export async function backfillPosts() {
  const missing = { postType: { $exists: false } };
  const results = await Promise.all([
    Post.updateMany({ ...missing, 'images.0': { $exists: false } }, { postType: 'text' }),
    Post.updateMany(
      { ...missing, images: { $elemMatch: { prompt: { $exists: true, $nin: [null, ''] } } } },
      { postType: 'text_image_prompts' }
    ),
  ]);
  // Whatever is still untyped has images without prompts.
  results.push(await Post.updateMany(missing, { postType: 'text_image' }));
  results.push(await Post.updateMany({ source: { $exists: false } }, { source: 'manual' }));
  results.push(
    await Post.updateMany({ publishMode: { $exists: false }, scheduledFor: { $exists: true } }, { publishMode: 'scheduled' })
  );
  results.push(await Post.updateMany({ publishMode: { $exists: false } }, { publishMode: 'now' }));

  const updated = results.reduce((sum, r) => sum + (r.modifiedCount || 0), 0);
  if (updated) {
    console.log(`[backfill] filled dashboard fields on ${updated} post field(s)`);
  }
}
