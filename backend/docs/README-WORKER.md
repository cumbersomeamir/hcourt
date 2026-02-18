# Background Polling Worker

The polling worker runs independently of the Next.js application and continuously monitors the court schedule for changes.

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install `tsx` which is needed to run TypeScript files directly.

### 2. Run the Worker

**Development (with auto-reload):**
```bash
npm run worker:dev
```

**Production:**
```bash
npm run worker
```

### 3. Using PM2 (Recommended for Production)

PM2 is a process manager that keeps the worker running and restarts it if it crashes.

**Install PM2 globally:**
```bash
npm install -g pm2
```

**Start the worker with PM2:**
```bash
pm2 start pm2.config.js
```

**Useful PM2 commands:**
```bash
# View status
pm2 status

# View logs
pm2 logs poll-worker

# Restart worker
pm2 restart poll-worker

# Stop worker
pm2 stop poll-worker

# Delete worker from PM2
pm2 delete poll-worker

# Save PM2 configuration (so it starts on reboot)
pm2 save
pm2 startup  # Follow the instructions to enable auto-start on boot
```

## How It Works

1. **Polls every 30 seconds** - Fetches the latest schedule from the court website
2. **Detects changes** - Compares with the last saved schedule in MongoDB
3. **Saves changes** - Stores change records and creates notifications
4. **Updates schedule** - Saves the new schedule snapshot to the database

## Architecture

- **Independent Process**: Runs separately from Next.js, so it continues working even if the web app restarts
- **Single Source of Truth**: Only one worker instance polls, preventing duplicate requests
- **Automatic Recovery**: PM2 automatically restarts the worker if it crashes
- **Logging**: All activity is logged to `./logs/` directory (when using PM2)

## Client-Side Changes

The frontend no longer polls for schedule/monitoring changes. It only:
- Fetches the latest schedule from the database (every 30s)
- Checks for notifications (every 10s)
- Updates stats (every 60s)

All change detection is handled by the backend worker.

## Troubleshooting

**Worker not starting:**
- Check that MongoDB connection is working
- Verify environment variables are set (`.env.local`)
- Check logs: `pm2 logs poll-worker` or console output

**No changes detected:**
- Verify the court website is accessible
- Check MongoDB connection
- Review worker logs for errors

**High CPU/Memory usage:**
- The worker should be lightweight
- Check for infinite loops or memory leaks in logs
- PM2 will auto-restart if memory exceeds 500MB
