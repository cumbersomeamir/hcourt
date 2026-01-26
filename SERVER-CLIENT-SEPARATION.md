# Server/Client Separation Architecture

This document explains the server/client separation in the application.

## Architecture Overview

The application uses Next.js App Router which provides built-in server/client separation:

- **Server Code**: Located in `app/api/` (API routes) and `lib/` (server utilities)
- **Client Code**: Located in `app/` pages (React components marked with `'use client'`)
- **Shared Types**: Located in `types/` (TypeScript types used by both)

## Server-Only Code

### API Routes (`app/api/`)

All API routes are **server-only** and include:
- `export const runtime = 'nodejs'` - Forces Node.js runtime
- `export const dynamic = 'force-dynamic'` - Prevents static optimization

**API Routes:**
- `/api/monitor` - Change detection and monitoring
- `/api/notifications` - Notification management
- `/api/orders/case-types` - Fetch case types
- `/api/orders/fetch` - Fetch order details
- `/api/schedule` - Fetch and save schedule
- `/api/schedule/latest` - Get latest schedule from DB
- `/api/stats` - Database statistics
- `/api/users` - User management
- `/api/web-diary` - Web diary parsing

### Server Libraries (`lib/`)

All files in `lib/` are **server-only** and include guards:

- `lib/orders.ts` - Order fetching and PDF/Excel generation
- `lib/parser.ts` - HTML parsing for court schedules
- `lib/changeDetector.ts` - Change detection logic
- `lib/mongodb.ts` - MongoDB connection (server-only)

**Server-Only Guards:**
Each server library file includes:
```typescript
if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server');
}
```

## Client-Only Code

### Pages (`app/*/page.tsx`)

Client pages are marked with `'use client'`:
- `app/page.tsx` - Home page (client)
- `app/orders/page.tsx` - Orders page (client)
- `app/web-diary/page.tsx` - Web Diary page (client)

### Components (`components/`)

Client components are marked with `'use client'`:
- `components/Clarity.tsx` - Analytics (client)

## Build Configuration

### `next.config.ts`

- `serverComponentsExternalPackages`: Excludes heavy packages from client bundle
  - `playwright`, `cheerio`, `exceljs`, `mongodb`
- Webpack configuration ensures browser APIs are not bundled in server code

## How It Works

1. **API Routes**: Next.js automatically routes `/api/*` to server-side handlers
2. **Server Libraries**: Imported only in API routes (never in client components)
3. **Type Safety**: TypeScript ensures server code isn't accidentally imported in client
4. **Runtime Guards**: Runtime checks prevent server code from running in browser

## Deployment

- **Server**: All API routes run on Node.js server
- **Client**: Pages are pre-rendered or client-rendered
- **Worker**: Background polling worker runs as separate process (PM2)

## Troubleshooting

**"File is not defined" error:**
- This means server code is trying to use browser APIs
- Solution: Ensure all server code is in `app/api/` or `lib/`
- Check that no `'use client'` files import server libraries

**Build errors:**
- Clean build: `rm -rf .next && npm run build`
- Check that all API routes have `runtime = 'nodejs'`
- Verify server libraries have window guards

## File Structure

```
/
├── app/
│   ├── api/              # Server-only API routes
│   │   ├── monitor/
│   │   ├── notifications/
│   │   ├── orders/
│   │   ├── schedule/
│   │   ├── stats/
│   │   ├── users/
│   │   └── web-diary/
│   ├── page.tsx          # Client page
│   ├── orders/
│   │   └── page.tsx      # Client page
│   └── web-diary/
│       └── page.tsx      # Client page
├── lib/                   # Server-only libraries
│   ├── orders.ts
│   ├── parser.ts
│   ├── changeDetector.ts
│   └── mongodb.ts
├── components/            # Client components
│   └── Clarity.tsx
├── scripts/               # Standalone server scripts
│   └── poll-worker.ts
└── types/                 # Shared TypeScript types
```
