---
name: OpenCode SDK Upgrade & SSE Migration
overview: Upgrade @opencode-ai/sdk from v1.0.164 to v1.0.215 and migrate from polling-based updates to real-time SSE event streaming for both "Ask OpenCode" analysis and Agent chat functionality.
todos:
  - id: upgrade-sdk
    content: Update package.json to @opencode-ai/sdk ^1.0.215 and verify types
    status: pending
    priority: high
  - id: create-sse-route
    content: Create /api/opencode/events SSE endpoint with proper cleanup
    status: pending
    priority: high
  - id: event-filter-util
    content: Create utility to filter events by sessionId
    status: pending
    priority: high
  - id: create-sse-hook
    content: Create useOpencodeSSE hook with error states and reconnection
    status: pending
    priority: high
  - id: update-ticket-modal
    content: Update ticket-modal.tsx to use SSE instead of polling
    status: pending
    priority: medium
  - id: update-agent-tab
    content: Update ticket-agent-tab.tsx to use SSE for real-time chat
    status: pending
    priority: medium
  - id: add-error-boundaries
    content: Add error boundaries for SSE connection failures
    status: pending
    priority: medium
  - id: deprecate-polling
    content: Remove useOpencodeStream polling hook and cleanup
    status: pending
    priority: low
  - id: integration-test
    content: Test SSE with Ask OpenCode and Agent chat flows
    status: pending
    priority: high
  - id: update-docs
    content: Update sdk_docs.md and sdk_plan.md with SSE implementation
    status: pending
    priority: low
---

# OpenCode SDK Upgrade & SSE Migration Plan

## Overview

This plan covers two major changes:
1. **SDK Upgrade**: Update from `@opencode-ai/sdk ^1.0.164` to `^1.0.215` (latest)
2. **SSE Migration**: Replace polling-based updates with real-time Server-Sent Events

## Goals

- ✅ Real-time updates for "Ask OpenCode" tool progress
- ✅ Real-time updates for Agent chat messages
- ✅ Proper error states when SSE connection fails
- ✅ Better session synchronization (fix previous SSE breakage)
- ✅ Remove polling to reduce server load

## Previous SSE Issue Analysis

**Problem**: "it just did not sync the sessions well"

**Root Causes Identified**:
1. No session-specific filtering - all events were processed regardless of sessionId
2. React lifecycle issues - SSE connections not properly cleaned up on modal close
3. State synchronization - multiple sources of truth (polling + events)
4. Missing AbortController cleanup in useEffect returns

**Solutions**:
1. Filter events by sessionId on both server and client
2. Proper AbortController usage with cleanup
3. Single source of truth (SSE only, no polling fallback)
4. Error boundaries with clear error states

---

## Architecture

### Current (Polling)
```
┌─────────────────┐     tRPC Query (1s poll)     ┌──────────────────┐
│  ticket-modal   │ ────────────────────────────► │  opencode.ts     │
│  useOpencodeStream()                           │  router          │
└─────────────────┘                              └────────┬─────────┘
                                                          │ SDK calls
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  OpenCode Server │
                                                 └──────────────────┘
```

### New (SSE)
```
┌─────────────────┐     EventSource SSE          ┌──────────────────┐
│  ticket-modal   │ ◄──────────────────────────  │  /api/opencode/  │
│  useOpencodeSSE()                              │  events/route.ts │
└─────────────────┘                              └────────┬─────────┘
                                                          │ SDK SSE
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  OpenCode Server │
                                                 │  client.event.subscribe()
                                                 └──────────────────┘
```

---

## Phase 1: SDK Upgrade

### 1.1 Update Package Version

**File**: `package.json`

```diff
- "@opencode-ai/sdk": "^1.0.164",
+ "@opencode-ai/sdk": "^1.0.215",
```

**Commands**:
```bash
bun install
bun run typecheck
```

### 1.2 Verify Type Compatibility

**Files to check**:
- `src/lib/opencode-utils.ts` - ToolState interfaces
- `src/server/opencode/message-utils.ts` - Part type handling
- `src/hooks/useOpencodeStream.ts` - SessionStatus type
- `src/server/tickets/opencode.ts` - All SDK type usage

**Expected changes**: None (SDK API is stable between v1.0.164 → v1.0.215)

---

## Phase 2: SSE Infrastructure

### 2.1 Create Event Filter Utility

**New file**: `src/lib/opencode-event-filters.ts`

