# Sprintagen

> **⚠️ Proof of Concept**: Not production-ready. For demonstration only.

AI-powered ticket management that intelligently analyzes, ranks, and manages tickets from multiple sources using AI.

## Features

- **Multi-provider support**: Jira, Linear, Docker, and manual tickets
- **AI ranking**: Automatic prioritization by urgency, impact, and complexity
- **Smart recommendations**: AI-generated steps and assignments
- **Integrated chat**: Contextual AI assistance per ticket
- **Code analysis**: Opencode integration for codebase understanding

## Tech Stack

- **Runtime**: Bun (recommended) or Node.js 20+
- **Framework**: Next.js 15 (App Router) with React 19
- **API**: tRPC v11 with React Query
- **Database**: SQLite via Drizzle ORM (LibSQL/Turso client)
- **Auth**: Better Auth with GitHub OAuth
- **AI**: Vercel AI SDK with Cerebras and OpenRouter providers
- **UI**: Tailwind CSS 4 + Radix UI components
- **Linting**: Biome
- **Testing**: Vitest

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

## Commands

```bash
# Development
bun run dev          # Start Next.js dev server with Turbo

# Build & Production
bun run build        # Production build
bun run start        # Start production server
bun run preview      # Build and start locally

# Code Quality
bun run check        # Biome lint & format check
bun run check:write  # Biome with safe auto-fixes
bun run format       # Format code
bun run typecheck    # TypeScript check

# Testing
bun run test         # Run tests once
bun run test:watch   # Run tests in watch mode
bun run test:coverage # Run tests with coverage

# Database
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Apply migrations
bun run db:push      # Push schema directly (dev)
bun run db:seed      # Seed sample data
bun run db:studio    # Open Drizzle Studio UI

# Docker
make rebuild         # Rebuild and restart containers
make down            # Stop and clean up containers
```

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── _components/        # Page-specific components
│   │   ├── ticket-modal/   # Ticket detail modal
│   │   └── ticket-table/   # Table with control-bar, table-row
│   ├── api/
│   │   ├── auth/[...all]/  # Better Auth routes
│   │   └── trpc/[trpc]/    # tRPC handler
│   └── layout.tsx          # Root layout with providers
│
├── components/
│   ├── ui/                 # Reusable Radix UI components
│   └── chat/               # Chat display components
│       └── tools/          # ToolCallDisplay, StepsCollapsible, ReasoningDisplay
│
├── lib/
│   └── constants/          # Shared style constants (PRIORITY_STYLES, STATUS_STYLES)
│
├── server/
│   ├── ai/                 # AI providers (cerebras.ts, openrouter.ts, prompts.ts)
│   ├── ai-agents/          # Agent provider strategy pattern
│   │   ├── registry.ts     # Agent registry (single-active-agent)
│   │   ├── model-selector.ts # Model selection (fast/standard/premium)
│   │   └── providers/      # opencode/, mock/
│   ├── api/                # tRPC routers
│   │   ├── root.ts         # Router composition
│   │   ├── trpc.ts         # Context, procedures, middleware
│   │   └── routers/        # ticket.ts, opencode.ts
│   ├── db/                 # Drizzle schema and client
│   └── tickets/
│       └── providers/      # Jira, Linear, Docker integrations (base.ts pattern)
│
├── types/                  # Centralized type definitions
│   ├── ticket.ts           # Ticket, TicketWithRelations, RankingResult
│   ├── opencode.ts         # TransformedMessage, OpencodeResult
│   ├── ai-agent.ts         # AgentProvider, AgentSession interfaces
│   └── index.ts            # Re-exports all types
│
├── test/                   # Test utilities and fixtures
│   ├── fixtures/           # Test data
│   ├── mocks/              # Mock implementations
│   └── utils.ts            # Shared test helpers
│
├── trpc/                   # tRPC client setup (react.tsx, query-client.ts)
├── hooks/                  # Custom React hooks
└── env.js                  # Environment validation (t3-oss)
```

### Key Patterns

**Ticket Providers**: New providers extend `src/server/tickets/providers/base.ts` interface. See `jira.ts`, `linear.ts`, `docker.ts` for examples.

**AI Agent Providers**: Implements a strategy pattern in `src/server/ai-agents/`. The `AgentRegistry` manages providers with a single-active-agent model. New agents implement the `AgentProvider` interface:

```typescript
import { agentRegistry, OpencodeProvider } from "@/server/ai-agents";

// Register provider
agentRegistry.register(new OpencodeProvider());

// Use active provider
const provider = agentRegistry.getActive();
const session = await provider.createSession("My Chat");
const response = await provider.sendMessage(session.id, "Hello!");
```

**Model Selection**: Use `getDefaultModel()` from `src/server/ai-agents/model-selector.ts` for consistent model selection based on `FAST_MODE` environment variable. Supports fast, standard, and premium tiers.

**Centralized Types**: Import shared types from `@/types` instead of defining inline:

```typescript
import type { Ticket, TicketWithRelations, AgentProvider } from "@/types";
```

**Chat Components**: Import display components from `@/components/chat`:

```typescript
import { ToolCallDisplay, StepsCollapsible, ReasoningDisplay } from "@/components/chat";
```

**Style Constants**: Import shared style mappings from `@/lib/constants`:

```typescript
import { PRIORITY_STYLES, STATUS_STYLES } from "@/lib/constants";
```

**tRPC Procedures**: Add to `src/server/api/routers/` and register in `root.ts`. Use `protectedProcedure` for authenticated routes.

**AI Provider Selection**: Logic in `src/server/ai/index.ts` chooses between Cerebras/OpenRouter based on config.

**Database Schema**: All tables prefixed with `sprintagen_` in `src/server/db/schema.ts`. Run `db:generate` after changes.

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - SQLite path (default: `file:./db.sqlite`)
- `BETTER_AUTH_SECRET` - Auth session secret
- `BETTER_AUTH_GITHUB_CLIENT_ID` / `BETTER_AUTH_GITHUB_CLIENT_SECRET` - GitHub OAuth

Optional:
- `CEREBRAS_API_KEY` / `OPENROUTER_API_KEY` - AI providers
- `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` - Jira integration
- `LINEAR_API_KEY` - Linear integration
- `OPENCODE_SERVER_URL` - Opencode service (default: `http://localhost:4096`)
- `FAST_MODE` - Use fast paid models

## Development Notes

- **Testing**: Vitest is configured with tests in `src/**/*.test.ts`. Use `MockAgentProvider` from `@/server/ai-agents` for testing agent interactions.
- **Dev auth bypass**: In development, `protectedProcedure` uses a mock user when unauthenticated
- **Polling-based sync**: Ticket sync uses polling
- **Opencode SSE**: The Opencode chat feature uses Server-Sent Events (SSE) for real-time updates via `useOpencodeSSE` hook and `/api/opencode/events` endpoint
- Path alias: `@/*` maps to `./src/*`
