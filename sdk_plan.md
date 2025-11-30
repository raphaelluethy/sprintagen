# OpenCode SDK Integration Plan: Next.js Backend + Redis Storage

## Architecture Overview

This plan details how to integrate the opencode JS SDK into a Next.js backend with Redis persistence and real-time streaming to clients.

```
┌─────────────┐     HTTP/SSE      ┌──────────────┐     SDK      ┌──────────────┐
│  Frontend   │ ◄────────────────► │  Next.js API │ ◄───────────► │  OpenCode    │
│             │                    │   Routes     │              │   Server     │
└─────────────┘                    └──────┬───────┘              └──────────────┘
                                          │
                                          ▼
                                    ┌──────────┐
                                    │  Redis   │
                                    │   Store  │
                                    └──────────┘
```

**Data Flow:**

1. Frontend → Next.js API → OpenCode SDK (send prompts)
2. OpenCode SSE Events → Next.js → Redis (persist state)
3. Next.js SSE → Frontend (real-time streaming)

---

## Part 1: Next.js API Setup

### 1.1 Install Dependencies

```bash
bun add @opencode-ai/sdk
bun add ioredis  # Redis client
```

### 1.2 SDK Client Initialization

Create a singleton SDK client instance:

**File: `lib/opencode-client.ts`**

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk/client";
import type { OpencodeClient } from "@opencode-ai/sdk";

let client: OpencodeClient | null = null;

export function getOpencodeClient(directory?: string): OpencodeClient {
  if (!client) {
    client = createOpencodeClient({
      baseUrl: process.env.OPENCODE_SERVER_URL || "http://localhost:4096",
      directory: directory || process.env.OPENCODE_DEFAULT_DIRECTORY,
    });
  }
  return client;
}
```

**Environment Variables (.env.local):**

```
OPENCODE_SERVER_URL=http://localhost:4096
OPENCODE_DEFAULT_DIRECTORY=/path/to/your/project
REDIS_URL=redis://localhost:6379
```

---

## Part 2: Redis Storage Schema

### 2.1 Data Structure

Store data in Redis using the following key patterns:

```
sessions:{sessionID}           → Session object (JSON)
sessions:{sessionID}:messages  → Sorted set of message IDs (by timestamp)
messages:{messageID}           → Message object (JSON)
messages:{messageID}:parts     → Sorted set of part IDs (by ID)
parts:{partID}                 → Part object (JSON)
session:{sessionID}:status     → Session status (JSON)
session:{sessionID}:diff       → File diffs array (JSON)
session:{sessionID}:todo       → Todo list array (JSON)
sessions:list                  → Sorted set of all session IDs
```

### 2.2 Redis Client Setup

**File: `lib/redis-client.ts`**

```typescript
import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }
  return redis;
}

export class OpencodeRedisStore {
  private redis: Redis;

  constructor() {
    this.redis = getRedisClient();
  }

  // Session operations
  async saveSession(session: Session) {
    const key = `sessions:${session.id}`;
    await this.redis.set(key, JSON.stringify(session));
    await this.redis.zadd("sessions:list", session.time.created, session.id);
  }

  async getSession(sessionID: string): Promise<Session | null> {
    const data = await this.redis.get(`sessions:${sessionID}`);
    return data ? JSON.parse(data) : null;
  }

  async listSessions(limit = 10): Promise<Session[]> {
    const sessionIDs = await this.redis.zrevrange(
      "sessions:list",
      0,
      limit - 1,
    );
    const sessions = await Promise.all(
      sessionIDs.map((id) => this.getSession(id)),
    );
    return sessions.filter(Boolean) as Session[];
  }

  // Message operations
  async saveMessage(message: Message) {
    const key = `messages:${message.id}`;
    await this.redis.set(key, JSON.stringify(message));
    await this.redis.zadd(
      `sessions:${message.sessionID}:messages`,
      message.time.created,
      message.id,
    );
  }

