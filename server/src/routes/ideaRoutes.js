import express from 'express';
import IdeaBatch from '../models/IdeaBatch.js';
import { researchTimezone } from '../config/env.js';
import { getSettings, updateSettings } from '../services/profileService.js';
import { runResearch, findIdea } from '../services/ideaService.js';
import { parseClockTime } from '../utils/zonedTime.js';
import { logActivity } from '../services/activityService.js';

const router = express.Router();

function settingsView(settings) {
  return { researchTime: settings.researchTime, timezone: researchTimezone };
}

// Everything the Schedule page needs in one call: the newest ideas that
// finished, the newest run of any outcome (to surface a failure), and the
// research time.
router.get('/', async (req, res) => {
  const [latest, lastRun, settings] = await Promise.all([
    IdeaBatch.findOne({ status: 'done' }).sort({ createdAt: -1 }).select('-ideas.sources.content'),
    IdeaBatch.findOne().sort({ createdAt: -1 }).select('status failureReason trigger createdAt'),
    getSettings(),
  ]);
  res.json({ latest, lastRun, settings: settingsView(settings) });
});

// "Get fresh ideas". Waits for the run to finish (roughly 10-30s) rather
// than handing back a job id to poll - simpler, and it keeps working on
// serverless hosts that freeze a function once its response is sent.
router.post('/refresh', async (req, res) => {
  const batch = await runResearch('manual');
  if (batch.status === 'failed') {
    return res.status(502).json({ error: batch.failureReason || 'Research failed. Try again.' });
  }
  res.status(201).json(batch);
});

router.put('/settings', async (req, res) => {
  const { researchTime } = req.body;
  if (parseClockTime(researchTime) === null) {
    return res.status(400).json({ error: 'researchTime must be a 24h time like "11:00"' });
  }
  // Clearing the claimed date lets a new, later time still run today.
  const settings = await updateSettings({ researchTime, lastScheduledRunDate: null });
  await logActivity('research_time_changed', `Daily research time set to ${researchTime} (${researchTimezone})`);
  res.json(settingsView(settings));
});

router.get('/:batchId/:index', async (req, res) => {
  const idea = await findIdea(req.params.batchId, req.params.index);
  if (!idea) {
    return res.status(404).json({ error: 'That idea no longer exists.' });
  }
  res.json(idea);
});

export default router;
