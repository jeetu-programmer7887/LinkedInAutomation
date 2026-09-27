import cron from 'node-cron';
import { runTick } from './tick.js';

export function startScheduler() {
  // Every minute - see scheduledPostRunner.js for why this granularity
  // is fine and doesn't need a Redis-backed job queue.
  cron.schedule('* * * * *', () => runTick());
  console.log('[scheduler] started - checking every minute for due posts and the daily research time');
}