  async getMessage(messageID: string): Promise<Message | null> {
    const data = await this.redis.get(`messages:${messageID}`);
    return data ? JSON.parse(data) : null;
  }

  async getSessionMessages(sessionID: string): Promise<Message[]> {
    const messageIDs = await this.redis.zrange(
      `sessions:${sessionID}:messages`,
      0,
      -1,
    );
    const messages = await Promise.all(
      messageIDs.map((id) => this.getMessage(id)),
    );
    return messages.filter(Boolean) as Message[];
  }

  // Part operations
  async savePart(part: Part) {
    const key = `parts:${part.id}`;
    await this.redis.set(key, JSON.stringify(part));
    await this.redis.zadd(
      `messages:${part.messageID}:parts`,
      parseInt(part.id), // Parts are sorted by ID
      part.id,
    );
  }

  async getPart(partID: string): Promise<Part | null> {
    const data = await this.redis.get(`parts:${partID}`);
    return data ? JSON.parse(data) : null;
  }

  async getMessageParts(messageID: string): Promise<Part[]> {
    const partIDs = await this.redis.zrange(
      `messages:${messageID}:parts`,
      0,
      -1,
    );
    const parts = await Promise.all(partIDs.map((id) => this.getPart(id)));
    return parts.filter(Boolean) as Part[];
  }

  // Session status
  async saveSessionStatus(sessionID: string, status: SessionStatus) {
    await this.redis.set(`session:${sessionID}:status`, JSON.stringify(status));
  }

  async getSessionStatus(sessionID: string): Promise<SessionStatus | null> {
    const data = await this.redis.get(`session:${sessionID}:status`);
    return data ? JSON.parse(data) : null;
  }

  // Session diffs
  async saveSessionDiff(sessionID: string, diff: FileDiff[]) {
    await this.redis.set(`session:${sessionID}:diff`, JSON.stringify(diff));
  }

  async getSessionDiff(sessionID: string): Promise<FileDiff[]> {
    const data = await this.redis.get(`session:${sessionID}:diff`);
    return data ? JSON.parse(data) : [];
  }

  // Todos
  async saveTodos(sessionID: string, todos: Todo[]) {
    await this.redis.set(`session:${sessionID}:todo`, JSON.stringify(todos));
  }

  async getTodos(sessionID: string): Promise<Todo[]> {
    const data = await this.redis.get(`session:${sessionID}:todo`);
    return data ? JSON.parse(data) : [];
  }
}
```

---

## Part 3: Event Streaming Service

### 3.1 Background Event Listener

Create a service that subscribes to opencode events and stores them in Redis.

**File: `lib/event-listener.ts`**

```typescript
import { getOpencodeClient } from "./opencode-client";
import { OpencodeRedisStore } from "./redis-client";
import type { Event } from "@opencode-ai/sdk";

export class OpencodeEventListener {
  private store: OpencodeRedisStore;
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor() {
    this.store = new OpencodeRedisStore();
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.abortController = new AbortController();

    const client = getOpencodeClient();

    try {
      const events = await client.event.subscribe();

      for await (const event of events.stream) {
        if (this.abortController.signal.aborted) break;
        await this.handleEvent(event);
      }
    } catch (error) {
      console.error("Event listener error:", error);
      // Implement retry logic here
    }
  }

  stop() {
    this.abortController?.abort();
    this.isRunning = false;
  }

  private async handleEvent(event: Event) {
    switch (event.type) {
      case "session.created":
      case "session.updated":
        await this.store.saveSession(event.properties.info);
        break;

      case "message.updated":
        await this.store.saveMessage(event.properties.info);
        break;

      case "message.part.updated":
        await this.store.savePart(event.properties.part);
        break;

      case "session.status":
        await this.store.saveSessionStatus(
          event.properties.sessionID,
          event.properties.status,
        );
        break;

      case "session.diff":
        await this.store.saveSessionDiff(
          event.properties.sessionID,
          event.properties.diff,
        );
        break;

      case "todo.updated":
        await this.store.saveTodos(
          event.properties.sessionID,
          event.properties.todos,
        );
        break;
    }
  }
}

