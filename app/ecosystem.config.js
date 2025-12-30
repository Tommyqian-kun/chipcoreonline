module.exports = {
  apps: [
    {
      name: 'logiccore-backend',
      script: 'npm',
      args: 'run start:backend',
      cwd: '/opt/logiccore/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        DEPLOYMENT_MODE: 'ecs_only'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
        DEPLOYMENT_MODE: 'ecs_only'
      },
      log_file: '/opt/logiccore/logs/backend.log',
      out_file: '/opt/logiccore/logs/backend-out.log',
      error_file: '/opt/logiccore/logs/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '2G',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'temp', 'jobs'],
      kill_timeout: 5000
    },
    {
      name: 'logiccore-frontend',
      script: 'npm',
      args: 'run start:frontend',
      cwd: '/opt/logiccore/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      log_file: '/opt/logiccore/logs/frontend.log',
      out_file: '/opt/logiccore/logs/frontend-out.log',
      error_file: '/opt/logiccore/logs/frontend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'temp', 'jobs'],
      kill_timeout: 3000
    }
  ],

  deploy: {
    production: {
      user: 'logiccore',
      host: ['your-production-server.com'],
      ref: 'origin/main',
      repo: 'https://github.com/your-org/logiccore.git',
      path: '/opt/logiccore',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /opt/logiccore/logs'
    }
  }
};
