---
name: SDK Event-Driven Refactor
overview: Replace the polling-based OpenCode integration with an event-driven architecture using the SDK's native SSE subscription (`client.global.event()`), updating the Redis store and API routes to handle real-time events.
todos:
  - id: event-listener
    content: Create opencode-event-listener.ts - subscribes to client.global.event() SSE stream
    status: completed
  - id: redis-store
    content: Create opencode-store.ts - Redis storage with sorted sets for messages/parts
    status: completed
  - id: trpc-router
    content: Create opencode.ts tRPC router with queries, mutations
    status: completed
  - id: wire-up
    content: Add opencode router to root.ts
    status: completed
  - id: update-stream-hook
    content: Update useOpencodeStream.ts to handle SDK event types
    status: completed
  - id: update-sse-endpoint
    content: Update SSE stream endpoint to use new store
    status: completed
  - id: cleanup-poller
    content: Remove opencode-poller.ts after migration is complete
    status: pending
---

# SDK Event-Driven Refactor

Replace the current polling approach (`opencode-poller.ts`) with the SDK's native SSE event subscription for real-time updates.

## Architecture

```
┌─────────────┐  tRPC subscription  ┌──────────────┐  Redis Pub/Sub  ┌──────────────┐
│  Frontend   │ ◄──────────────────► │  tRPC Router │ ◄──────────────► │    Redis     │
└─────────────┘                      └──────┬───────┘                  └──────────────┘
                                            │                                 ▲
                                            │ SDK calls                       │ Store events
                                            ▼                                 │
                                     ┌──────────────┐  SSE subscription ┌─────┴────────┐
                                     │   OpenCode   │ ─────────────────► │ Event        │
                                     │   Server     │                    │ Listener     │
                                     └──────────────┘                    └──────────────┘
```

## Key Changes

### 1. Create Event Listener Service

**File: `src/lib/opencode-event-listener.ts`**

Singleton service that subscribes to OpenCode's native SSE via `client.global.event()`:

```typescript
const events = await client.global.event();
for await (const { directory, payload } of events.stream) {
  // Store in Redis + publish to pub/sub channel
  await store.handleEvent(payload);
  await redis.publish(`opencode:session:${sessionId}:events`, JSON.stringify(payload));
}
```

### 2. Create OpenCode tRPC Router

**File: `src/server/api/routers/opencode.ts`** (new)

Single router with all OpenCode operations:

```typescript
export const opencodeRouter = createTRPCRouter({
  // Queries
  getSession: publicProcedure.input(...).query(...),
  getMessages: publicProcedure.input(...).query(...),
  getStatus: publicProcedure.input(...).query(...),
  
  // Mutations  
  createSession: publicProcedure.input(...).mutation(...),
  sendPrompt: publicProcedure.input(...).mutation(...),
  
  // Subscription - streams all events for a session
  onSessionEvents: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .subscription(async function* ({ input }) {
      // Subscribe to Redis pub/sub channel
      // Yield events as they arrive
    }),
});
```

### 3. Update Redis Store

**File: `src/server/redis/opencode-store.ts`** (new)

Redis storage that handles SDK event types and stores session state:

```typescript
export class OpencodeRedisStore {
  async handleEvent(event: Event) {
    switch (event.type) {
      case "session.updated": ...
      case "message.updated": ...
      case "message.part.updated": ...
      case "session.status": ...
    }
  }
  
  async getSession(id: string): Promise<Session | null>
  async getMessages(sessionId: string): Promise<Message[]>
  async getStatus(sessionId: string): Promise<SessionStatus>
}
```

### 4. Update Frontend to Use tRPC Subscription

Replace `useOpencodeStream` hook with tRPC subscription:

```typescript
const { data } = api.opencode.onSessionEvents.useSubscription(
  { sessionId },
  { onData: (event) => updateLocalState(event) }
);
```

### 5. Delete Legacy Code

- Remove `src/server/tickets/opencode-poller.ts` (replaced by event listener)
- Remove REST endpoints under `src/app/api/opencode/` (replaced by tRPC)
- Remove `src/hooks/useOpencodeStream.ts` (replaced by tRPC subscription)

## Files to Create

- `src/lib/opencode-event-listener.ts` - SDK SSE subscription service
- `src/server/redis/opencode-store.ts` - Redis storage for SDK events
- `src/server/api/routers/opencode.ts` - tRPC router with subscription

## Files to Modify

- `src/server/api/root.ts` - Add opencode router
- `src/server/api/routers/ticket.ts` - Remove OpenCode procedures (move to opencode router)
- `src/server/redis/index.ts` - Add new Redis key patterns

## Files to Delete (after migration)

- `src/server/tickets/opencode-poller.ts`
- `src/app/api/opencode/` (entire directory)
- `src/hooks/useOpencodeStream.ts`

## Implementation Order

1. **Create Redis Store** (`opencode-store.ts`)

   - Define Redis key patterns for sessions, messages, parts, status
   - Implement `handleEvent()` to process SDK event types
   - Implement getters: `getSession`, `getMessages`, `getStatus`, `getDiff`, `getTodos`

2. **Create Event Listener** (`opencode-event-listener.ts`)

   - Singleton service subscribing to `client.global.event()`
   - On each event: store in Redis + publish to pub/sub channel
   - Auto-reconnect on disconnect

3. **Create tRPC Router** (`opencode.ts`)

   - Queries: `health`, `getAgents`, `getProviders`, `listSessions`, `getSession`, `getMessages`, `getStatus`
   - Mutations: `createSession`, `sendPrompt`, `askOpencode`
   - Subscription: `onSessionEvents` - yields events from Redis pub/sub

4. **Wire Up**

   - Add router to `root.ts`
   - Start event listener on server init
   - Remove OpenCode procedures from `ticket.ts`

5. **Update Frontend**

   - Replace `useOpencodeStream` with `api.opencode.onSessionEvents.useSubscription()`

6. **Cleanup**

   - Delete legacy files