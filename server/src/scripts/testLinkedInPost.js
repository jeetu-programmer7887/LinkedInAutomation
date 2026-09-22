// Manual, one-off verification script - NOT wired into the app itself.
// Publishes a single real, visible post to the LinkedIn account behind
// LINKEDIN_ACCESS_TOKEN, using the /v2/ugcPosts + /v2/assets integration.
// Run deliberately, e.g.:
//   node src/scripts/testLinkedInPost.js
import { linkedin } from '../config/env.js';
import { createPost } from '../services/linkedinService.js';

async function main() {
  const { accessToken, personUrn: authorUrn } = linkedin;
  if (!accessToken || !authorUrn) {
    throw new Error('Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN in .env first.');
  }

  const result = await createPost(accessToken, authorUrn, {
    text: 'Test post from the LinkedIn Automation app - verifying the /v2/ugcPosts integration. (Safe to delete.)',
    images: [],
  });

  console.log('Published:', result);
}

main().catch((err) => {
  console.error('Test post failed:', err.response?.data || err.message);
  process.exit(1);
});
