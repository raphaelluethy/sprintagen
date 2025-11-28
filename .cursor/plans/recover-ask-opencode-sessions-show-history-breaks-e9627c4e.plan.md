<!-- e9627c4e-7528-4e3a-b4c1-ab728a077e86 e86478f7-0bec-4595-80e2-7bbb98ae9b33 -->
# Recover Ask Opencode Sessions & Show History Breaks

## Analysis Recap

- `getOrCreateOpencodeSession` stores Opencode session IDs inside `tickets.metadata`. When Opencode restarts, the remote session JSON disappears but the stale ID remains. Subsequent ticket interactions reuse that missing session, causing ENOENT/`NotFoundError` responses that bubble up as crashes.
- The ticket modal’s Opencode tab mixes historical messages with newly created sessions. When we regenerate a session, the UI silently drops earlier messages or fails outright, so users can’t tell a fresh session started.

## Implementation Plan

1. **Session validation & recreation (`src/server/tickets/opencode.ts`).**

- Extend `getOrCreateOpencodeSession` with a helper that, when metadata already stores `opencodeSessionId`, pings `/session/{id}` (or `/session/{id}/message` via `HEAD`) using `fetchFromOpencode`.
- If the response is 404/410 or throws ENOENT, clear the stale ID from `tickets.metadata`, log the event, and fall through to the existing session-creation path.
- Keep the happy path fast by returning immediately when the validation call succeeds.

2. **Persist refreshed IDs safely (`src/server/tickets/opencode.ts`).**

- When creating a session, update `tickets.metadata` atomically (e.g., `RETURNING` or re-reading) so concurrent requests don’t clobber each other.
- Add structured logs indicating when a session is reused vs. recreated.

3. **Propagate session metadata to callers.**

- Include the `sessionID` from Opencode’s response inside our `OpencodeChatMessage` DTO (new `sessionId` field).
- Update `getOpencodeMessages` to return messages grouped by their originating session so the frontend can render history boundaries without extra fetches.

4. **Frontend session-boundary indicator (`src/app/_components/ticket-modal.tsx`).**

- Update the Opencode chat rendering to keep all historical messages but insert a vertical separator (e.g., a thin bordered div with explanatory text) whenever the underlying `sessionId` changes between consecutive messages.
- Show a short note such as “New Opencode session started” so users know they’re looking at fresh reasoning after the previous session was lost.

5. **Ask Opencode panel UX refresh (`src/app/_components/ticket-modal.tsx`).**

- Make the recommendations tab’s Opencode answer area scrollable with newest content pinned to the bottom (auto-scroll on load) so users can review entire histories.
- Dim legacy messages (use a muted/grey text color) while keeping the latest response at normal contrast, mirroring the session-boundary cues.

6. **Improve TRPC error reporting (`src/server/api/routers/ticket.ts`).**

- Wrap Opencode errors so the UI can show actionable messages (e.g., “Previous session expired; a new one was created—please retry.”) instead of `null is not an object`.

7. **Verification.**

- Restart (or wipe) the Opencode server, reopen a ticket, and click “Ask Opencode.” Confirm the backend recreates the session automatically and the UI shows both the legacy messages and a vertical divider marking the new session.
- Close/reopen the ticket modal and Ask Opencode panel to confirm historic messages stay scrollable/greyed and the latest reply auto-scrolls into view.

## Follow-up (optional)

- Add a cleanup job removing orphaned `opencodeSessionId` metadata for deleted tickets or long-idle sessions.

### To-dos

- [ ] Add validation/recreation logic in getOrCreateOpencodeSession
- [ ] Improve error messages/logging in ticket router
- [ ] Verify Ask Opencode works after Opencode restart