<!-- 1fa07bab-d850-4f1e-a6d0-09e66e43c9fe 259c00a3-35f7-4b69-806d-320e1210bb07 -->
# tRPC-Based Opencode Streaming, History Sidebars, and Reusable Proxy Package

### Goals

- **Unify real-time opencode updates behind tRPC subscriptions** instead of a custom `/api/opencode/sessions/[id]/stream` SSE route.
- **Keep Redis as the transient state + pub/sub layer** for opencode sessions and continue persisting completed runs into `opencode_session` rows.
- **Expose historical AI outputs (recommendations and opencode runs)** via sidebars in the ticket UI, so users can switch between past analyses and conversations.
- **Limit Redis usage strictly to opencode flows**, while normal AI chat continues to use direct DB persistence.
- **Extract the opencode proxy logic into a small reusable package** that can be imported by this app and future projects.

### Backend: tRPC subscription over Redis

- **Add a tRPC subscription in `ticketRouter`** (e.g. `onOpencodeSessionUpdate`) that takes `{ sessionId: string }` as input.
- Use an `async function*` subscription as described in the tRPC subscriptions docs with SSE (`httpSubscriptionLink`).
- On subscription start, load the current Redis state via `getSessionState(sessionId)` from `src/server/tickets/session-state.ts` and `yield` an initial `{ type: "init", state }` envelope if present.
- Create a Redis subscriber with `createSubscriber()` from `src/server/redis/index.ts`, subscribe to `RedisKeys.updates(sessionId)`, and for each pub/sub message `yield` the parsed JSON (these are already `{ type: "update" | "complete", state }` from `updateSessionState` and `completeSession`).
- Implement proper cleanup in a `try/finally` block, unsubscribing and closing the Redis connection when `opts.signal` is aborted, matching the existing SSE route cleanup logic.

