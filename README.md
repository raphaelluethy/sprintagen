# Sprintagen

> **⚠️ Proof of Concept**: Not production-ready. For demonstration only.

AI-powered ticket management that intelligently analyzes, ranks, and manages tickets from Jira, Linear, Docker, and manual sources.

## Features

- **Multi-provider support**: Jira, Linear, Docker, manual tickets
- **AI ranking**: Automatic prioritization by urgency, impact, complexity
- **Smart recommendations**: AI-generated steps and assignments
- **Integrated chat**: Contextual AI assistance per ticket
- **Code analysis**: Opencode integration for codebase understanding

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 20+
- [Docker](https://www.docker.com/) (optional, for containerized setup)
- Git

### Local Development

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env with your keys (see Environment Variables below)

# 3. Setup database
bun run db:push    # Create tables
bun run db:seed    # Optional: add sample data

# 4. Start dev server
bun run dev        # App runs at http://localhost:3000
```

### Docker Setup

```bash
# Configure .env then:
docker compose up    # Starts web (3000) + opencode (4096)
```

Opencode needs a codebase to analyze. Mount a local repo or set `GIT_REPO_URL` in `docker-compose.yml`.

## Architecture

```
src/
├── app/              # Next.js pages & API routes
│   ├── admin/chats/  # Opencode chat UI
│   ├── api/          # tRPC & Opencode proxy
│   └── _components/  # Page components
├── components/ui/    # Reusable UI (Radix)
├── server/           # Backend logic
│   ├── ai/           # AI providers (Cerebras, OpenRouter)
│   ├── api/          # tRPC routers
│   ├── db/           # Drizzle schema & client
│   └── tickets/      # Provider integrations
└── lib/              # Utilities
```
