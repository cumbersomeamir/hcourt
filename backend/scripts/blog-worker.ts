import { syncBlogNews } from '../lib/blogNews';

const intervalMs = 4 * 60 * 60 * 1000;
const dryRun = process.argv.includes('--dry-run');
let stopping = false;
let running = false;
let timer: NodeJS.Timeout | undefined;

async function run() {
  running = true;
  try { console.log('[Blogs]', await syncBlogNews(dryRun)); }
  catch (error) { console.error('[Blogs] Publication run failed:', error instanceof Error ? error.message : 'Unknown error'); }
  running = false;
  if (stopping) process.exit(0);
  if (dryRun) process.exit(0);
  if (!stopping) timer = setTimeout(run, intervalMs);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true; if (timer) clearTimeout(timer); if (!running) process.exit(0); });
}

void run();
