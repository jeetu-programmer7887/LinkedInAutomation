import jwt from 'jsonwebtoken';
import { jwtSecret } from '../config/env.js';

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
