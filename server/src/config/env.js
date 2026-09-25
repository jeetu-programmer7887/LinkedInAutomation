import 'dotenv/config';

export const port = process.env.PORT || 3000;
export const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
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

export const groq = {
  apiKey: process.env.GROQ_API_KEY,
  // Groq retires models on short notice, so keep this overridable from
  // .env rather than hardcoded - a retired id fails with a 404/
  // "decommissioned" error. Current ids: https://console.groq.com/docs/models
  model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
};
export const tavily = {
  apiKey: process.env.TAVILY_API_KEY,
};

export const pixazo = {
  apiKey: process.env.PIXAZO_API_KEY,
};
