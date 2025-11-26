# Development Dockerfile for Next.js app
FROM oven/bun:1-alpine AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Development stage
FROM base AS dev
WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# The source code will be mounted as a volume
# This allows live code changes to be picked up

EXPOSE 3000

ENV NODE_ENV=development
ENV HOSTNAME="0.0.0.0"

# Run Next.js in dev mode with turbo
CMD ["bun", "run", "dev"]
