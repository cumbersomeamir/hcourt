# Production Operations

Use repo-root PM2 and clean installs for production. Do not run the frontend alone.

## Required layout

- Shared env dir: `$HOME/.config/hcourt`
- Backend env file: `$HOME/.config/hcourt/backend.env.local`
- Frontend env file: `$HOME/.config/hcourt/frontend.env.local` (optional)

## First install or rebuild

```bash
./ops/install-production.sh
```

This script:

- uses the Node version from `.nvmrc`
- reinstalls backend and frontend dependencies from scratch with `npm ci`
- verifies the backend runtime can load Next's native SWC binary before build/start
- rebuilds both apps
- starts/restarts `hcourt-backend`, `hcourt-frontend`, and `hcourt-worker` through PM2
- checks backend on `http://127.0.0.1:4000/api/health`
- checks frontend on `http://127.0.0.1:3000/`
- saves the PM2 process list for reboot recovery

## PM2 boot persistence

Run once on the instance:

```bash
pm2 save
pm2 startup
```

Follow the command that PM2 prints so the systemd startup hook is installed for the current user.
