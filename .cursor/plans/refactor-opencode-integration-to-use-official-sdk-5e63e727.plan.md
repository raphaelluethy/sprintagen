<!-- 5e63e727-bb22-4988-abe2-a5e95a986f00 c685c6b9-35fa-4bfe-826c-ccbcfc40f5b5 -->
# Refactor Opencode Integration to Use Official SDK

## Architecture

```
UI (hooks) → API Routes → SDK Client → Opencode Server
```

## Key Changes

### 1. Create SDK Client Singleton

Create `src/lib/opencode-client.ts` to initialize the SDK client:

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"
import { env } from "@/env"

let client: ReturnType<typeof createOpencodeClient> | null = null

export function getOpencodeClient() {
  if (!client) {
    client = createOpencodeClient({
      baseUrl: env.OPENCODE_SERVER_URL,
    })
  }
  return client
}
```

### 2. Refactor API Routes

Replace `fetchFromOpencode()` calls with SDK client methods:

| Route | Current | SDK Method |

|-------|---------|------------|

| `GET /api/opencode/sessions` | `fetchFromOpencode("/session")` | `client.session.list()` |

| `POST /api/opencode/sessions` | `fetchFromOpencode("/session", POST)` | `client.session.create({ body })` |

| `GET /api/opencode/sessions/[id]/messages `| `fetchFromOpencode("/session/:id/message")` | `client.session.messages({ path: { id } })` |

| `POST /api/opencode/sessions/[id]/messages `| `fetchFromOpencode("/session/:id/message", POST)` | `client.session.prompt({ path: { id }, body })` |

| `GET /api/opencode/agents` | `fetchFromOpencode("/agent")` | `client.app.agents()` |

| `GET /api/opencode/providers` | `fetchFromOpencode("/config/providers")` | `client.config.providers()` |

### 3. Refactor Server Tickets Module

Update `src/server/tickets/opencode.ts`:

- Import SDK types (`Session`, `Message`, `Part`) instead of manual definitions
- Replace all `fetchFromOpencode()` calls with SDK client methods
- Remove redundant type definitions (use SDK's generated types)

### 4. Preserve Redis Layer

The Redis pub/sub system serves a different purpose than the SDK:

- **SDK**: Communicates with opencode server (HTTP/SSE)
- **Redis**: Caches session state and broadcasts updates to connected UI clients

Keep the existing Redis implementation:

- `src/server/redis/index.ts` - Redis connection
- `src/server/tickets/session-state.ts` - Session state caching
- `src/app/api/opencode/sessions/[id]/stream/route.ts` - SSE to UI via Redis pub/sub

The SDK's `client.event.subscribe()` is NOT a replacement for Redis - it subscribes to opencode server events, while Redis broadcasts our backend's state changes to the UI.

### 5. Cleanup

- Remove `src/lib/opencode.ts` (the manual fetch wrapper)
- Remove manual type definitions from `src/server/tickets/opencode.ts` that now come from SDK

## Files to Modify

- `src/lib/opencode.ts` → Delete (replace with `src/lib/opencode-client.ts`)
- `src/server/tickets/opencode.ts` → Refactor to use SDK
- `src/app/api/opencode/sessions/route.ts` → Use SDK
- `src/app/api/opencode/sessions/[id]/messages/route.ts` → Use SDK
- `src/app/api/opencode/agents/route.ts` → Use SDK
- `src/app/api/opencode/providers/route.ts` → Use SDK
- `src/app/api/opencode/health/route.ts` → Use SDK
- `src/app/api/opencode/auth/route.ts` → Use SDK (if applicable)

### To-dos

- [ ] Create SDK client singleton in src/lib/opencode-client.ts
- [ ] Refactor /api/opencode/sessions route to use SDK
- [ ] Refactor /api/opencode/sessions/[id]/messages route to use SDK
- [ ] Refactor /api/opencode/agents route to use SDK
- [ ] Refactor /api/opencode/providers route to use SDK
- [ ] Refactor src/server/tickets/opencode.ts to use SDK and SDK types
- [ ] Remove src/lib/opencode.ts and update imports
- [ ] Run biome format