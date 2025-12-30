# Code Review Fixes Plan

Generated: 2025-12-30

## Critical Priority

### 1. Harden Development Auth Bypass
**File:** `src/server/api/trpc.ts`
**Lines:** 119-132

**Problem:** Using `t._config.isDev` for auth bypass is fragile and could potentially be true in production if misconfigured.

**Fix:**
```typescript
// Replace:
if (t._config.isDev && !ctx.session?.user) {

// With:
if (process.env.NODE_ENV === 'development' && !ctx.session?.user) {
```

**Testing:** Verify auth works in dev mode and fails properly in production build.

---

### 2. Fix SSE Race Condition in useOpencodeSSE
**File:** `src/hooks/useOpencodeSSE.ts`
**Lines:** 221-231

**Problem:** State reset happens inline with `connect()` call, but events can arrive during state updates.

**Fix:** Ensure state is fully reset before connection starts:
```typescript
useEffect(() => {
    if (sessionId && enabled) {
        // Reset state first
        setMessagesMap(new Map());
        setPartsMap(new Map());
        setSessionStatus({ type: "idle" });
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // Use setTimeout to ensure state updates are flushed before connect
        // Or use React 18's flushSync if needed
        queueMicrotask(() => {
            connect();
        });
    } else {
        cleanup();
        setConnectionState("disconnected");
    }

    return () => {
        cleanup();
    };
}, [sessionId, enabled, connect, cleanup]);
```

**Alternative:** Add `connect` and `cleanup` to dependency array properly since they use `useCallback`.

---

### 3. Add Controller Closed Check in SSE Route
**File:** `src/app/api/opencode/events/route.ts`
**Lines:** 88-96

**Problem:** No check if controller is closed before enqueueing data.

**Fix:**
```typescript
for await (const event of result.stream) {
    if (abortController.signal.aborted) break;
    
    // Add check for closed controller
    if (controller.desiredSize === null) {
        console.log(`[SSE] Controller closed for session ${sessionId}`);
        break;
    }
    
    if (!isEventForSession(event, sessionId)) {
        continue;
    }

    const data = `data: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(encoder.encode(data));
}
```

---

### 4. Optimize State Comparison in useActiveSessions
**File:** `src/hooks/useActiveSessions.ts`
**Lines:** 68-92

**Problem:** Using `JSON.stringify` for Set/Map comparison on every 5-second poll.

**Fix:** Use efficient comparison:
```typescript
// Helper function
function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
        if (!b.has(item)) return false;
    }
    return true;
}

// In useEffect:
setPendingAskTicketIds((prev) => {
    if (setsAreEqual(prev, newPendingIds)) {
        return prev;
    }
    return newPendingIds;
});

// For Map comparison:
function mapsAreEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
        if (b.get(key) !== value) return false;
    }
    return true;
}
```

---

## Medium Priority

### 5. Fix Dependency Array in useOpencodeSSE
**File:** `src/hooks/useOpencodeSSE.ts`
**Lines:** 238-239

**Problem:** eslint-disable comment hides missing dependencies.

**Fix:** Remove the eslint-disable and add proper dependencies:
```typescript
}, [sessionId, enabled, connect, cleanup]);
```

Since `connect` and `cleanup` use `useCallback`, they should be stable. If not, refactor to use refs more consistently.

---

### 6. Handle Promise Rejections
**Files:** 
- `src/app/_components/ticket-agent-tab.tsx`
- `src/app/_components/ticket-modal.tsx`

**Problem:** Using `void` without error handling.

**Fix:**
```typescript
// Replace:
void opencodeChatQuery.refetch();

// With:
opencodeChatQuery.refetch().catch((err) => {
    console.error('[Chat] Failed to refetch:', err);
});

// Or create a utility:
function safeRefetch<T>(query: { refetch: () => Promise<T> }, context: string) {
    query.refetch().catch((err) => {
        console.error(`[${context}] Refetch failed:`, err);
    });
}
```

---

### 7. Add Error Tracking for Session Persistence
**File:** `src/server/api/routers/ticket.ts`

**Problem:** Silent failures when session persistence fails.

**Fix:** Consider adding error tracking or at minimum returning status to client:
```typescript
// Option 1: Track failed persistence
const persistencePromise = persistOpencodeSession(...)
    .catch((err) => {
        console.error(`[OPENCODE] Failed to persist session:`, err);
        // Could emit to error tracking service here
        return { success: false, error: err };
    });

// Option 2: Return persistence status in response
// Add to the mutation response so client knows if history was saved
```

---

### 8. Add Markdown Sanitization
**Files:**
- `src/app/_components/ticket-agent-tab.tsx`
- `src/app/_components/ticket-chat-tab.tsx`
- `src/app/_components/ticket-recommendations-tab.tsx`

**Problem:** react-markdown without explicit sanitization.

**Fix:** Add rehype-sanitize plugin:
```bash
bun add rehype-sanitize
```

```typescript
import rehypeSanitize from 'rehype-sanitize';

<Markdown rehypePlugins={[rehypeSanitize]}>
    {msg.text}
</Markdown>
```

---

## Low Priority

### 9. Extract Magic Numbers to Constants
**File:** `src/hooks/useOpencodeSSE.ts`
**Line:** 204

**Fix:**
```typescript
const SSE_RECONNECT_BASE_MS = 1000;
const SSE_RECONNECT_MAX_MS = 30000;
const SSE_MAX_RECONNECT_ATTEMPTS = 5;

// Usage:
const delay = Math.min(
    SSE_RECONNECT_BASE_MS * 2 ** reconnectAttemptsRef.current,
    SSE_RECONNECT_MAX_MS
);
```

---

### 10. Improve Type Safety for Session Status
**File:** `src/server/api/routers/ticket.ts`

**Problem:** Using `{ type: string }` instead of proper type.

**Fix:**
```typescript
import type { SessionStatus } from "@opencode-ai/sdk";

let sessionStatus: SessionStatus = { type: "idle" };
```

---

### 11. Improve Scroll Behavior
**Files:** `ticket-agent-tab.tsx`, `ticket-chat-tab.tsx`

**Problem:** Scroll only triggers on message count change.

**Fix:** Track last message ID or timestamp:
```typescript
const lastMessageIdRef = useRef<string | null>(null);

useEffect(() => {
    const lastMessage = opencodeMessages[opencodeMessages.length - 1];
    if (lastMessage && lastMessage.id !== lastMessageIdRef.current) {
        lastMessageIdRef.current = lastMessage.id;
        opencodeChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
}, [opencodeMessages]);
```

---

## Implementation Order

1. **Critical (do first):**
   - [ ] #1 - Auth bypass hardening (security)
   - [ ] #2 - SSE race condition (data integrity)
   - [ ] #3 - Controller closed check (stability)
   - [ ] #4 - State comparison optimization (performance)

2. **Medium (do next):**
   - [ ] #5 - Dependency array fix
   - [ ] #6 - Promise rejection handling
   - [ ] #7 - Persistence error tracking
   - [ ] #8 - Markdown sanitization

3. **Low (when time permits):**
   - [ ] #9 - Magic numbers
   - [ ] #10 - Type safety
   - [ ] #11 - Scroll behavior

---

## Testing Checklist

After fixes:
- [ ] Auth works in development with mock user
- [ ] Auth properly rejects in production build
- [ ] SSE connects and receives messages without duplicates
- [ ] SSE reconnects properly after disconnect
- [ ] No console errors when client disconnects mid-stream
- [ ] UI doesn't flicker on 5-second polling cycles
- [ ] Chat messages persist correctly
- [ ] No XSS possible through markdown content
