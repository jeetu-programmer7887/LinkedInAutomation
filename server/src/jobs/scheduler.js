import cron from 'node-cron';
import { runDueScheduledPosts } from './scheduledPostRunner.js';

export function startScheduler() {
  // Every minute - see scheduledPostRunner.js for why this granularity
  // is fine and doesn't need a Redis-backed job queue.
  cron.schedule('* * * * *', async () => {
    try {
      await runDueScheduledPosts();
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    }
  });
  console.log('[scheduler] started - checking every minute for due scheduled posts');
}
