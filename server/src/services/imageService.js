// AI image generation via Pollinations.ai - free, no API key, backed by
// the open-weight FLUX model (per github.com/pollinations/pollinations
// APIDOCS.md). Unlike Gemini/LinkedIn, this returns raw image bytes
// directly from a GET request, not a JSON envelope.
import axios from 'axios';

const BASE_URL = 'https://image.pollinations.ai/prompt';

export async function generateImage(prompt, { width = 1024, height = 1024 } = {}) {
  const url = `${BASE_URL}/${encodeURIComponent(prompt)}`;

  const response = await axios.get(url, {
    params: { width, height, nologo: true, model: 'flux' },
    responseType: 'arraybuffer',
    timeout: 60_000, // image generation can take a while
  });

  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers['content-type'] || 'image/jpeg',
  };
}
