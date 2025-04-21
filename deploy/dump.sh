#!/bin/bash

# Script to backup and restore the Farcaster Anky bot database
# This script handles both remote backup and local restoration

# Generate timestamp for backup file naming
TIMESTAMP=`date +%Y-%m-%d-%H-%M-%S`

# Backup the database from the DigitalOcean droplet
# Using the specific droplet IP: 146.190.48.54
ssh root@146.190.48.54 "sudo pg_dump -d farcaster_anky_bot -U your-db-user | gzip -9 > /var/www/farcaster.anky.bot/backups/db/farcaster_anky_bot-$TIMESTAMP.sql.gz" &&
echo "-- Farcaster Anky Bot DB backup complete!"

# Copy the backup file from the droplet to local machine
# The backup will be stored in ~/Downloads/
scp root@146.190.48.54:"/var/www/farcaster.anky.bot/backups/db/farcaster_anky_bot-$TIMESTAMP.sql.gz" ~/Downloads/

# Drop and recreate the local database
# Note: Make sure you have the correct database name and user
psql -d postgres -c "DROP DATABASE IF EXISTS farcaster_anky_bot;"
psql -d postgres -c "CREATE DATABASE farcaster_anky_bot;"

# Restore the database from the backup
# Note: Replace 'your-local-db-user' with your local PostgreSQL user
cat ~/Downloads/farcaster_anky_bot-$TIMESTAMP.sql.gz | gunzip | psql -d farcaster_anky_bot -U your-local-db-user