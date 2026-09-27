import express from 'express';
import multer from 'multer';
import Post from '../models/Post.js';
import ScheduledImage from '../models/ScheduledImage.js';
import { linkedin } from '../config/env.js';
import { createPost, uploadImage } from '../services/linkedinService.js';
import { generateCaption, generateCaptionWithImagePrompts } from '../services/aiService.js';
import { findIdea, researchContextFor } from '../services/ideaService.js';
import {
  POST_TYPES,
  claimForPublishing,
  formatWhen,
  publishPostRecord,
  storeImages,
} from '../services/postRecordService.js';
import { logActivity, captionSnippet } from '../services/activityService.js';

const MAX_IMAGES = 5;
// Static images only - no GIFs (LinkedIn silently flattens them to a
// single still frame anyway) and no video.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// A scheduled time must leave the scheduler at least one tick to pick it up.
const MIN_SCHEDULE_LEAD_MS = 60_000;

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_IMAGES, fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed - no GIFs or video.'));
    }
    cb(null, true);
  },
});

// Wraps multer so a rejected file (wrong type, too many, too large) comes
// back as a normal 400 JSON error instead of an uncaught exception.
function uploadImages(req, res, next) {
  upload.array('images', MAX_IMAGES)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

// Single-user app - every route here posts as the one LinkedIn account
// configured via LINKEDIN_ACCESS_TOKEN/LINKEDIN_PERSON_URN in .env. No
// login, no per-visitor session.
function requireLinkedInCredentials(res) {
  if (!linkedin.accessToken || !linkedin.personUrn) {
    res.status(400).json({ error: 'Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN in .env first' });
    return false;
  }
  return true;
}

// Optional ?status= and ?type= filters. The Schedule page asks for
// status=scheduled, which comes back soonest-first; everything else is
// newest-first.
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.type) filter.postType = String(req.query.type);
  const sort = filter.status === 'scheduled' ? { scheduledFor: 1 } : { createdAt: -1 };
  res.json(await Post.find(filter).sort(sort));
});

// When Compose writes from a trending idea it sends { batchId, index };
// the stored research then grounds the caption. Resolves to '' without an
// idea, or null when it no longer exists (batches expire after 30 days).
async function ideaContext(ideaRef) {
  if (!ideaRef?.batchId) return '';
  const idea = await findIdea(ideaRef.batchId, ideaRef.index);
  return idea ? researchContextFor(idea) : null;
}

const IDEA_GONE = 'That idea no longer exists - pick a current one from the Schedule page.';

// Feature 1, step 1: expand a short description into a full caption. The
// only automated part of this feature - image selection and sending are
// both fully manual.
router.post('/generate-caption', async (req, res) => {
  const { description, idea } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }
  const context = await ideaContext(idea);
  if (context === null) {
    return res.status(404).json({ error: IDEA_GONE });
  }
  const caption = await generateCaption(description, context);
  res.json({ caption });
});

// Same as /generate-caption, but also returns one image-generation prompt
// per image the author asked for. They generate those images in their own
// AI tool and upload the results back through POST / below.
router.post('/generate-caption-and-prompts', async (req, res) => {
  const { description, imageCount, idea } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const count = Number(imageCount);
  if (!Number.isInteger(count) || count < 1 || count > MAX_IMAGES) {
    return res.status(400).json({ error: `imageCount must be a whole number between 1 and ${MAX_IMAGES}` });
  }

  const context = await ideaContext(idea);
  if (context === null) {
    return res.status(404).json({ error: IDEA_GONE });
  }
  const result = await generateCaptionWithImagePrompts(description, count, context);
  res.json(result);
});

// Returns a Date at least one scheduler tick away, or an error message.
function parseScheduleTime(value) {
  const when = new Date(value);
  if (!value || Number.isNaN(when.getTime())) return { error: 'scheduledFor must be a valid date and time' };
  if (when.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) return { error: 'Pick a time at least a minute from now.' };
  return { when };
}

// Posts from before postType was recorded (or a client that omits it).
function inferPostType(imageCount, imagePrompts) {
  if (!imageCount) return 'text';
  return imagePrompts.some(Boolean) ? 'text_image_prompts' : 'text_image';
}

