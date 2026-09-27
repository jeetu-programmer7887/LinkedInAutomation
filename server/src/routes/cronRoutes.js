import crypto from 'crypto';
import express from 'express';
import { cronSecret } from '../config/env.js';
import { runTick } from '../jobs/tick.js';

const router = express.Router();

function secretMatches(provided) {
  const a = Buffer.from(String(provided ?? ''));
  const b = Buffer.from(cronSecret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The same work node-cron does every minute, for hosts without a
// long-running process (Vercel, etc.): point an external pinger here.
// Accepts GET (what Vercel Cron sends, with "Authorization: Bearer
// <CRON_SECRET>") or POST, with the secret in that header or x-cron-secret.
router.all('/tick', async (req, res) => {
  if (!cronSecret) {
    return res.status(503).json({ error: 'Cron endpoint disabled - set CRON_SECRET in .env to enable it.' });
  }
  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secretMatches(req.get('x-cron-secret') || bearer)) {
    return res.status(401).json({ error: 'Invalid cron secret' });
  }
  const result = await runTick();
  res.json({ ok: true, ...result });
});

export default router;
