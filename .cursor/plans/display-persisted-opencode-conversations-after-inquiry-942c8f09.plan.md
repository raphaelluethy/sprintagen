<!-- 942c8f09-711c-4fbb-83e6-4c4ec1211ed2 07d2f133-174d-455a-a63c-0fa039880ccf -->
# Display Persisted Opencode Conversations After Inquiry

## Current Architecture

### Polling & Persistence Flow

1. **SDK Client** (`src/lib/opencode-client.ts`): Singleton client using `@opencode-ai/sdk`
2. **Poller** (`src/server/tickets/opencode-poller.ts`): Polls every 500ms, detects completion, calls `completeSession`
3. **Session State** (`src/server/tickets/session-state.ts`): Redis for active sessions, PostgreSQL for archived sessions
4. **SSE** (`src/app/api/opencode/sessions/[id]/stream/route.ts`): Real-time updates via Redis pub/sub

### The Gap

When "Ask Opencode" completes:

- Messages are archived to `opencodeSessionsTable` via `completeSession`
- UI expects `ticketRecommendations.opencodeSummary` to show results
- `opencodeSummary` is never populated from the completed session
- `getSessionHistory` tRPC endpoint exists but isn't used in the UI

## Solution

### 1. Save Final Response to Recommendations

Update `completeSession` in `session-state.ts` to extract the assistant's final text response and save it to `ticketRecommendations.opencodeSummary`.

The `opencodeSessionsTable` already archives:

- `messages` - JSON array of `OpencodeChatMessage[]`
- `ticketId` - Reference to the ticket
- `sessionType` - "ask" for Ask Opencode inquiries

After archiving, insert a new recommendation with the summary:

```typescript:src/server/tickets/session-state.ts
import { ticketRecommendations } from "@/server/db/schema";

// In completeSession, after db.insert(opencodeSessionsTable):
if (state.ticketId && state.sessionType === "ask") {
  const finalText = state.messages
    .filter(m => m.role === "assistant")
    .map(m => m.text)
    .filter(Boolean)
    .join("\n\n");
  
  if (finalText) {
    await db.insert(ticketRecommendations).values({
      ticketId: state.ticketId,
      opencodeSummary: finalText,
      modelUsed: "opencode",
    });
  }
}
```

### 2. Display Session History in AI Insights Tab

Update `ticket-modal.tsx` to fetch completed sessions via `getSessionHistory` when no active inquiry is pending, displaying the conversation history below the opencode summary.

Key changes:

- Add `getSessionHistory` query to the modal
- Display completed session messages in a collapsible section
- Show tool calls and reasoning from archived sessions

## Files to Modify

1. `src/server/tickets/session-state.ts` - Update `completeSession` to save summary
2. `src/app/_components/ticket-modal.tsx` - Display session history after completion
3. `src/server/api/routers/ticket.ts` - Ensure tRPC endpoint returns formatted data

### To-dos

- [ ] Update completeSession to extract final assistant response and save to ticketRecommendations.opencodeSummary
- [ ] Add getSessionHistory query to ticket-modal.tsx and display completed sessions in AI Insights tab
- [ ] Format the displayed session history with tool calls, reasoning, and message content