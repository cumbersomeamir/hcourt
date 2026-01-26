/**
 * PM2 configuration for running Next.js app and polling worker
 * 
 * Usage:
 *   pm2 start pm2.config.js
 *   pm2 stop all
 *   pm2 restart all
 *   pm2 logs
 *   pm2 delete all
 *   pm2 save  # Save configuration for auto-start on reboot
 */

module.exports = {
  apps: [
    {
      name: 'hcourt-app',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
    {
      name: 'poll-worker',
      script: 'npm',
      args: 'run worker',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/poll-worker-error.log',
      out_file: './logs/poll-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};
