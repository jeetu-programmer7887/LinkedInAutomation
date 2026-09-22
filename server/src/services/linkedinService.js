// LinkedIn integration, built against the official self-serve "Consumer
// Solutions Platform" docs the user tested directly in Postman:
//   - Share on LinkedIn: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
//   - Sign In with LinkedIn (OIDC): https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
// This is a DIFFERENT, self-serve product family from LinkedIn's
// Community Management / Marketing Developer Platform (the /rest/ API,
// which requires partner approval). w_member_social under "Share on
// LinkedIn" needs no review, so posting/image-upload below intentionally
// use the classic /v2/ugcPosts + /v2/assets endpoints, not /rest/posts.
import axios from 'axios';
import { linkedin } from '../config/env.js';

const AUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const API_BASE = 'https://api.linkedin.com';

// /v2/ugcPosts and /v2/assets only require this header (no Linkedin-Version -
// that header belongs to the separate /rest/ API family used below only
// for analytics).
function v2Headers(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  };
}

const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

/** Step 1 of the OAuth flow: where to send the browser to log in / consent. */
export function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: linkedin.clientId,
    redirect_uri: linkedin.redirectUri,
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTH_BASE}/authorization?${params.toString()}`;
}

/** Step 2: exchange the ?code= LinkedIn redirected back with for tokens. */
export async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: linkedin.redirectUri,
    client_id: linkedin.clientId,
    client_secret: linkedin.clientSecret,
  });
  const { data } = await axios.post(`${AUTH_BASE}/accessToken`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  // { access_token, expires_in, refresh_token, refresh_token_expires_in, scope }
  return data;
}

export async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: linkedin.clientId,
    client_secret: linkedin.clientSecret,
  });
  const { data } = await axios.post(`${AUTH_BASE}/accessToken`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

/** OIDC userinfo endpoint - returns { sub, name, email, picture, ... }. */
export async function getUserInfo(accessToken) {
  const { data } = await axios.get(`${API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // `sub` is the member ID used to build the Person URN: urn:li:person:{sub}
  return data;
}

/**
 * Registers an image upload, PUTs the binary, and returns the digital
 * media asset URN to reference from ugcPosts. imageBuffer comes from
 * whatever generated the image (Pollinations/Hugging Face response).
 */
export async function uploadImage(accessToken, authorUrn, imageBuffer, contentType = 'application/octet-stream') {
  const registerRes = await axios.post(
    `${API_BASE}/v2/assets?action=registerUpload`,
    {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: authorUrn,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    },
    { headers: v2Headers(accessToken) }
  );

  const { uploadMechanism, asset } = registerRes.data.value;
  const uploadUrl = uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;

  // The docs' curl example only shows the bearer token because curl
  // sends raw --upload-file bytes with no Content-Type of its own. Axios
  // isn't that neutral: for a PUT with no Content-Type set, it silently
  // defaults to 'application/x-www-form-urlencoded', which corrupts the
  // binary upload and LinkedIn rejects it with a 400. Set the real image
  // content type explicitly to override that default.
  await axios.put(uploadUrl, imageBuffer, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType },
  });

  return asset; // urn:li:digitalmediaAsset:...
}

/**
 * Creates and publishes a post via the classic UGC Posts API.
 * `images` is an array of { urn, title, altText } already uploaded via
 * uploadImage(). The docs only show a single-image example, but `media`
 * is documented as an array (ShareMedia[]), so multiple entries here is
 * how a multi-image post (our cover + SQL + NoSQL case) is expected to
 * work - verify with a real test post before relying on it.
 */
export async function createPost(accessToken, authorUrn, { text, images = [] }) {
  const specificContent = {
    shareCommentary: { text },
    shareMediaCategory: images.length ? 'IMAGE' : 'NONE',
  };

  if (images.length) {
    specificContent.media = images.map((img) => ({
      status: 'READY',
      media: img.urn,
      title: { text: img.title || '' },
      description: { text: img.altText || '' },
    }));
  }

  const payload = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: { 'com.linkedin.ugc.ShareContent': specificContent },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await axios.post(`${API_BASE}/v2/ugcPosts`, payload, { headers: v2Headers(accessToken) });
  const postUrn = res.headers['x-restli-id'];
  return {
    urn: postUrn,
    url: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : null,
  };
}

/**
 * Post-level analytics. This is a DIFFERENT LinkedIn product family
 * (Community Management / Marketing Developer Platform's versioned
 * /rest/ API) from the self-serve Share on LinkedIn product used above
 * for posting - it needs the Linkedin-Version header and, per LinkedIn,
 * sits behind Developer Partner Program approval that isn't guaranteed
 * for a self-serve app. Callers should catch failures here and fall back
 * to a "pending LinkedIn approval" UI state rather than treating this as
 * a bug in this code.
 */
export async function getPostAnalytics(accessToken, postUrn) {
  const params = new URLSearchParams({ q: 'member', post: postUrn });
  const { data } = await axios.get(`${API_BASE}/rest/memberCreatorPostAnalytics?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Linkedin-Version': linkedin.apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  return data;
}
