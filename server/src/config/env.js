import 'dotenv/config';

export const port = process.env.PORT || 3000;
// Frontend origins allowed by CORS. CLIENT_URL (e.g. https://lin-automation.vercel.app)
// may list several, comma-separated. Trailing slashes are stripped: CORS
// compares origins exactly, and redirects append paths.
// For local development: CLIENT_URL=http://localhost:4200
export const allowedClientUrls = (process.env.CLIENT_URL || 'http://localhost:4200')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Where OAuth redirects send the browser back: the first CLIENT_URL.
export const clientUrl = allowedClientUrls[0];

// Deployed over https, client and server sit on different sites (separate
// *.vercel.app subdomains count as different sites), so the session cookie
// must be SameSite=None; Secure for the browser to send it with API calls.
export const crossSiteCookies = clientUrl.startsWith('https://');
export const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/linkedin-automation';

export const jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me';
export const tokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY || 'dev-only-32-char-change-me!!';

export const linkedin = {
  clientId: process.env.LINKEDIN_CLIENT_ID,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/auth/linkedin/callback',
  // Only used for the analytics call (the one endpoint on the separate,
  // versioned /rest/ API). LinkedIn versions that API monthly (YYYYMM);
  // pin a known-good version here rather than always using "this month",
  // since a brand new month's version can roll out with breaking changes
  // before client libraries/docs catch up. Bump this deliberately.
  apiVersion: process.env.LINKEDIN_API_VERSION || '202601',

  // This is a single-user personal tool for one specific LinkedIn account,
  // not multi-tenant SaaS - there's no per-visitor OAuth login. The access
  // token + Person URN below (obtained once, e.g. via Postman) are the
  // credentials the whole app posts as. The full OAuth routes still exist
  // in authRoutes.js for whenever real multi-user auth is revisited, but
  // nothing in the actual posting flow depends on it right now.
  accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
  personUrn: process.env.LINKEDIN_PERSON_URN,
};

// Every key-backed service takes a primary and an optional backup key.
// Order matters: the key pool (utils/keyPool.js) always tries the first
// one and only falls through to the next when a key is exhausted or down.
const keyList = (...names) => names.map((name) => process.env[name]).filter(Boolean);

export const groq = {
  apiKeys: keyList('GROQ_API_KEY', 'GROQ_API_KEY2'),
  // Groq retires models on short notice, so keep this overridable from
  // .env rather than hardcoded - a retired id fails with a 404/
  // "decommissioned" error. Current ids: https://console.groq.com/docs/models
  model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
};

export const tavily = {
  apiKeys: keyList('TAVILY_API_KEY', 'TAVILY_API_KEY2'),
};

// The daily research time is set from the Schedule page and stored in
// MongoDB; only the timezone it is interpreted in lives here.
export const researchTimezone = process.env.RESEARCH_TIMEZONE || 'Asia/Kolkata';

// Shared secret for POST/GET /api/cron/tick - the hook an external pinger
// (or Vercel Cron) calls once the backend no longer runs node-cron itself.
// Left unset, that endpoint is disabled.
export const cronSecret = process.env.CRON_SECRET;

export const pixazo = {
  apiKey: process.env.PIXAZO_API_KEY,
};
