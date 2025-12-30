# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sprintagen is an AI-powered ticket management system that aggregates tickets from multiple sources (Jira, Linear, Docker, manual), ranks them using AI, and provides code analysis capabilities via Opencode integration.

## Tech Stack

- **Runtime:** Bun (not Node.js)
- **Framework:** Next.js 15 (App Router) with React 19
- **API:** tRPC v11 with React Query
- **Database:** SQLite via Drizzle ORM (LibSQL/Turso client)
- **Auth:** Better Auth with GitHub OAuth
- **AI:** Vercel AI SDK with Cerebras and OpenRouter providers
- **UI:** Tailwind CSS 4 + Radix UI components
- **Linting:** Biome

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

### Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── _components/        # Page-specific components (ticket-modal/, ticket-table/)
│   ├── api/
│   │   ├── auth/[...all]/  # Better Auth routes
│   │   └── trpc/[trpc]/    # tRPC handler
│   └── layout.tsx          # Root layout with providers
│
├── components/ui/          # Reusable Radix UI components
│
├── server/
│   ├── ai/                 # AI providers (cerebras.ts, openrouter.ts, prompts.ts)
│   ├── api/                # tRPC routers
│   │   ├── root.ts         # Router composition
│   │   ├── trpc.ts         # Context, procedures, middleware
│   │   └── routers/        # ticket.ts, opencode.ts
│   ├── db/                 # Drizzle schema and client
│   └── tickets/
│       └── providers/      # Jira, Linear, Docker integrations (base.ts pattern)
│
├── trpc/                   # tRPC client setup (react.tsx, query-client.ts)
├── hooks/                  # Custom React hooks
└── env.js                  # Environment validation (t3-oss)
```

### Key Patterns

**Ticket Providers:** New providers extend `src/server/tickets/providers/base.ts` interface. See jira.ts, linear.ts, docker.ts for examples.

**tRPC Procedures:** Add to `src/server/api/routers/` and register in `root.ts`. Use `protectedProcedure` for authenticated routes.

**AI Provider Selection:** Logic in `src/server/ai/index.ts` chooses between Cerebras/OpenRouter based on config.

**Database Schema:** All tables prefixed with `sprintagen_` in `src/server/db/schema.ts`. Run `db:generate` after changes.

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

- **No test framework** is currently configured
- **Dev auth bypass:** In development, `protectedProcedure` uses a mock user when unauthenticated
- **Polling-based sync:** Ticket sync uses polling
- **Opencode SSE:** The Opencode chat feature uses Server-Sent Events (SSE) for real-time updates via `useOpencodeSSE` hook and `/api/opencode/events` endpoint
- Path alias: `@/*` maps to `./src/*`

## btca

Trigger: user says "use btca" (for codebase/docs questions).

Run:
- btca ask -t <tech> -q "<question>"

Available <tech>: opencode, tailwindcss