// Singleton instance
let eventListener: OpencodeEventListener | null = null;

export function getEventListener(): OpencodeEventListener {
  if (!eventListener) {
    eventListener = new OpencodeEventListener();
    eventListener.start();
  }
  return eventListener;
}
```

### 3.2 Initialize Event Listener on Server Start

**File: `lib/init.ts`**

```typescript
import { getEventListener } from "./event-listener";

let initialized = false;

export function initializeServices() {
  if (initialized) return;

  // Start listening to opencode events
  getEventListener();

  initialized = true;
  console.log("OpenCode event listener started");
}
```

Call this in your Next.js app entry point or in middleware.

---

## Part 4: Next.js API Routes

### 4.1 Session Management API

**File: `app/api/sessions/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getOpencodeClient } from "@/lib/opencode-client";
import { OpencodeRedisStore } from "@/lib/redis-client";

const store = new OpencodeRedisStore();

// GET /api/sessions - List sessions
export async function GET(request: NextRequest) {
  try {
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");
    const sessions = await store.listSessions(limit);

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 },
    );
  }
}

// POST /api/sessions - Create new session
export async function POST(request: NextRequest) {
  try {
    const client = getOpencodeClient();
    const response = await client.session.create({
      body: await request.json(),
    });

    // Event listener will save to Redis automatically
    return NextResponse.json(response.data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}
```

**File: `app/api/sessions/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { OpencodeRedisStore } from "@/lib/redis-client";

const store = new OpencodeRedisStore();

// GET /api/sessions/:id - Get session details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await store.getSession(params.id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 },
    );
  }
}
```

### 4.2 Message API

**File: `app/api/sessions/[id]/messages/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getOpencodeClient } from "@/lib/opencode-client";
import { OpencodeRedisStore } from "@/lib/redis-client";

const store = new OpencodeRedisStore();

// GET /api/sessions/:id/messages - Get all messages
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const messages = await store.getSessionMessages(params.id);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

// POST /api/sessions/:id/messages - Send prompt
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const client = getOpencodeClient();
    const body = await request.json();

    const response = await client.session.prompt({
      path: { id: params.id },
      body: {
        parts: body.parts || [{ type: "text", text: body.text }],
        agent: body.agent,
        model: body.model,
      },
    });

    // Event listener will save to Redis automatically
    return NextResponse.json(response.data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
```

### 4.3 Parts API

**File: `app/api/messages/[id]/parts/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { OpencodeRedisStore } from "@/lib/redis-client";

const store = new OpencodeRedisStore();

// GET /api/messages/:id/parts - Get message parts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const parts = await store.getMessageParts(params.id);
    return NextResponse.json({ parts });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch parts" },
      { status: 500 },
    );
  }
}
```

### 4.4 Session Status & Metadata APIs

**File: `app/api/sessions/[id]/status/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { OpencodeRedisStore } from "@/lib/redis-client";

const store = new OpencodeRedisStore();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const status = await store.getSessionStatus(params.id);
    return NextResponse.json({ status: status || { type: "idle" } });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 },
    );
  }
}
```

**File: `app/api/sessions/[id]/diff/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { OpencodeRedisStore } from "@/lib/redis-client";

const store = new OpencodeRedisStore();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const diff = await store.getSessionDiff(params.id);
    return NextResponse.json({ diff });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch diff" },
      { status: 500 },
    );
  }
}
```

**File: `app/api/sessions/[id]/todos/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { OpencodeRedisStore } from "@/lib/redis-client";

