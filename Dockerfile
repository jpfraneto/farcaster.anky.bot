FROM oven/bun:latest

WORKDIR /app

COPY package.json .
COPY bun.lockb* ./ 

RUN bun install

COPY . .

# Generate Prisma client
RUN bunx prisma generate

EXPOSE 4444

# Wait for PostgreSQL to be ready before starting
CMD sleep 5 && bunx prisma migrate deploy && bun run serve