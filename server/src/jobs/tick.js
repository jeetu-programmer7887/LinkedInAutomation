import { runDueScheduledPosts } from './scheduledPostRunner.js';
import { runScheduledResearchIfDue } from './researchRunner.js';

let ticking = false;

/**
 * Everything time-based, in one call: publish due posts and start the
 * daily research when its time comes. Driven every minute by node-cron
 * (jobs/scheduler.js) locally, or by an external pinger hitting
 * /api/cron/tick on hosts without a long-running process.
 */
export async function runTick() {
  // Research can outlast a minute; don't stack a second tick on top.
  if (ticking) return { skipped: true };
  ticking = true;
  try {
    const [posts, research] = await Promise.allSettled([runDueScheduledPosts(), runScheduledResearchIfDue()]);
    for (const [name, result] of [['scheduled posts', posts], ['research', research]]) {
      if (result.status === 'rejected') console.error(`[scheduler] ${name} failed:`, result.reason);
    }
    return { skipped: false };
  } finally {
    ticking = false;
  }
}
