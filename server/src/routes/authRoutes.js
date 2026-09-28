import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import * as linkedinService from '../services/linkedinService.js';
import User from '../models/User.js';
import { encrypt } from '../utils/crypto.js';
import { jwtSecret, clientUrl, crossSiteCookies } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Short-lived CSRF guard for the OAuth redirect round-trip. A single-process
// Map is fine here - this is a few minutes' worth of pending logins, not
// durable state.
const pendingStates = new Map();

router.get('/linkedin', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());
  res.redirect(linkedinService.getAuthorizationUrl(state));
});

router.get('/linkedin/callback', async (req, res) => {
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
  res.cookie('session', sessionToken, {
    httpOnly: true,
    sameSite: crossSiteCookies ? 'none' : 'lax',
    secure: crossSiteCookies,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.redirect(clientUrl);
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.status(204).end();
});

export default router;
