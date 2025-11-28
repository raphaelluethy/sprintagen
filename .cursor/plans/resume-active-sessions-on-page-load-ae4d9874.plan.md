<!-- ae4d9874-9cb7-441e-9213-575e34f9d029 850074e9-a26b-4658-ad9a-74cc7b03403c -->
# Resume Active Sessions on Page Load

## Problem

When a user reloads the page while an OpenCode analysis is running, the loading indicators should resume. Currently, the infrastructure exists but the logic is spread across `page.tsx` and could benefit from clearer separation.

## Current State

- `getPendingOpencodeInquiries` TRPC endpoint already queries Redis/DB for active sessions
- `page.tsx` queries this on load and populates `pendingAskTicketIds` + `pendingSessionMap`
- The ticket table shows a spinner when a ticket ID is in `pendingAskTicketIds`
- The modal connects to SSE via `useOpencodeStream` when `pendingSessionId` is available

## Solution

Create a dedicated `useActiveSessions` hook that:

1. **Fetches** pending sessions from the backend on mount
2. **Restores** the UI state (pending ticket IDs + session map)
3. **Handles** the loading state while fetching

### Implementation

**1. Create new hook: `src/hooks/useActiveSessions.ts`**

```typescript
// Hook that queries backend for active sessions and provides state management
export function useActiveSessions() {
  // Query pending sessions from backend
  // Return: pendingTicketIds, sessionMap, isLoading, refetch
}
```

Key responsibilities:

- Query `ticket.getPendingOpencodeInquiries` on mount
- Maintain `pendingAskTicketIds: Set<string>` 
- Maintain `pendingSessionMap: Map<string, string>`
- Provide `isRestoring` loading state for initial fetch
- Provide `getSessionId(ticketId)` helper function

**2. Update `src/app/page.tsx`**

- Replace inline state management with `useActiveSessions()` hook
- Remove the manual `useEffect` that populates state from query
- Pass `isRestoring` to components that need to show loading state during restoration
```typescript
const {
  pendingAskTicketIds,
  getPendingSessionId,
  isRestoring,
  addPendingSession,
  refetch,
} = useActiveSessions();
```


**3. Minor updates to `TicketModal` and `TicketTable`**

- No structural changes needed - they already accept the right props
- The `isRestoring` state can optionally be used to show a subtle indicator

## Files to Modify

- `src/hooks/useActiveSessions.ts` (new file)
- `src/app/page.tsx` (refactor to use hook)

## Benefits

- Clear separation: one hook handles all active session restoration
- Single source of truth for pending session state
- Easier to test and maintain
- Loading state (`isRestoring`) can be used to prevent race conditions

### To-dos

- [ ] Create `useActiveSessions` hook in `src/hooks/useActiveSessions.ts`
- [ ] Refactor `page.tsx` to use the new hook instead of inline state management