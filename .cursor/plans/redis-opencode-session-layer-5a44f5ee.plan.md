<!-- 5a44f5ee-9d2a-4d6d-87ab-e0e14fb03763 bd015292-7631-4de8-a682-d6d23ed21201 -->
# Redis OpenCode Session Layer

## Overview

Add Redis as a real-time cache for in-progress OpenCode sessions. The backend becomes the "owner" of the OpenCode polling loop, updates Redis with progress, and pushes updates to the frontend via SSE. Completed sessions are archived to PostgreSQL.

## 1. Docker Compose - Add Redis

Add Redis service to `docker-compose.yml`:

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  networks:
    - sprintagen-network
```

Update `web` service to depend on Redis.

## 2. Environment Configuration

Add to `src/env.js`:

- `REDIS_URL` (default: `redis://redis:6379` for Docker, `redis://localhost:6379` for local dev)

## 3. Database Schema - Session Persistence

Create new table in `src/server/db/schema.ts`:

```typescript
export const opencodeSessionsTable = pgTable("opencode_sessions", {
  id: varchar("id", { length: 255 }).primaryKey(), // OpenCode session ID
  ticketId: varchar("ticket_id", { length: 255 }).references(() => tickets.id),
  sessionType: varchar("session_type", { length: 50 }).notNull(), // "chat" | "ask" | "admin"
  status: varchar("status", { length: 50 }).notNull(), // "pending" | "running" | "completed" | "error"
  messages: jsonb("messages").default([]), // Archived message array
  metadata: jsonb("metadata"), // Additional context (prompt, ticket title, etc.)
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
});
```

Add migration via `drizzle-kit generate`.

## 4. Redis Client Setup (ioredis)

Install ioredis: `pnpm add ioredis`

Create `src/server/redis/index.ts`:

```typescript
import Redis from "ioredis";
import { env } from "@/env";

// Main client for commands
export const redis = new Redis(env.REDIS_URL);

// Separate client for pub/sub (ioredis requires dedicated connection for subscriptions)
export const redisSub = new Redis(env.REDIS_URL);

// Typed helpers
export const RedisKeys = {
  session: (id: string) => `opencode:session:${id}`,
  activeSession: (ticketId: string) => `opencode:ticket:${ticketId}:active`,
  updates: (sessionId: string) => `opencode:updates:${sessionId}`,
} as const;
```

- Use ioredis for both commands and pub/sub
- Separate Redis instances for pub/sub (ioredis requirement)
- Key structure: `opencode:session:{sessionId}` for session state
- Key structure: `opencode:ticket:{ticketId}:active` for active session lookup
- Channel: `opencode:updates:{sessionId}` for pub/sub notifications

## 5. Session State Service

Create `src/server/tickets/session-state.ts`:

**Redis Session Schema:**

```typescript
interface RedisSessionState {
  sessionId: string;
  ticketId?: string;
  sessionType: "chat" | "ask" | "admin";
  status: "pending" | "running" | "completed" | "error";
  messages: OpencodeChatMessage[];
  currentToolCalls: ToolPart[];
  error?: string;
  startedAt: number;
  updatedAt: number;
}
```

**Key Functions:**

- `createPendingSession()` - Create Redis entry when session starts
- `updateSessionState()` - Update Redis with new messages/tool calls
- `completeSession()` - Mark complete, archive to PostgreSQL, clean Redis
- `getActiveSession()` - Check Redis for active session by ticketId
- `getSessionState()` - Get current state from Redis

## 6. Background Polling Service

Create `src/server/tickets/opencode-poller.ts`:

- When a session is created, spawn background polling loop
- Poll OpenCode `/session/{id}/message` endpoint every 500ms
- Parse new messages/tool calls and update Redis
- Detect completion (assistant message without pending tools)
- On completion: archive to PostgreSQL, emit final SSE event, cleanup Redis
- Handle errors gracefully with retry logic

## 7. SSE Endpoint

Create `src/app/api/opencode/sessions/[id]/stream/route.ts`:

```typescript
export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Return SSE stream that:
  // 1. Subscribes to Redis pub/sub channel for this session
  // 2. Sends initial state immediately
  // 3. Pushes updates as they arrive
  // 4. Closes when session completes
}
```

