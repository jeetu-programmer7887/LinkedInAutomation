// Caption generation via the official Gemini SDK - matches the pattern
// already proven working in another of the user's projects
// (GoogleGenerativeAI -> getGenerativeModel -> generateContent), rather
// than a hand-rolled REST call against a speculatively-picked model name.
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { gemini } from '../config/env.js';

const genAI = new GoogleGenerativeAI(gemini.apiKey);

const CAPTION_GUIDELINES = `- First person, natural and confident tone - no corporate buzzword filler, not salesy
- Short paragraphs with line breaks, the way real LinkedIn posts read
- End with 5-8 hashtags chosen specifically to maximize reach and impressions: mix a couple of broad, high-traffic industry hashtags with several more specific, niche ones directly tied to the topic - avoid generic filler tags that don't relate to the content`;

/**
 * Turns a short, informal description of what the post should be about
 * into a full, LinkedIn-ready caption with hashtags. This is the only
 * automated step in Feature 1 - image selection and the send action are
 * fully manual.
 */
export async function generateCaption(description) {
  const prompt = `Write a professional, engaging LinkedIn post caption based on this description from the author:
"${description}"

Guidelines:
${CAPTION_GUIDELINES}
- Output ONLY the caption text itself - no preamble, no markdown formatting, no surrounding quotes`;

  const model = genAI.getGenerativeModel({ model: gemini.model });
  const result = await model.generateContent(prompt);
  const caption = result.response.text()?.trim();

  if (!caption) {
    throw new Error('Gemini did not return a caption');
  }
  return caption;
}

/**
 * Writes the caption AND one image-generation prompt per requested image,
 * in a single call so the visuals are grounded in the caption that ships
 * with them. The prompts are not rendered here - the author takes them to
 * whichever image tool they prefer and uploads the results back.
 */
export async function generateCaptionWithImagePrompts(description, imageCount) {
  const prompt = `You are helping an author prepare a LinkedIn post that will be published with exactly ${imageCount} image${imageCount === 1 ? '' : 's'}.

The author's description of the post:
"${description}"

Produce two things:

1. "caption" - the LinkedIn post caption.
${CAPTION_GUIDELINES}
- Use real newline characters inside the string: a blank line between paragraphs, and the hashtags alone on the final line. Do NOT run paragraphs together into one block of text.
- Plain text only, no markdown formatting and no surrounding quotes

2. "imagePrompts" - exactly ${imageCount} text-to-image prompt${imageCount === 1 ? '' : 's'}, in the order the images will appear in the post. These get pasted into a separate image generation tool (Midjourney, DALL-E, Gemini, etc.), so each one must stand completely on its own.
- Each prompt describes ONE distinct visual that supports a specific point in the caption - together they should tell the post's story in sequence, never restating the same idea
- Be concrete and visual: name the subject, composition, setting, color palette, and art style (for example "clean vector illustration, muted earth tones, generous white space")
- Specify a 1200x627 landscape framing suitable for a LinkedIn feed image
- Avoid any text, lettering, words, logos, or numbers inside the image - AI image tools render these badly
- No references to "the caption" or "the post" - the image tool has no idea those exist`;

  const model = genAI.getGenerativeModel({
    model: gemini.model,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          caption: { type: SchemaType.STRING },
          imagePrompts: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['caption', 'imagePrompts'],
      },
    },
  });

  const result = await model.generateContent(prompt);
  const { caption, imagePrompts } = JSON.parse(result.response.text());

  if (!caption || !imagePrompts?.length) {
    throw new Error('Gemini did not return a caption and image prompts');
  }

  // The schema guarantees the shape but not the count, and a short prompt
  // list would silently drop upload slots in the UI. Pad by reusing the
  // last prompt rather than failing the whole request.
  const prompts = imagePrompts.slice(0, imageCount);
  while (prompts.length < imageCount) {
    prompts.push(imagePrompts[imagePrompts.length - 1]);
  }

  return { caption: caption.trim(), imagePrompts: prompts.map((p) => p.trim()) };
}
