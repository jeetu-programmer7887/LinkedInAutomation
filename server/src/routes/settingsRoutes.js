import express from 'express';
import { getSettings, updateSettings } from '../services/profileService.js';
import { logActivity } from '../services/activityService.js';

const router = express.Router();

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function themeView(theme) {
  const { name, background, text, hover } = theme;
  return { name, background, text, hover };
}

// The app's colors. No login: this is a single-user app, and the old
// /api/users/me/theme route required one, so the theme was never saved.
// Responds { theme: null } until a theme has been saved once.
router.get('/theme', async (req, res) => {
  const settings = await getSettings();
  res.json({ theme: settings.theme?.background ? themeView(settings.theme) : null });
});

router.put('/theme', async (req, res) => {
  const { name, background, text, hover } = req.body;
  if (![background, text, hover].every((c) => HEX_COLOR.test(String(c)))) {
    return res.status(400).json({ error: 'background, text and hover must be colors like #A65A2E' });
  }
  const theme = { name: String(name || 'Custom').slice(0, 40), background, text, hover };
  const settings = await updateSettings({ theme });
  await logActivity('theme_changed', `Theme changed to ${theme.name}`);
  res.json(themeView(settings.theme));
});

export default router;
