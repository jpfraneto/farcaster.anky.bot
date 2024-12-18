module.exports = {
  apps: [
    {
      name: "anky-farcaster",
      script: "bun",
      args: "run src/index.tsx",
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      log_file: "logs/combined.log",
      time: true,
    },
    {
      name: "redis-monitor",
      script: "bash",
      args: [
        "-c",
        "redis-cli ping >/dev/null 2>&1 || sudo systemctl restart redis-server",
      ],
      watch: false,
      instances: 1,
      exec_mode: "fork",
      cron_restart: "*/5 * * * *",
      autorestart: false,
    },
  ],
};
