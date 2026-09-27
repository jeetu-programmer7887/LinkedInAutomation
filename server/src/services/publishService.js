// The one path that actually puts a post on LinkedIn, shared by "Post now"
// (routes/postRoutes.js) and the scheduler (jobs/scheduledPostRunner.js).
import { linkedin } from '../config/env.js';
import { createPost, uploadImage } from './linkedinService.js';

export function hasLinkedInCredentials() {
  return Boolean(linkedin.accessToken && linkedin.personUrn);
}

/** images: [{ buffer, contentType }] in display order. */
export async function publishToLinkedIn(text, images = []) {
  if (!hasLinkedInCredentials()) {
    throw new Error('Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN in .env first');
  }
  const { accessToken, personUrn } = linkedin;

  const assetUrns = [];
  for (const image of images) {
    assetUrns.push(await uploadImage(accessToken, personUrn, image.buffer, image.contentType));
  }

  const { urn, url } = await createPost(accessToken, personUrn, {
    text,
    images: assetUrns.map((assetUrn) => ({ urn: assetUrn })),
  });
  return { urn, url, assetUrns };
}