- **Optionally support tracked reconnection IDs** (future-proofing):
- Define the subscription output as envelopes that can carry an `id` (e.g. `state.updatedAt`), allowing adoption of `tracked()` later if we want automatic catch-up behavior as in the tRPC SSE example from the docs [`https://trpc.io/docs/server/subscriptions`](https://trpc.io/docs/server/subscriptions).

- **Deprecate the custom SSE route** in `src/app/api/opencode/sessions/[id]/stream/route.ts`:
- After the tRPC subscription is wired end-to-end, remove the `ReadableStream`/`EventSource`-specific logic and any direct Redis subscription from this route (or delete the route entirely if it is no longer used).
- Keep the Redis helpers (`RedisKeys`, `createSubscriber`, `updateSessionState`, `completeSession`) unchanged, since they remain the core of the opencode session lifecycle.

### Backend: extract reusable opencode proxy package

- **Create a small local package (e.g. `packages/opencode-proxy`)**:
- Add a `package.json` and `tsconfig.json` so it can be built and type-checked independently and later published if desired.
- Expose a stable entry `src/index.ts` that re-exports public types and functions.

- **Move generic opencode HTTP/proxy logic into the package**:
- Extract from `src/lib/opencode.ts` and `src/server/tickets/opencode.ts` the parts that are **not tied to tickets or Drizzle**, for example:
- `fetchFromOpencode(basePath, init)` wrapper.
- Opencode message/part types (`MessagePart`, `TextPart`, `ReasoningPart`, `ToolPart`, `OpencodeMessage`, `OpencodeChatMessage`).
- Pure functions `mapToOpencodeChatMessage`, `getOpencodeMessagesForSession(sessionId)`, and `sendOpencodeMessageToSession(sessionId, payload)` that only talk to the opencode HTTP API and work with session IDs.
- Keep Sprintagen-specific pieces (like tying sessions to `ticketId`, metadata in `tickets.metadata`, and Drizzle queries) inside the app; the package should only know about opencode server URLs, sessions, and messages.

- **Provide small integration helpers from the package**:
- Export a factory like `createOpencodeClient({ baseUrl, defaultAgent, defaultModel })` that returns high-level methods:
- `healthCheck()`.
- `createSession({ title })`.
- `getMessages(sessionId)`.
- `sendMessage(sessionId, { text, agent?, model? })`.
- Optionally export a narrow interface for plugging into a persistence layer:
- Define TypeScript interfaces for a `SessionStore` (DB) and `SessionStateStore` (Redis-like) that Sprintagen implements separately.

- **Refactor Sprintagen code to use the package**:
- Update `src/server/tickets/opencode.ts` to import the shared types and client from the new package and only handle ticket-specific concerns:
- Lookup/persist `opencodeSessionId` in ticket metadata.
- Map from ticket IDs to sessions using the shared client.
- Leave `session-state.ts` and `opencode-poller.ts` in the app code for now (since they depend on Redis + Drizzle), but type them using the shared `OpencodeChatMessage` and `ToolPart` from the package.
- Ensure tree-shaking and type imports remain clean so this package can be safely reused in other backends without pulling Sprintagen-specific code.

### Frontend: use tRPC subscription instead of EventSource

- **Configure tRPC client with SSE subscriptions**:
- In `src/trpc/react.tsx`, add the `httpSubscriptionLink` to the existing link stack, pointing it at the same tRPC HTTP endpoint.
- Verify that the TRPC React client exposes `useSubscription` for `ticket.onOpencodeSessionUpdate` with correct types.

- **Refactor `useOpencodeStream` to use tRPC**:
- Replace the manual `EventSource` logic in `src/hooks/useOpencodeStream.ts` with `api.ticket.onOpencodeSessionUpdate.useSubscription({ sessionId }, { onData })`.
- Maintain the same local `SessionState` shape (`messages`, `toolCalls`, `status`, `error`, `isConnected`):
- On `type: "init"`, hydrate state with the full Redis snapshot if present.
- On `type: "update"`, merge or replace `messages` and `currentToolCalls` as is done today.
- On `type: "complete"`, mark status as `"completed"` or `"error"` and stop further updates.
- Remove the manual reconnect/backoff logic (`EventSource`, `reconnectTimeoutRef`), allowing tRPC to handle reconnection.

- **Keep `useActiveSessions` logic intact**:
- Continue using `ticket.getPendingOpencodeInquiries` + `useActiveSessions` to restore pending Ask-Opencode runs on page load.
- Pass the resolved `sessionId` for the current ticket into `useOpencodeStream` (now powered by tRPC) so the recommendations tab still shows live analysis progress.

### Backend: ensure DB persistence is the source of truth

- **Verify and rely on `completeSession` archiving** in `src/server/tickets/session-state.ts`:
- Confirm that `completeSession` persists the final `RedisSessionState.messages` into `opencodeSessionsTable.messages`, sets `status` to `"completed"` or `"error"`, and publishes a `type: "complete"` event.
- Treat `opencodeSessionsTable` as the canonical long-term store for opencode conversations, and Redis as transient state only.

- **Enhance `getOpencodeChat` to read from DB for completed sessions** in `src/server/api/routers/ticket.ts`:
- For a given `{ ticketId, sessionId? }`, keep the current priority order:
- If `sessionId` or an active session exists in Redis, return the live Redis state (pending or running).
- Otherwise, look up the corresponding row in `opencodeSessionsTable` and return its `messages`, `status`, and metadata as a historical session.
- Only fall back to `getOpencodeMessages` (which calls the external opencode server) when there is no archived DB record yet, to avoid re-querying opencode for sessions we already persisted.

- **Reuse `getSessionHistory`**:
- Continue using `getSessionHistory(ticketId)` to provide a list of all `opencode_session` rows for a ticket, ordered by `startedAt`, including `status`, `sessionType`, `metadata`, and timestamps.

### Frontend: AI Insights tab sidebar for recommendations and Ask-Opencode runs

- **Expose full recommendation history to the UI**:
- Extend `ticket.byId` or add a dedicated procedure to return **all** `ticketRecommendations` for a ticket (not just the latest), ordered by `createdAt DESC`.
- In `TicketModal` (`src/app/_components/ticket-modal.tsx`), adjust the AI Insights tab so it receives the full recommendation list instead of only `latestRecommendation`.

- **Add a left sidebar in the AI Insights tab**:
- Split the AI Insights tab into a left column (sidebar) and right content panel.
- Sidebar sections:
- **Recommendations history**: each item shows timestamp and maybe a short title/first line; selecting an item sets a `selectedRecommendationId` in local state and displays that recommendation’s content on the right.
- **Opencode Ask runs**: use `ticket.getSessionHistory` filtered to `sessionType === "ask"` to list all completed/error Ask-Opencode sessions; selecting one sets a `selectedAskSessionId`.
- Right panel:
- When a recommendation is selected, render its `recommendedSteps`, `recommendedProgrammer`, and `opencodeSummary` as today (using `Markdown`).
- When an Ask-Opencode session is selected, fetch its transcript via `ticket.getOpencodeChat({ ticketId, sessionId: selectedAskSessionId })` and render either a condensed summary (first assistant message) or the full conversation.
- Keep the existing actions (`Ask Opencode`, `Regenerate`) at the top; when a new Ask run starts, automatically focus the sidebar on the active run and live progress (via tRPC subscription).

### Frontend: Opencode chat tab session history sidebar

- **Reuse `opencode_session` history for the Opencode tab**:
- In the Opencode tab of `TicketModal`, add a left sidebar listing all `opencodeSessionsTable` entries for that ticket with `sessionType === "chat"`.
- Use `ticket.getSessionHistory` to fetch this list; mark the currently open/live session (if any) distinctly from historical sessions.
- When a session in the sidebar is selected:
- If it is the current live session, keep using `ticket.getOpencodeChat` + tRPC subscription for live updates.
- If it is historical, call `ticket.getOpencodeChat({ ticketId, sessionId })`, which will resolve to the archived DB transcript, and render that conversation read-only in the right-hand chat panel.

- **Session lifecycle UX**:
- Keep the existing behavior where opening the Opencode tab creates a new `chat` session via `startOpencodeSession` if none exists.
- Clearly display the current session’s status (`pending` / `running` / `completed` / `error`) at the top of the chat area.
- Provide an affordance (e.g. a “New session” button) that calls `startOpencodeSession` again, pushing a new entry into the sidebar and switching the right-hand panel to the new, empty conversation.

### Chat tab (non-opencode) history

- **Leave chat persistence as-is for now, but prepare for future sessionization**:
- Continue writing individual chat messages to `ticketMessages` as currently implemented in `ticketRouter.chat` and reading them in the Chat tab.
- If we later need multiple independent chat threads per ticket, introduce a `chat_session` table (similar to `opencode_session`) and group `ticketMessages` under session IDs, but this is not required for the tRPC/Redis migration.

### High-level implementation todos

- **backend-subscription**: Add `ticket.onOpencodeSessionUpdate` tRPC subscription wired to Redis pub/sub and initial session state.
- **backend-opencode-package**: Create a `packages/opencode-proxy` package, move generic opencode HTTP/types/mapping logic into it, and refactor Sprintagen’s `opencode.ts` to depend on it.
- **client-subscription-link**: Configure `httpSubscriptionLink` in `src/trpc/react.tsx` and verify subscriptions work in development.
- **hook-migration**: Rewrite `useOpencodeStream` to consume the new tRPC subscription and delete the custom SSE route and EventSource logic.
- **db-history-read**: Enhance `getOpencodeChat` to serve completed sessions from `opencodeSessionsTable` before falling back to the opencode server.
- **ai-insights-sidebar**: Implement AI Insights sidebar showing recommendation history and Ask-Opencode runs, using `ticketRecommendations` and `getSessionHistory`.
- **opencode-chat-sidebar**: Add an Opencode chat session sidebar that lists `sessionType === "chat"` sessions and lets the user switch between them.
- **polish-status-ux**: Ensure status badges and loading/finished states across the recommendations and opencode tabs stay in sync with Redis state and DB persistence.