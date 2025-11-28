<!-- ab747e9c-d1b4-47ed-aeba-bdc3fe79b177 313e2c5b-f583-41e2-a199-9b18169722b6 -->
# Backend-Managed Opencode with SSE Streaming

## Architecture Overview

```
Frontend                    Backend                      Opencode
   |                           |                            |
   |-- POST /startAskOpencode->|                            |
   |<-- { ticketId } ----------|                            |
   |                           |-- persist "running" to DB  |
   |                           |-- fire-and-forget -------->|
   |                           |                            |
   |-- SSE /askOpencodeStream->|                            |
   |<-- event: progress -------|<-- poll messages ----------|
   |<-- event: progress -------|<-- poll messages ----------|
   |<-- event: complete -------|<-- final response ---------|
   |                           |-- persist "completed" to DB|
   |                           |-- create recommendation    |
```

## Database Schema Changes

Extend `TicketMetadata` in `src/server/tickets/opencode.ts`:

```typescript
interface TicketMetadata {
  opencodeSessionId?: string;
  // Ask Opencode state (persisted for reload recovery)
  askOpencodeStatus?: 'running' | 'completed' | 'error';
  askOpencodeSessionId?: string;
  askOpencodeStartedAt?: number;
  askOpencodeError?: string;
}
```

## New Files

### 1. `src/app/api/opencode/stream/[ticketId]/route.ts` - SSE Endpoint

```typescript
export async function GET(req, { params }) {
  const { ticketId } = params;
  
  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      // Poll Opencode session for messages
      // Send progress events
      // On completion, send complete event and close
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

## Backend Changes

### 1. New `startAskOpencode` mutation (replaces current `askOpencode`)

In `src/server/api/routers/ticket.ts`:

- Mark ticket as `askOpencodeStatus: 'running'` in DB
- Create Opencode session, store `askOpencodeSessionId`
- Fire-and-forget: Start background work (don't await)
- Return immediately with `{ ticketId, sessionId }`

### 2. Background worker function

In `src/server/tickets/opencode.ts`:

```typescript
export async function runAskOpencodeInBackground(
  ticketId: string,
  sessionId: string,
  prompt: string
): Promise<void> {
  try {
    // Send message to Opencode (blocking)
    const result = await sendOpencodeMessage(...);
    
    // Update DB: status = 'completed', create recommendation
    await db.update(tickets)...
    await db.insert(ticketRecommendations)...
  } catch (error) {
    // Update DB: status = 'error'
    await db.update(tickets)...
  }
}
```

### 3. New `getAskOpencodeStatus` query

Returns current status from DB for a ticket (for initial load/recovery).

## Frontend Changes

### 1. Simplify `src/app/page.tsx`

- Remove `pendingAskTicketIds` and `askOpencodeSessionIds` state
- Remove `askOpencodeMutation` callbacks
- Add query for initial status on mount

### 2. New custom hook `useAskOpencodeStream`

```typescript
function useAskOpencodeStream(ticketId: string | null) {
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [steps, setSteps] = useState<ToolStep[]>([]);
  
  useEffect(() => {
    if (!ticketId) return;
    
    const eventSource = new EventSource(`/api/opencode/stream/${ticketId}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') setSteps(data.steps);
      if (data.type === 'complete') setStatus('completed');
    };
    
    return () => eventSource.close();
  }, [ticketId]);
  
  return { status, steps };
}
```

### 3. Update `TicketModal` and `TicketTable`

- Use the new hook for live progress
- Query DB status on mount for reload recovery
- Remove direct polling logic

## Recovery Flow (Page Reload)

1. Frontend mounts
2. Query `getAskOpencodeStatus` for all visible tickets
3. For any with `status: 'running'`:

   - Verify session still exists (backend check)
   - Connect to SSE stream to resume watching

4. For any with `status: 'completed'` or `status: 'error'`:

   - Display final state from DB

## Key Files to Modify

| File | Changes |

|------|---------|

| `src/server/tickets/opencode.ts` | Extend metadata, add background worker |

| `src/server/api/routers/ticket.ts` | New `startAskOpencode`, `getAskOpencodeStatus` |

| `src/app/api/opencode/stream/[ticketId]/route.ts` | New SSE endpoint |

| `src/app/page.tsx` | Remove local state, use hook |

| `src/app/_components/ticket-modal.tsx` | Use SSE hook, simplify |

| `src/app/_components/ticket-table.tsx` | Query status from DB |

### To-dos

- [x] Extend TicketMetadata interface with askOpencodeSessionId and askOpencodeStartedAt fields
- [ ] Update askOpencode mutation to mark inquiry as running before starting, clear on completion
- [ ] Add getPendingAskOpencode query to check for and validate running inquiries
- [ ] Add clearAskOpencodeState helper function to clean up metadata
- [ ] Query for pending inquiries on page load and restore React state from DB
- [ ] Auto-cleanup stale entries when detected (session gone or recommendation exists)