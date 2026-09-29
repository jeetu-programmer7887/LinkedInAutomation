import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config/env.js';

// Cookie set by POST /api/auth/login. Kept separate from the LinkedIn
// OAuth "session" cookie, and its JWT carries scope "app": the OAuth
// routes will sign a session for any LinkedIn account, so that cookie
// must never be enough to get into the app.
export const LOGIN_COOKIE = 'app_session';
export const LOGIN_SCOPE = 'app';

export function requireAuth(req, res, next) {
  const token = req.cookies?.session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/** Returns the login JWT's payload, or null if the cookie is missing or invalid. */
export function readLogin(req) {
  const token = req.cookies?.[LOGIN_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret);
    return payload.scope === LOGIN_SCOPE ? payload : null;
  } catch {
    return null;
  }
}

/** Gate for every app API route: the username/password login must be valid. */
export function requireLogin(req, res, next) {
  const login = readLogin(req);
  if (!login) {
    return res.status(401).json({ error: 'Please log in' });
  }
  req.login = login;
  next();
}
