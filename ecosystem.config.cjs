const path = require('path');

const rootDir = __dirname;
const logsDir = path.join(rootDir, 'logs');

module.exports = {
  apps: [
    {
      name: 'hcourt-backend',
      cwd: path.join(rootDir, 'backend'),
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      exp_backoff_restart_delay: 500,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      out_file: path.join(logsDir, 'backend-out.log'),
      error_file: path.join(logsDir, 'backend-error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
    {
      name: 'hcourt-frontend',
      cwd: path.join(rootDir, 'frontend'),
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      exp_backoff_restart_delay: 500,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:4000',
      },
      out_file: path.join(logsDir, 'frontend-out.log'),
      error_file: path.join(logsDir, 'frontend-error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
    {
      name: 'hcourt-worker',
      cwd: path.join(rootDir, 'backend'),
      script: 'npm',
      args: 'run worker',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      restart_delay: 5000,
      exp_backoff_restart_delay: 500,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: path.join(logsDir, 'worker-out.log'),
      error_file: path.join(logsDir, 'worker-error.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};
