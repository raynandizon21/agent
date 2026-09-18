module.exports = {
  apps: [
    {
      name: 'Agent-System',
      script: 'server/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'Agent-System-Dashboard',
      script: 'node_modules/vite/bin/vite.js',
      args: '--host --port 6001',
      cwd: __dirname,
      interpreter: '/root/.nvm/versions/node/v20.19.0/bin/node',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
    },
  ],
};
