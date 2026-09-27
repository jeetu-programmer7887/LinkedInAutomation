import app from './app.js';
import { connectDb } from './config/db.js';
import { port } from './config/env.js';
import { startScheduler } from './jobs/scheduler.js';
import { backfillPosts } from './jobs/backfillPosts.js';

async function main() {
  await connectDb();
  await backfillPosts();
  startScheduler();

  app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
