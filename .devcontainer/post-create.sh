#!/bin/bash
set -e

echo "Setting up Sprintagen development environment..."

# Fix node_modules volume permissions
echo "Fixing node_modules permissions..."
sudo chown -R node:node /workspace/node_modules

# Install dependencies
echo "Installing dependencies with Bun..."
bun install

# Create .env file from example if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please update .env with your credentials"
fi

# Generate a random BETTER_AUTH_SECRET if not set
if grep -q 'BETTER_AUTH_SECRET=""' .env 2>/dev/null; then
    echo "Generating BETTER_AUTH_SECRET..."
    SECRET=$(openssl rand -base64 32)
    sed -i "s/BETTER_AUTH_SECRET=\"\"/BETTER_AUTH_SECRET=\"$SECRET\"/" .env
fi

# Initialize database (skip if already exists)
echo "Setting up database..."
bun run db:push 2>/dev/null || echo "Database already initialized"

echo ""
echo "Development environment ready!"
echo ""
echo "Available commands:"
echo "  bun run dev       - Start development server"
echo "  bun run build     - Build for production"
echo "  bun run check     - Run Biome linter"
echo "  bun run db:studio - Open Drizzle Studio"
echo "  claude            - Claude Code CLI"