Use Redis pub/sub: publish to `opencode:updates:{sessionId}` channel on state changes.

## 8. Updated tRPC Endpoints

Modify `src/server/api/routers/ticket.ts`:

**startOpencodeSession:**

- Create session in OpenCode
- Create pending entry in Redis
- Start background poller
- Return sessionId immediately (non-blocking)

**getOpencodeChat:**

- First check Redis for active session
- If active: return current state from Redis
- If not active: check PostgreSQL for historical session data

**sendOpencodeChatMessage:**

- Send message to OpenCode
- Update Redis state
- Poller will handle response updates

**askOpencode:**

- Create session, send prompt, return sessionId immediately
- Poller handles updates and completion

**New: getSessionHistory:**

- Fetch all completed sessions for a ticket from PostgreSQL

## 9. Frontend - SSE Hook

Create `src/hooks/useOpencodeStream.ts`:

```typescript
export function useOpencodeStream(sessionId: string | null) {
  // Connect to SSE endpoint when sessionId is set
  // Return: { messages, toolCalls, status, error }
  // Auto-reconnect on disconnect
  // Cleanup on unmount
}
```

## 10. Frontend - UI Updates

### Ticket Modal (`ticket-modal.tsx`):

**Opencode Tab:**

- Use `useOpencodeStream` for real-time updates
- Show session history list above current chat
- Click historical session to load from PostgreSQL
- Visual indicator for "live" vs "historical" sessions

**Ask Opencode Button:**

- Call `askOpencode` mutation (now non-blocking)
- Subscribe to SSE stream for progress
- Show `LiveAnalysisProgress` with real tool calls from SSE
- User can close modal and re-open without losing progress

### Admin Chats Page (`admin/chats/page.tsx`):

- Use SSE for active sessions
- Show historical sessions from PostgreSQL
- Same pattern as ticket modal

## 11. Session Recovery

When frontend opens a ticket/chat:

1. Call `getActiveSession(ticketId)` to check Redis
2. If active session exists, reconnect to SSE stream
3. If no active session, show historical sessions from PostgreSQL
4. User sees "Resuming session..." if reconnecting to active

## Architecture Flow

```
Frontend                Backend                    Redis                 OpenCode
   |                       |                         |                      |
   |--startSession-------->|                         |                      |
   |                       |--create session-------->|                      |
   |                       |                         |--POST /session------>|
   |                       |<--sessionId-------------|<--sessionId----------|
   |<--sessionId-----------|                         |                      |
   |                       |                         |                      |
   |--connect SSE--------->|                         |                      |
   |                       |--subscribe pubsub------>|                      |
   |                       |                         |                      |
   |                       |~~poll loop starts~~~~~~~|                      |
   |                       |                         |--GET /message------->|
   |                       |                         |<--messages-----------|
   |                       |--update state---------->|                      |
   |                       |--publish update-------->|                      |
   |<--SSE: new message----|<--pubsub notification---|                      |
   |                       |                         |                      |
   |                       |~~on completion~~~~~~~~~~|                      |
   |                       |--archive to PostgreSQL--|                      |
   |<--SSE: complete-------|--cleanup Redis--------->|                      |
```

## File Changes Summary

| File | Change |

|------|--------|

| `docker-compose.yml` | Add Redis service |

| `src/env.js` | Add REDIS_URL |

| `src/server/db/schema.ts` | Add opencode_sessions table |

| `drizzle/*.sql` | New migration |

| `src/server/redis/index.ts` | New: Redis client |

| `src/server/tickets/session-state.ts` | New: Session state management |

| `src/server/tickets/opencode-poller.ts` | New: Background polling |

| `src/server/tickets/opencode.ts` | Refactor to use session state |

| `src/server/api/routers/ticket.ts` | Update endpoints |

| `src/app/api/opencode/sessions/[id]/stream/route.ts` | New: SSE endpoint |

| `src/hooks/useOpencodeStream.ts` | New: SSE hook |

| `src/app/_components/ticket-modal.tsx` | Use SSE, show history |

| `src/app/admin/chats/page.tsx` | Use SSE, show history |