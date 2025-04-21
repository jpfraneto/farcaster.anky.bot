#!/bin/bash

# Script to deploy the Farcaster Anky bot to DigitalOcean droplet
# This script handles version bumping, environment setup, and application deployment

# Pull latest changes and bump version
git pull && npm version patch && git push &&

# Generate timestamp for deployment tracking
TIMESTAMP=`date +%Y-%m-%d-%H-%M-%S` &&

# Define deployment paths and commands
# Note: Update these paths according to your EasyPanel setup
DEPLOY_DIR="/var/www/farcaster.anky.bot" &&
BUN_PATH="/usr/local/bin/bun" &&

# Copy production environment file to the server
echo "Copying .env.production to the server..." &&
scp .env.production root@146.190.48.54:$DEPLOY_DIR/.env &&

# SSH into the server and perform deployment steps
ssh root@146.190.48.54 "
  cd $DEPLOY_DIR &&
  git checkout bun.lockb &&
  git pull &&
  $BUN_PATH install &&
  npx prisma migrate deploy &&
  npx prisma generate" &&

# Reload the application using PM2
# Note: Make sure PM2 is installed and configured on your droplet
echo "Reloading application..." &&
ssh root@146.190.48.54 "cd $DEPLOY_DIR && pm2 reload farcaster-anky-bot --update-env" &&

echo "_________" &&
echo "Deployment completed successfully at $TIMESTAMP"
