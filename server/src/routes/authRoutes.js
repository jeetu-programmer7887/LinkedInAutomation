import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import * as linkedinService from '../services/linkedinService.js';
import User from '../models/User.js';
import { encrypt } from '../utils/crypto.js';
import { jwtSecret, clientUrl, crossSiteCookies, appLogin } from '../config/env.js';
import { requireAuth, requireLogin, readLogin, LOGIN_COOKIE, LOGIN_SCOPE } from '../middleware/auth.js';

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const LOGIN_DAYS = 7;

// Same attributes on set and clear - a browser only drops a cookie when
// they match. Cross-site deploys need SameSite=None; Secure (see env.js).
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: crossSiteCookies ? 'none' : 'lax',
    secure: crossSiteCookies,
    path: '/',
  };
}

// Compares via SHA-256 digests so timingSafeEqual always gets equal-length
// buffers and the check takes the same time however much of it matches.
function safeEqual(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

// Brute-force brake: 10 failed attempts per IP per 15 minutes. In-memory,
// so it is per process (per instance on Vercel) - a brake, not a wall.
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const failedLogins = new Map();

function tooManyFails(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.since > FAIL_WINDOW_MS) {
    failedLogins.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function recordFail(ip) {
  const entry = failedLogins.get(ip);
  if (entry && Date.now() - entry.since <= FAIL_WINDOW_MS) {
    entry.count += 1;
  } else {
    failedLogins.set(ip, { count: 1, since: Date.now() });
  }
}

// Username/password login for the whole app. Sets a 7-day cookie.
router.post('/login', (req, res) => {
  if (!appLogin.username || !appLogin.password) {
    return res.status(503).json({ error: 'Login is not configured - set APP_USERNAME and APP_PASSWORD on the server.' });
  }
  const ip = req.ip;
  if (tooManyFails(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }

  const { username, password } = req.body ?? {};
  // Evaluate both so a wrong username and a wrong password take equal time.
  const userOk = safeEqual(username, appLogin.username);
  const passOk = safeEqual(password, appLogin.password);
  if (!userOk || !passOk) {
    recordFail(ip);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  failedLogins.delete(ip);
  const token = jwt.sign({ scope: LOGIN_SCOPE, username: appLogin.username }, jwtSecret, {
    expiresIn: `${LOGIN_DAYS}d`,
  });
  res.cookie(LOGIN_COOKIE, token, { ...cookieOptions(), maxAge: LOGIN_DAYS * DAY_MS });
  res.json({ authenticated: true, username: appLogin.username });
});

// Lets the client ask "am I logged in?" without a 401 in the console.
router.get('/session', (req, res) => {
  const login = readLogin(req);
  res.json(login ? { authenticated: true, username: login.username } : { authenticated: false });
});

// Short-lived CSRF guard for the OAuth redirect round-trip. A single-process
// Map is fine here - this is a few minutes' worth of pending logins, not
// durable state.
const pendingStates = new Map();

router.get('/linkedin', requireLogin, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());
  res.redirect(linkedinService.getAuthorizationUrl(state));
});

router.get('/linkedin/callback', requireLogin, async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent(errorDescription || error)}`);
  }
  if (!state || !pendingStates.has(state)) {
    return res.redirect(`${clientUrl}/auth?error=invalid_state`);
  }
  pendingStates.delete(state);

  const tokenResponse = await linkedinService.exchangeCodeForToken(code);
  const profile = await linkedinService.getUserInfo(tokenResponse.access_token);

  const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

  const user = await User.findOneAndUpdate(
    { linkedInId: profile.sub },
    {
      linkedInId: profile.sub,
      name: profile.name,
      email: profile.email,
      profilePictureUrl: profile.picture,
      accessToken: encrypt(tokenResponse.access_token),
      refreshToken: tokenResponse.refresh_token ? encrypt(tokenResponse.refresh_token) : undefined,
      tokenExpiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const sessionToken = jwt.sign({ userId: user._id.toString() }, jwtSecret, { expiresIn: '30d' });
  res.cookie('session', sessionToken, { ...cookieOptions(), maxAge: 30 * DAY_MS });

  res.redirect(clientUrl);
});

router.get('/me', requireLogin, requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

router.post('/logout', (req, res) => {
  res.clearCookie(LOGIN_COOKIE, cookieOptions());
  res.clearCookie('session', cookieOptions());
  res.status(204).end();
});

export default router;