// Publish the (possibly hand-edited) caption, with 0-5 manually chosen
// images, to LinkedIn - now, or at `scheduledFor` (an ISO timestamp) via
// the scheduler. Either way the post is recorded first, with its images,
// so a failed "Post now" is kept (status "failed") and can be fixed and
// retried from the Dashboard instead of being lost.
router.post('/', uploadImages, async (req, res) => {
  const { description, caption, scheduledFor, ideaBatchId, ideaIndex } = req.body;
  if (!caption) {
    return res.status(400).json({ error: 'caption is required' });
  }
  if (!requireLinkedInCredentials(res)) return;

  // Sent by the "Text + Image Prompts" flow, positionally matched to the
  // uploaded files. Multer collapses a single repeated field to a string.
  const imagePrompts = [req.body.imagePrompts ?? []].flat();
  const files = req.files || [];

  let when = null;
  if (scheduledFor) {
    const parsed = parseScheduleTime(scheduledFor);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    when = parsed.when;
  }

  const idea = ideaBatchId ? await findIdea(ideaBatchId, ideaIndex) : null;
  const post = await Post.create({
    prompt: description || caption,
    status: when ? 'scheduled' : 'publishing',
    postType: POST_TYPES.includes(req.body.postType) ? req.body.postType : inferPostType(files.length, imagePrompts),
    source: idea ? 'idea' : 'manual',
    ideaTopic: idea?.topic,
    publishMode: when ? 'scheduled' : 'now',
    content: { text: caption, hashtags: [] },
    images: files.map((_, i) => ({ prompt: imagePrompts[i] })),
    scheduledFor: when ?? undefined,
  });
  await storeImages(
    post._id,
    files.map((file, i) => ({ data: file.buffer, contentType: file.mimetype, prompt: imagePrompts[i] }))
  );

  if (when) {
    await logActivity('post_scheduled', `Scheduled "${captionSnippet(caption)}" for ${formatWhen(when)}`, {
      postId: post._id,
    });
    return res.status(201).json(post);
  }

  const result = await publishPostRecord(post);
  if (result.status === 'failed') {
    return res.status(502).json({
      error: `${result.failureReason} - saved as failed; fix and retry it from the Dashboard.`,
      postId: result._id,
    });
  }
  res.status(201).json(result);
});

// Stored bytes of an unpublished post's image, for the Dashboard editor.
// Helmet defaults Cross-Origin-Resource-Policy to same-origin, which would
// stop the Angular app (a different origin) from showing it in an <img>.
router.get('/:id/images/:order', async (req, res) => {
  const image = await ScheduledImage.findOne({ postId: req.params.id, order: Number(req.params.order) }).catch(
    () => null
  );
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }
  res.set({
    'Content-Type': image.contentType,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-store',
  });
  res.send(image.data);
});

