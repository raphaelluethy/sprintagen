# Sprintagen

A [T3 Stack](https://create.t3.gg/) project with integrated Opencode AI assistant.

## Tech Stack

- [Next.js](https://nextjs.org) - React framework
- [Better Auth](https://www.better-auth.com/) - Authentication
- [Drizzle](https://orm.drizzle.team) - Database ORM
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [tRPC](https://trpc.io) - End-to-end typesafe APIs
- [Opencode](https://opencode.ai) - AI coding assistant

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 20+
- [Docker](https://www.docker.com/) and Docker Compose (for containerized development)

### Local Development (without Docker)

1. Install dependencies:
   ```bash
   bun install
   ```

2. Copy the environment file and configure it:
   ```bash
   cp .env.example .env
   ```

3. Run database migrations:
   ```bash
   bun run db:push
   ```

4. Start the development server:
   ```bash
   bun run dev
   ```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Docker Development

The project includes Docker support for running both the Next.js app and the Opencode server.

#### Quick Start

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure your `.env` file with the required values (GitHub OAuth, etc.)

3. Start all services:
   ```bash
   docker compose up
   ```

This will start:
- **web**: Next.js app at [http://localhost:3000](http://localhost:3000)
- **opencode**: Opencode server at [http://localhost:4096](http://localhost:4096)

#### Mounting a Repository for Opencode

Opencode needs a repository to work with. You have two options:

**Option 1: Clone a public repository (via environment variable)**

```bash
# In docker-compose.yml, uncomment and set:
GIT_REPO_URL=https://github.com/your-org/your-repo.git
```

**Option 2: Mount a local repository (read-only)**

For private repos or local development, mount your repository as a read-only volume:

```yaml
# In docker-compose.yml, under opencode.volumes:
volumes:
  - ./my-local-repo:/workspace/repo:ro
```

The `:ro` flag ensures Opencode can read the code but cannot modify it.

#### Configuring AI Provider Auth

Opencode needs API credentials to communicate with AI providers. Configure these in your `.env`:

```bash
# Provider ID (e.g., "anthropic", "openai", "openrouter")
OPENCODE_PROVIDER_ID="anthropic"

# Your API key for the provider
OPENCODE_PROVIDER_API_KEY="sk-ant-..."
```

The Opencode container will automatically configure auth on startup via the `/auth/:id` endpoint.

You can also refresh auth at runtime by calling:
```bash
curl -X POST http://localhost:3000/api/opencode/auth \
  -H "Content-Type: application/json" \
  -d '{"providerId": "anthropic", "apiKey": "sk-ant-..."}'
```

#### Using the Chat Interface

Once the services are running, navigate to [http://localhost:3000/admin/chats](http://localhost:3000/admin/chats) to access the Opencode chat interface. From there you can:

- Create new chat sessions
- Send messages to the AI assistant
- View conversation history

#### Docker Services Overview

| Service | Port | Description |
|---------|------|-------------|
| web | 3000 | Next.js application |
| opencode | 4096 | Opencode AI server |

#### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite database path | Yes |
| `BETTER_AUTH_SECRET` | Auth secret (production) | Prod only |
| `BETTER_AUTH_GITHUB_CLIENT_ID` | GitHub OAuth client ID | Yes |
| `BETTER_AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth secret | Yes |
| `OPENCODE_SERVER_URL` | URL of Opencode server | Auto in Docker |
| `OPENCODE_PROVIDER_ID` | AI provider identifier | Optional |
| `OPENCODE_PROVIDER_API_KEY` | AI provider API key | Optional |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── admin/chats/       # Opencode chat interface
│   ├── api/               # API routes
│   │   ├── auth/          # Better Auth routes
│   │   ├── opencode/      # Opencode proxy routes
│   │   └── trpc/          # tRPC handler
│   └── _components/       # Page components
├── server/                # Server-side code
│   ├── api/              # tRPC routers
│   └── better-auth/      # Auth configuration
├── db/                   # Database schema
├── trpc/                 # tRPC setup
└── styles/               # Global styles
```

## Learn More

- [T3 Stack Documentation](https://create.t3.gg/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Opencode Documentation](https://opencode.ai/docs/)
- [Better Auth Documentation](https://www.better-auth.com/docs)
