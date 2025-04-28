module.exports = {
  apps: [
    {
      name: "farcaster-anky-bot",
      script: "~/.bun/bin/bun",
      args: "run src/index.ts",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      watch: false,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
    },
  ],
};
