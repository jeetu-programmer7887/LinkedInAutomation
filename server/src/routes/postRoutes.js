import express from 'express';
import multer from 'multer';
import Post from '../models/Post.js';
import { linkedin } from '../config/env.js';
import { createPost, uploadImage } from '../services/linkedinService.js';
import { generateCaption, generateCaptionWithImagePrompts } from '../services/aiService.js';
import { generateImage } from '../services/imageService.js';

const MAX_IMAGES = 5;
// Static images only - no GIFs (LinkedIn silently flattens them to a
// single still frame anyway) and no video.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

// Full generate/schedule/publish pipeline lands in the Feature 1/2/3 build-out.
// For now this just lists whatever exists, so the Dashboard/Schedule screens
// have a real endpoint to call against from day one.
router.get('/', async (req, res) => {
  const posts = await Post.find().sort({ createdAt: -1 });
  res.json(posts);
});

// Feature 1, step 1: expand a short description into a full caption. The
// only automated part of this feature - image selection and sending are
// both fully manual.
router.post('/generate-caption', async (req, res) => {
  const { description } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }
  const caption = await generateCaption(description);
  res.json({ caption });
});

// Same as /generate-caption, but also returns one image-generation prompt
// per image the author asked for. They generate those images in their own
// AI tool and upload the results back through POST / below.
router.post('/generate-caption-and-prompts', async (req, res) => {
  const { description, imageCount } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const count = Number(imageCount);
  if (!Number.isInteger(count) || count < 1 || count > MAX_IMAGES) {
    return res.status(400).json({ error: `imageCount must be a whole number between 1 and ${MAX_IMAGES}` });
  }

  const result = await generateCaptionWithImagePrompts(description, count);
  res.json(result);
});

// Feature 1 add-on: generate an image from a text prompt. Returns the raw
// image bytes directly (not JSON/base64) so Postman previews it inline,
// and so the frontend can later fetch it as a Blob and drop it straight
// into the same images[] list the manual-upload flow already uses.
router.post('/generate-image', async (req, res) => {
  const { prompt, width, height } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const { buffer, contentType } = await generateImage(prompt, { width, height });
  res.set('Content-Type', contentType);
  res.send(buffer);
});

// Feature 1, step 2: publish the (possibly hand-edited) caption, with 0-5
// manually chosen images, to LinkedIn.
router.post('/', uploadImages, async (req, res) => {
  const { description, caption } = req.body;
  if (!caption) {
    return res.status(400).json({ error: 'caption is required' });
  }
  if (!requireLinkedInCredentials(res)) return;

  const { accessToken, personUrn } = linkedin;

  // Sent by the "Text + Image Prompts" flow, positionally matched to the
  // uploaded files. Multer collapses a single repeated field to a string.
  const imagePrompts = [req.body.imagePrompts ?? []].flat();

  const uploadedImages = [];
  for (const file of req.files || []) {
    const assetUrn = await uploadImage(accessToken, personUrn, file.buffer, file.mimetype);
    uploadedImages.push(assetUrn);
  }

  const { urn, url } = await createPost(accessToken, personUrn, {
    text: caption,
    images: uploadedImages.map((assetUrn) => ({ urn: assetUrn })),
  });

  const post = await Post.create({
    prompt: description || caption,
    status: 'published',
    content: { text: caption, hashtags: [] },
    images: uploadedImages.map((assetUrn, i) => ({ linkedInAssetUrn: assetUrn, prompt: imagePrompts[i] })),
    linkedInPostUrn: urn,
    linkedInPostUrl: url,
    publishedAt: new Date(),
  });

  res.status(201).json(post);
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
