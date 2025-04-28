.PHONY: redeploy

redeploy:
	@echo "Starting redeployment process..."
	@echo "Pulling latest changes from GitHub..."
	git pull

	@echo "Installing dependencies..."
	bun install

	@echo "Generating Prisma client..."
	bun run prisma:generate

	@echo "Running Prisma migrations..."
	# Uncomment if you need to run migrations
	# bun prisma migrate deploy

	@echo "Restarting PM2 process..."
	pm2 restart farcaster-anky-bot

	@echo "Deployment completed successfully!"