const store = new OpencodeRedisStore();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const todos = await store.getTodos(params.id);
    return NextResponse.json({ todos });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch todos" },
      { status: 500 },
    );
  }
}
```

---

## Part 5: Real-Time Streaming to Frontend

### 5.1 SSE Endpoint for Real-Time Updates

Use Redis Pub/Sub to broadcast events to all connected clients.

**File: `lib/event-broadcaster.ts`**

```typescript
import { getRedisClient } from "./redis-client";
import type { Event } from "@opencode-ai/sdk";

export class EventBroadcaster {
  private redis = getRedisClient();
  private publishChannel = "opencode:events";

  async broadcast(event: Event) {
    await this.redis.publish(this.publishChannel, JSON.stringify(event));
  }

  subscribe(callback: (event: Event) => void) {
    const subscriber = getRedisClient().duplicate();

    subscriber.subscribe(this.publishChannel);

    subscriber.on("message", (channel, message) => {
      if (channel === this.publishChannel) {
        callback(JSON.parse(message));
      }
    });

    return () => subscriber.unsubscribe(this.publishChannel);
  }
}

let broadcaster: EventBroadcaster | null = null;

export function getEventBroadcaster(): EventBroadcaster {
  if (!broadcaster) {
    broadcaster = new EventBroadcaster();
  }
  return broadcaster;
}
```

**Update event-listener.ts to broadcast events:**

```typescript
private async handleEvent(event: Event) {
  // ... existing save logic ...

  // Broadcast to all connected clients
  const broadcaster = getEventBroadcaster()
  await broadcaster.broadcast(event)
}
```

### 5.2 SSE API Route

**File: `app/api/events/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { getEventBroadcaster } from "@/lib/event-broadcaster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const data = encoder.encode(
        `data: ${JSON.stringify({ type: "connected" })}\n\n`,
      );
      controller.enqueue(data);

      // Subscribe to events
      const broadcaster = getEventBroadcaster();
      const unsubscribe = broadcaster.subscribe((event) => {
        const sseData = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
      });

      // Clean up on client disconnect
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### 5.3 Session-Specific SSE Endpoint

For filtering events by session:

**File: `app/api/sessions/[id]/events/route.ts`**

```typescript
import { NextRequest } from "next/server";
import { getEventBroadcaster } from "@/lib/event-broadcaster";
import type { Event } from "@opencode-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const sessionID = params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const broadcaster = getEventBroadcaster();

      const unsubscribe = broadcaster.subscribe((event) => {
        // Filter events for this session
        const shouldSend = isEventForSession(event, sessionID);

        if (shouldSend) {
          const sseData = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        }
      });

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function isEventForSession(event: Event, sessionID: string): boolean {
  switch (event.type) {
    case "session.updated":
    case "session.created":
    case "session.deleted":
      return event.properties.info.id === sessionID;

    case "message.updated":
      return event.properties.info.sessionID === sessionID;

    case "message.part.updated":
      return event.properties.part.sessionID === sessionID;

    case "session.status":
    case "session.diff":
    case "todo.updated":
      return event.properties.sessionID === sessionID;

    default:
      return false;
  }
}
```

---

## Part 6: Frontend Integration (Client-Side)

### 6.1 Example Client Usage

```typescript
// Create a session
const response = await fetch("/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "My Session" }),
});
const session = await response.json();

// Subscribe to real-time events for this session
const eventSource = new EventSource(`/api/sessions/${session.id}/events`);

eventSource.addEventListener("message", (e) => {
  const event = JSON.parse(e.data);

  switch (event.type) {
    case "message.updated":
      // Update message in UI
      break;

    case "message.part.updated":
      // Update part in UI (tool call, text streaming, etc.)
      const part = event.properties.part;
      if (part.type === "tool") {
        // Display tool call
        console.log("Tool:", part.tool, part.state.status);
      }
      break;

    case "session.status":
      // Update session status (working/idle)
      const status = event.properties.status;
      console.log("Session status:", status.type);
      break;
  }
});

// Send a prompt
await fetch(`/api/sessions/${session.id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Write a hello world program",
  }),
});

