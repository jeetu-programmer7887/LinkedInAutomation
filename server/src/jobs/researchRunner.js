import AppSettings from '../models/AppSettings.js';
import { researchTimezone } from '../config/env.js';
import { getSettings } from '../services/profileService.js';
import { runResearch, ResearchInProgressError } from '../services/ideaService.js';
import { nowInZone, parseClockTime } from '../utils/zonedTime.js';

// How long after the set time a tick may still start the day's run. Covers
// a missed tick or a late external pinger, without turning into "catch up
// whenever the server comes back" - the author asked for fresh research
// outside the set time only when they click for it.
const RUN_WINDOW_MINUTES = 15;

export async function runScheduledResearchIfDue() {
  const settings = await getSettings();
  const target = parseClockTime(settings.researchTime);
  if (target === null) return;

  const { date, minutes } = nowInZone(researchTimezone);
  if (minutes < target || minutes >= target + RUN_WINDOW_MINUTES) return;
  if (settings.lastScheduledRunDate === date) return;

  // Claim the day atomically so overlapping ticks run research once.
  const claimed = await AppSettings.findOneAndUpdate(
    { _id: settings._id, lastScheduledRunDate: { $ne: date } },
    { lastScheduledRunDate: date },
    { returnDocument: 'after' }
  );
  if (!claimed) return;

  try {
    const batch = await runResearch('scheduled');
    console.log(`[scheduler] daily research ${batch.status} (${batch.ideas.length} ideas)`);
  } catch (err) {
    if (err instanceof ResearchInProgressError) {
      // A manual "Get fresh ideas" run is already producing today's ideas.
      return;
    }
    throw err;
  }
}