```typescript
import type { Event } from "@opencode-ai/sdk";

/**
 * Check if an event belongs to a specific session
 */
export function isEventForSession(event: Event, sessionId: string): boolean {
  switch (event.type) {
    case "session.created":
    case "session.updated":
    case "session.deleted":
      return event.properties.info.id === sessionId;

    case "message.updated":
    case "message.removed":
      return event.properties.info.sessionID === sessionId;

    case "message.part.updated":
    case "message.part.removed":
      return event.properties.part.sessionID === sessionId;

    case "session.status":
    case "session.idle":
    case "session.diff":
    case "session.error":
    case "todo.updated":
      return event.properties.sessionID === sessionId;

    default:
      return false;
  }
}
```

### 2.2 Create SSE API Route

**New file**: `src/app/api/opencode/events/route.ts`

```typescript
import { getOpencodeClient } from "@/lib/opencode-client";
import { isEventForSession } from "@/lib/opencode-event-filters";
import type { Event } from "@opencode-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint for real-time OpenCode events
 * Usage: /api/opencode/events?sessionId=xxx
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId query parameter", { status: 400 });
  }

  const client = getOpencodeClient();
  const encoder = new TextEncoder();
  
  console.log(`[SSE] Starting event stream for session ${sessionId}`);

  const stream = new ReadableStream({
    async start(controller) {
      const abortController = new AbortController();
      
      // Cleanup when client disconnects
      request.signal.addEventListener("abort", () => {
        console.log(`[SSE] Client disconnected from session ${sessionId}`);
        abortController.abort();
      });

      try {
        // Send initial connection event
        const connectEvent = `data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`;
        controller.enqueue(encoder.encode(connectEvent));

        // Subscribe to OpenCode events
        const events = await client.event.subscribe({
          signal: abortController.signal,
          onSseError: (error) => {
            console.error(`[SSE] Stream error for session ${sessionId}:`, error);
          },
        });

        // Stream events filtered by sessionId
        for await (const event of events.stream) {
          if (abortController.signal.aborted) break;
          
          // Filter events for this session
          if (!isEventForSession(event, sessionId)) {
            continue;
          }

          // Send event to client
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
          
          // Debug logging
          if (event.type === "message.part.updated" && event.properties.part.type === "tool") {
            console.log(`[SSE] Tool event for ${sessionId}:`, event.properties.part.tool, event.properties.part.state.status);
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(`[SSE] Fatal error for session ${sessionId}:`, error);
          const errorEvent = `data: ${JSON.stringify({ type: "error", error: String(error) })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        }
      } finally {
        console.log(`[SSE] Closing stream for session ${sessionId}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
```

### 2.3 Create SSE React Hook

**New file**: `src/hooks/useOpencodeSSE.ts`

```typescript
import type { Event, Message, Part, SessionStatus, ToolPart } from "@opencode-ai/sdk";
import { useCallback, useEffect, useRef, useState } from "react";

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface UseOpencodeSSEResult {
  messages: MessageWithParts[];
  toolCalls: ToolPart[];
  status: "pending" | "running" | "completed" | "error";
  sessionStatus: SessionStatus;
  error: string | null;
  isConnected: boolean;
  connectionState: "connecting" | "connected" | "disconnected" | "error";
}

/**
 * Hook for real-time OpenCode session updates via SSE
 * Replaces useOpencodeStream polling hook
 */
export function useOpencodeSSE(
  sessionId: string | null,
  enabled: boolean = true,
): UseOpencodeSSEResult {
  // State for messages and parts
  const [messagesMap, setMessagesMap] = useState<Map<string, Message>>(new Map());
  const [partsMap, setPartsMap] = useState<Map<string, Part[]>>(new Map());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ type: "idle" });
  
  // Connection state
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "disconnected" | "error">("disconnected");
  const [error, setError] = useState<string | null>(null);
  
  // EventSource ref
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      console.log(`[useOpencodeSSE] Closing EventSource for session ${sessionId}`);
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  }, [sessionId]);

  const connect = useCallback(() => {
    if (!sessionId || !enabled) return;
    
    cleanup();
    
    setConnectionState("connecting");
    setError(null);
    
    const url = `/api/opencode/events?sessionId=${encodeURIComponent(sessionId)}`;
    console.log(`[useOpencodeSSE] Connecting to ${url}`);
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[useOpencodeSSE] Connected to session ${sessionId}`);
      setConnectionState("connected");
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as Event | { type: "connected"; sessionId: string };
        
        if (event.type === "connected") {
          console.log(`[useOpencodeSSE] Received connection confirmation`);
          return;
        }

        // Handle OpenCode events
        handleEvent(event as Event);
      } catch (err) {
        console.error(`[useOpencodeSSE] Failed to parse event:`, err);
      }
    };

    eventSource.onerror = (e) => {
      console.error(`[useOpencodeSSE] EventSource error for session ${sessionId}:`, e);
      setConnectionState("error");
      setError("Connection lost");
      
      // Exponential backoff reconnection
      const maxAttempts = 5;
      if (reconnectAttemptsRef.current < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        console.log(`[useOpencodeSSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      } else {
        console.error(`[useOpencodeSSE] Max reconnection attempts reached`);
        cleanup();
      }
    };
  }, [sessionId, enabled, cleanup]);

  const handleEvent = useCallback((event: Event) => {
    switch (event.type) {
      case "message.updated": {
        const msg = event.properties.info;
        setMessagesMap((prev) => {
          const next = new Map(prev);
          next.set(msg.id, msg);
          return next;
        });
        break;
      }

      case "message.part.updated": {
        const part = event.properties.part;
        setPartsMap((prev) => {
          const next = new Map(prev);
          const existing = next.get(part.messageID) ?? [];
          const idx = existing.findIndex((p) => p.id === part.id);
          
          if (idx >= 0) {
            // Update existing part
            const updated = [...existing];
            updated[idx] = part;
            next.set(part.messageID, updated);
          } else {
            // Add new part
            next.set(part.messageID, [...existing, part]);
          }
          return next;
        });
        break;
      }

      case "session.status": {
        setSessionStatus(event.properties.status);
        break;
      }

      case "session.idle": {
        setSessionStatus({ type: "idle" });
        break;
      }

      case "session.error": {
        setError(event.properties.error ?? "Session error");
        break;
      }

      default:
        // Ignore other event types
        break;
    }
  }, []);

  // Connect when sessionId changes
  useEffect(() => {
    if (sessionId && enabled) {
      connect();
    } else {
      cleanup();
      setConnectionState("disconnected");
    }

    return cleanup;
  }, [sessionId, enabled, connect, cleanup]);

  // Derive messages with parts
  const messages: MessageWithParts[] = Array.from(messagesMap.values())
    .sort((a, b) => {
      const aTime = (a.time as any)?.created ?? 0;
      const bTime = (b.time as any)?.created ?? 0;
      return aTime - bTime;
    })
    .map((info) => ({
      info,
      parts: partsMap.get(info.id) ?? [],
    }));

  // Extract tool calls from all parts
  const toolCalls: ToolPart[] = messages.flatMap((m) =>
    m.parts.filter((p): p is ToolPart => p.type === "tool")
  );

  // Derive legacy status
  const status: "pending" | "running" | "completed" | "error" = (() => {
    if (error) return "error";
    if (connectionState === "connecting") return "pending";
    
    switch (sessionStatus.type) {
      case "busy":
      case "retry":
        return "running";
      case "idle":
        return messages.length > 0 ? "completed" : "pending";
      default:
        return "pending";
    }
  })();

  return {
    messages,
    toolCalls,
    status,
    sessionStatus,
    error,
    isConnected: connectionState === "connected",
    connectionState,
  };
}
```

---

## Phase 3: Update UI Components

### 3.1 Update Ticket Modal

**File**: `src/app/_components/ticket-modal.tsx`

**Changes**:
1. Replace `useOpencodeStream` with `useOpencodeSSE`
2. Add error state UI
3. Update prop passing

```diff
- import { useOpencodeStream } from "@/hooks/useOpencodeStream";
+ import { useOpencodeSSE } from "@/hooks/useOpencodeSSE";

  // Get the pending session ID for this ticket (if any)
  const pendingSessionId = ticket?.id ? getPendingSessionId(ticket.id) : null;

- // Connect to SSE stream for live updates when there's a pending session
- const sseStream = useOpencodeStream(open ? pendingSessionId : null);
+ // Connect to SSE stream for live updates when there's a pending session
+ const sseStream = useOpencodeSSE(pendingSessionId, open && !!pendingSessionId);

+ // Show error toast if SSE connection fails
+ useEffect(() => {
+   if (sseStream.error && sseStream.connectionState === "error") {
+     // TODO: Add toast notification
+     console.error("OpenCode connection error:", sseStream.error);
+   }
+ }, [sseStream.error, sseStream.connectionState]);
```

### 3.2 Update Agent Tab

**File**: `src/app/_components/ticket-agent-tab.tsx`

**Changes**:
1. Remove `refetchInterval` polling logic
2. Use SSE hook for real-time updates
3. Add connection status indicator

```diff
  const opencodeChatQuery = api.ticket.getOpencodeChat.useQuery(
    {
      ticketId,
      sessionId: opencodeChatSessionId ?? undefined,
    },
    {
      enabled:
        !!ticketId &&
        open &&
        activeTab === "agent-chat" &&
        !!opencodeChatSessionId,
-     refetchInterval: (query) => {
-       const data = query.state.data;
-       if (!data) return 1000;
-       const isSessionActive = data.status?.type !== "idle";
-       const hasRunningTools = data.toolCalls?.some(
-         (t) => t.state.status === "pending" || t.state.status === "running",
-       );
-       return isSessionActive || hasRunningTools ? 1000 : false;
-     },
    },
  );

+ // SSE connection for real-time updates
+ const sseConnection = useOpencodeSSE(
+   opencodeChatSessionId,
+   open && activeTab === "agent-chat"
+ );

+ // Show connection status
+ {sseConnection.connectionState === "error" && (
+   <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
+     Connection lost. Retrying...
+   </div>
+ )}
```

### 3.3 Add Error Boundary

**New file**: `src/components/opencode-error-boundary.tsx`

```typescript
"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class OpencodeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[OpencodeErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <div className="rounded-full bg-destructive/10 p-3">
              <svg
                className="h-6 w-6 text-destructive"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Agent Connection Error</h3>
              <p className="text-muted-foreground text-sm">
                {this.state.error?.message ?? "Failed to connect to OpenCode"}
              </p>
            </div>
            <Button
              onClick={() => this.setState({ hasError: false, error: null })}
              variant="outline"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
```

**Wrap components**:
```tsx
// In ticket-modal.tsx
<OpencodeErrorBoundary>
  <TicketAgentTab {...props} />
</OpencodeErrorBoundary>
```

---

## Phase 4: Testing & Cleanup

### 4.1 Integration Tests

**Test scenarios**:

1. **Ask OpenCode Flow**
   - [ ] Click "Ask OpenCode" button
   - [ ] Verify SSE connection established
   - [ ] Verify tool calls appear in real-time
   - [ ] Verify session completes and polling stops
   - [ ] Verify proper cleanup on modal close

2. **Agent Chat Flow**
   - [ ] Open Agent tab
   - [ ] Send a message
   - [ ] Verify real-time message streaming
   - [ ] Verify tool calls update live
   - [ ] Switch tabs and verify connection persists

3. **Error Handling**
   - [ ] Stop OpenCode server
   - [ ] Verify error state displays
   - [ ] Restart server
   - [ ] Verify reconnection works
   - [ ] Verify exponential backoff

4. **Session Synchronization**
   - [ ] Open same ticket in two browser tabs
   - [ ] Send message in one tab
   - [ ] Verify both tabs update (if applicable)
   - [ ] Close one tab, verify other continues

### 4.2 Deprecate Polling Hook

**File**: `src/hooks/useOpencodeStream.ts`

```diff
+ /**
+  * @deprecated Use useOpencodeSSE instead for real-time updates
+  * This polling-based hook is kept for backward compatibility only
+  */
  export function useOpencodeStream(sessionId: string | null) {
+   console.warn("useOpencodeStream is deprecated. Use useOpencodeSSE instead.");
    // ... existing implementation
  }
```

**After verification, delete**:
- `src/hooks/useOpencodeStream.ts`

### 4.3 Update Documentation

**Files to update**:
- `sdk_docs.md` - Add SSE section with code examples
- `sdk_plan.md` - Mark SSE implementation as complete
- `README.md` - Update architecture diagram

---

## Rollback Plan

If SSE causes issues:

1. **Quick rollback**: Revert to polling
   ```bash
   git revert <commit-hash>
   ```

2. **Feature flag** (if implemented):
   ```bash
   USE_OPENCODE_SSE=false
   ```

3. **Hybrid mode**: Keep both SSE and polling, use polling as fallback

---

## Success Criteria

- [ ] SDK upgraded to v1.0.215 with no type errors
- [ ] SSE connection establishes successfully for both flows
- [ ] Tool calls update in real-time (no 1-second delay)
- [ ] Messages stream in real-time in Agent chat
- [ ] Error states display clearly when connection fails
- [ ] No memory leaks when opening/closing modal repeatedly
- [ ] Sessions synchronize properly (no duplicate messages)
- [ ] Reconnection works after temporary disconnection

---

## Timeline

- **Phase 1** (SDK Upgrade): 30 minutes
- **Phase 2** (SSE Infrastructure): 2 hours
- **Phase 3** (UI Updates): 1.5 hours
- **Phase 4** (Testing & Cleanup): 1 hour

**Total**: ~5 hours

---

## Notes

- Redis was removed in a previous refactor, so we don't need Redis pub/sub
- The SDK's `client.event.subscribe()` provides the SSE stream
- Events are filtered client-side by sessionId (no server-side filtering available)
- Proper AbortController cleanup is critical to prevent memory leaks
- Exponential backoff prevents connection spam on errors