// Real-time updates will come through the EventSource
```

### 6.2 React Hook Example

```typescript
import { useEffect, useState } from "react";
import type { Event, Part, Message, SessionStatus } from "@opencode-ai/sdk";

export function useSessionEvents(sessionID: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [parts, setParts] = useState<Record<string, Part[]>>({});
  const [status, setStatus] = useState<SessionStatus>({ type: "idle" });

  useEffect(() => {
    const eventSource = new EventSource(`/api/sessions/${sessionID}/events`);

    eventSource.addEventListener("message", (e) => {
      const event: Event = JSON.parse(e.data);

      switch (event.type) {
        case "message.updated":
          setMessages((prev) => {
            const existing = prev.findIndex(
              (m) => m.id === event.properties.info.id,
            );
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = event.properties.info;
              return updated;
            }
            return [...prev, event.properties.info];
          });
          break;

        case "message.part.updated":
          setParts((prev) => {
            const messageID = event.properties.part.messageID;
            const messageParts = prev[messageID] || [];
            const existing = messageParts.findIndex(
              (p) => p.id === event.properties.part.id,
            );

            if (existing >= 0) {
              const updated = [...messageParts];
              updated[existing] = event.properties.part;
              return { ...prev, [messageID]: updated };
            }

            return {
              ...prev,
              [messageID]: [...messageParts, event.properties.part],
            };
          });
          break;

        case "session.status":
          setStatus(event.properties.status);
          break;
      }
    });

    return () => eventSource.close();
  }, [sessionID]);

  return { messages, parts, status };
}
```

---

## Part 7: Displaying Tool Calls, Messages, and Responses

### 7.1 Understanding Data Structures

**Message Flow:**

```
User Message (role: "user")
  └─ Text Part (type: "text")

Assistant Message (role: "assistant")
  ├─ Reasoning Part (type: "reasoning")  [optional, extended thinking]
  ├─ Text Part (type: "text")
  ├─ Tool Part (type: "tool", tool: "read")
  │   └─ state: { status: "completed", input: {...}, output: "...", title: "..." }
  ├─ Tool Part (type: "tool", tool: "edit")
  └─ Text Part (type: "text")  [final response]
```

**Tool Part States:**

- `pending`: Tool call initiated, waiting to start
- `running`: Tool is executing (shows title, metadata)
- `completed`: Tool finished successfully (has output, title, metadata)
- `error`: Tool failed (has error message)

### 7.2 Rendering Logic

```typescript
function renderPart(part: Part) {
  switch (part.type) {
    case 'text':
      return <Markdown text={part.text} />

    case 'tool':
      return <ToolDisplay part={part} />

    case 'reasoning':
      return <ReasoningDisplay text={part.text} />

    default:
      return null
  }
}

