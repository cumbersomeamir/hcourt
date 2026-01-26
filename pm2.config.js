/**
 * PM2 configuration for running the polling worker
 * 
 * Usage:
 *   pm2 start pm2.config.js
 *   pm2 stop poll-worker
 *   pm2 restart poll-worker
 *   pm2 logs poll-worker
 *   pm2 delete poll-worker
 */

module.exports = {
  apps: [
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