// Fix a failed post, or edit a scheduled one, then reschedule it or post
// it now. Multipart body:
//   caption      - the (edited) text
//   layout       - JSON array giving the final images in order: "e<n>"
//                  keeps stored image n, "u<n>" is the n-th uploaded file
//                  (so an image is replaced in place, removed, or added)
//   images       - the newly uploaded files
//   scheduledFor - ISO time to reschedule for, or
//   publishNow   - "true" to publish immediately
router.put('/:id', uploadImages, async (req, res) => {
  const { caption, scheduledFor, publishNow } = req.body;
  if (!caption?.trim()) {
    return res.status(400).json({ error: 'caption is required' });
  }

  let layout;
  try {
    layout = JSON.parse(req.body.layout || '[]');
  } catch {
    return res.status(400).json({ error: 'layout must be a JSON array' });
  }
  if (!Array.isArray(layout) || layout.length > MAX_IMAGES) {
    return res.status(400).json({ error: `A post can have at most ${MAX_IMAGES} images.` });
  }

  const now = publishNow === 'true';
  let when = null;
  if (!now) {
    const parsed = parseScheduleTime(scheduledFor);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    when = parsed.when;
  }
  if (now && !requireLinkedInCredentials(res)) return;

  // Claim before touching anything, so the scheduler can't publish the old
  // version while it is being edited.
  const claim = await claimForPublishing(req.params.id, ['scheduled', 'failed']);
  if (!claim) {
    return res.status(409).json({ error: 'Only scheduled or failed posts can be edited - this one may be publishing right now.' });
  }
  const { post, previousStatus } = claim;

  const stored = await ScheduledImage.find({ postId: post._id }).sort({ order: 1 });
  const files = req.files || [];
  const images = [];
  for (const slot of layout) {
    const match = /^([eu])(\d+)$/.exec(String(slot));
    const kept = match?.[1] === 'e' && stored.find((s) => s.order === Number(match[2]));
    const uploaded = match?.[1] === 'u' && files[Number(match[2])];
    if (!kept && !uploaded) {
      await Post.updateOne({ _id: post._id }, { status: previousStatus });
      return res.status(400).json({ error: `Unknown image in layout: ${slot}` });
    }
    images.push(
      kept
        ? { data: kept.data, contentType: kept.contentType, prompt: kept.prompt }
        : { data: uploaded.buffer, contentType: uploaded.mimetype }
    );
  }

  await storeImages(post._id, images);
  post.set({
    'content.text': caption,
    images: images.map((img) => ({ prompt: img.prompt })),
    // Removing every image makes it a text post; adding one to a text post
    // makes it text + image. Otherwise the author's original choice stands.
    postType: !images.length ? 'text' : post.postType === 'text' || !post.postType ? 'text_image' : post.postType,
    failureReason: undefined,
  });

  if (now) {
    post.publishMode = 'now';
    await post.save();
    const result = await publishPostRecord(post, { retry: previousStatus === 'failed' });
    if (result.status === 'failed') {
      return res.status(502).json({ error: result.failureReason, postId: result._id });
    }
    return res.json(result);
  }

  post.set({ status: 'scheduled', scheduledFor: when, publishMode: 'scheduled' });
  await post.save();
  await logActivity(
    'post_rescheduled',
    `${previousStatus === 'failed' ? 'Fixed and rescheduled' : 'Edited'} "${captionSnippet(caption)}" for ${formatWhen(when)}`,
    { postId: post._id }
  );
  res.json(post);
});

// Cancel a scheduled post before it goes out. Only "scheduled" posts can
// be cancelled - one the scheduler has already claimed is on its way. The
// record is kept (status "cancelled"); only the stored images go.
router.delete('/:id', async (req, res) => {
  const post = await Post.findOneAndUpdate(
    { _id: req.params.id, status: 'scheduled' },
    { status: 'cancelled', cancelledAt: new Date() },
    { returnDocument: 'after' }
  ).catch(() => null);
  if (!post) {
    return res.status(404).json({ error: 'No scheduled post with that id - it may already be publishing.' });
  }
  await ScheduledImage.deleteMany({ postId: post._id });
  await logActivity(
    'post_cancelled',
    `Cancelled "${captionSnippet(post.content.text)}" (was scheduled for ${formatWhen(post.scheduledFor)})`,
    { postId: post._id }
  );
  res.json(post);
});

// TEMPORARY dev-only routes for quick Postman-level checks against the raw
// LinkedIn integration, bypassing the caption-generation step entirely.
router.post('/test-text', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (!requireLinkedInCredentials(res)) return;

  const result = await createPost(linkedin.accessToken, linkedin.personUrn, { text, images: [] });
  res.status(201).json(result);
});

// Same purpose as /test-text but exercises the full 3-step image flow from
// the Share on LinkedIn docs. In Postman: Body -> binary -> pick an image
// file, and pass the caption text as a query param, e.g.
// POST /api/posts/test-image?text=hello
router.post('/test-image', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  const { text } = req.query;
  if (!text) {
    return res.status(400).json({ error: 'Pass the post text as a ?text= query param' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Send the image as a raw binary request body' });
  }
  if (!requireLinkedInCredentials(res)) return;

  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const assetUrn = await uploadImage(linkedin.accessToken, linkedin.personUrn, req.body, contentType);
  const result = await createPost(linkedin.accessToken, linkedin.personUrn, {
    text,
    images: [{ urn: assetUrn, title: 'Test image', altText: 'Test image' }],
  });
  res.status(201).json({ assetUrn, ...result });
});

export default router;
