# High Court Schedule Monitor

Monitors court schedule changes and sends notifications.

## Setup External Cron (Required for Hobby Plan)

Since Vercel Hobby plan only supports daily cron jobs, use an external service:

### Quick Setup with cron-job.org (Free)

1. Go to https://cron-job.org/en/
2. Sign up (free)
3. Create new cron job:
   - **URL**: `https://your-app.vercel.app/api/monitor`
   - **Method**: POST
   - **Schedule**: Every 30 seconds - `0/30 * * * * *`
   - **Save**

That's it! The endpoint doesn't require authentication.

## Environment Variables

Set in Vercel:
- `MONGODB_URI`: Your MongoDB connection string

## API Endpoints

- `POST /api/monitor` - Run monitoring (for external cron)
- `GET /api/schedule/latest` - Get latest schedule
- `GET /api/notifications` - Get notifications
- `GET /api/stats` - Get database stats

## Deploy

```bash
vercel
```
