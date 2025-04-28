#!/bin/bash

# Change to your project directory
cd ./

# Pull the latest changes from GitHub
git pull

# Generate Prisma client
~/.bun/bin/bun run prisma:generate

# Restart the PM2 app
pm2 restart farcaster-anky-bot