function ToolDisplay({ part }: { part: ToolPart }) {
  const { tool, state } = part

  if (state.status === 'error') {
    return (
      <div className="tool-error">
        <span>❌ {tool} failed</span>
        <p>{state.error}</p>
      </div>
    )
  }

  if (state.status === 'completed') {
    return (
      <div className="tool-completed">
        <div className="tool-header">
          ✓ {state.title || tool}
        </div>
        {state.output && (
          <div className="tool-output">
            <pre>{state.output}</pre>
          </div>
        )}
      </div>
    )
  }

  if (state.status === 'running') {
    return (
      <div className="tool-running">
        ⏳ {state.title || `Running ${tool}...`}
      </div>
    )
  }

  return null
}
```

### 7.3 Display Progress Indicator

```typescript
function SessionProgress({
  status,
  parts
}: {
  status: SessionStatus
  parts: Part[]
}) {
  const isWorking = status.type !== 'idle'
  const lastPart = parts[parts.length - 1]

  const statusText = (() => {
    if (!lastPart) return 'Thinking...'

    if (lastPart.type === 'tool' && lastPart.state.status === 'running') {
      return lastPart.state.title || `Running ${lastPart.tool}...`
    }

    if (lastPart.type === 'reasoning') return 'Thinking...'

    return 'Working...'
  })()

  if (!isWorking) return null

  return (
    <div className="progress">
      <Spinner />
      <span>{statusText}</span>
    </div>
  )
}
```

---

## Part 8: Implementation Checklist

### Phase 1: Core Setup

- [ ] Install dependencies (`@opencode-ai/sdk`, `ioredis`)
- [ ] Create SDK client singleton (`lib/opencode-client.ts`)
- [ ] Create Redis client and store (`lib/redis-client.ts`)
- [ ] Set up environment variables

### Phase 2: Event System

- [ ] Implement event listener service (`lib/event-listener.ts`)
- [ ] Implement event broadcaster with Redis Pub/Sub (`lib/event-broadcaster.ts`)
- [ ] Initialize services on server start (`lib/init.ts`)

### Phase 3: API Routes

- [ ] Session CRUD routes (`/api/sessions`)
- [ ] Message routes (`/api/sessions/[id]/messages`)
- [ ] Parts route (`/api/messages/[id]/parts`)
- [ ] Status/diff/todos routes
- [ ] SSE endpoints (`/api/events`, `/api/sessions/[id]/events`)

### Phase 4: Frontend Integration

- [ ] Create client-side hooks for SSE consumption
- [ ] Implement message rendering components
- [ ] Implement tool rendering components
- [ ] Add progress indicators

### Phase 5: Testing

- [ ] Test session creation and message sending
- [ ] Test real-time event streaming
- [ ] Test Redis persistence and retrieval
- [ ] Test tool call display
- [ ] Test error handling

---

## Key Implementation Insights

### 1. Event-Driven Architecture

The opencode SDK uses Server-Sent Events (SSE) for all real-time updates. Your Next.js backend acts as a proxy, subscribing to opencode events and re-broadcasting them to frontend clients via Redis Pub/Sub.

### 2. Data Persistence Strategy

Redis is used as a cache layer, storing the current state of all sessions, messages, and parts. The event listener automatically updates Redis whenever opencode emits events, ensuring data consistency.

### 3. Binary Search Pattern

The original implementation uses binary search for efficient updates in sorted arrays. In your Redis implementation, sorted sets (`ZADD`, `ZRANGE`) provide similar O(log n) performance.

### 4. Tool State Machine

Tool parts progress through states: `pending` → `running` → `completed`/`error`. Your UI should handle all states gracefully, showing loading indicators for running tools and error messages for failed ones.

### 5. Message Streaming

Text parts may include a `delta` field in `message.part.updated` events for streaming text. Handle this by appending deltas to existing text content.

---

## Critical Files for Reference

1. **`packages/sdk/js/src/client.ts`** - SDK client creation pattern
2. **`packages/sdk/js/src/gen/types.gen.ts`** - Complete type definitions (3000+ lines)
3. **`packages/sdk/js/src/gen/core/serverSentEvents.gen.ts`** - SSE implementation reference
4. **`packages/desktop/src/context/global-sync.tsx`** - Event handling with binary search + reconcile pattern

---

## Environment Variables Summary

```env
# OpenCode Server
OPENCODE_SERVER_URL=http://localhost:4096
OPENCODE_DEFAULT_DIRECTORY=/path/to/project

# Redis
REDIS_URL=redis://localhost:6379
```

---

## Next Steps After Implementation

1. **Add authentication**: Secure your API routes
2. **Add rate limiting**: Prevent abuse of SSE endpoints
3. **Add session cleanup**: Expire old sessions in Redis
4. **Add error recovery**: Handle SDK disconnections and retry
5. **Add caching**: Cache frequently accessed sessions/messages
6. **Add monitoring**: Track event throughput and Redis memory usage
