import express from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

router.patch('/me/theme', requireAuth, async (req, res) => {
  const { name, background, text, hover } = req.body;
  if (!background || !text || !hover) {
    return res.status(400).json({ error: 'background, text and hover are all required' });
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    { theme: { name: name || 'Custom', background, text, hover } },
    { new: true }
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user.theme);
});

export default router;
