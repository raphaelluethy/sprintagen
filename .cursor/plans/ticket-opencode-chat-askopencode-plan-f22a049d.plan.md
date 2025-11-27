<!-- f22a049d-b7b3-4b85-a9b7-780dc0de57b9 6492ff26-d5f8-420c-b003-107f7a0c1eb4 -->
# Ticket Opencode Chat & askOpencode Plan

## 1. Server-side: Opencode session per ticket (persistent)

- **Reuse ticket metadata**: Use the existing `tickets.metadata` JSON field in `schema.ts` to store an `opencodeSessionId` per ticket (no schema change needed; just treat it as `{ ..., opencodeSessionId?: string }`).
- **Helper for Opencode text extraction**: In a new small server utility (e.g. `src/server/tickets/opencode.ts`), add a function that:
- Creates an Opencode session via `fetchFromOpencode("/session")` when no `opencodeSessionId` exists for a ticket (with a descriptive `title` including ticket id and title),
- Persists the new session id back to the ticket’s `metadata` using the Drizzle `update(tickets)` call,
- Given a session id and message text, POSTs to `/session/:id/message` with a `PromptInput`-shaped body (default `agent` e.g. `"docs-agent"`, and a configurable `providerID/modelID`),
- Parses the Opencode response JSON and returns a plain string by concatenating all `parts` where `type === "text"`.
- **Share session between chat and enrichment**: Ensure both the ticket Opencode chat tab and the `askOpencode` mutation call this helper so they always reuse the same `opencodeSessionId` per ticket (Option B).

## 2. Server-side: `askOpencode` mutation and storage

- **New TRPC mutation**: In `ticketRouter` (`server/api/routers/ticket.ts`), add `askOpencode`:
- Input: `{ ticketId: string }` (later extendable with a custom `question` if needed).
- Load the ticket and its latest recommendation/ranking if helpful for context; optionally call `getRepoContextForTicket(ticketId)` from `repo-analysis.ts` once implemented.
- Build a prompt that:
- Includes ticket title, description, provider, status, labels, and any AI ranking info,
- Asks Opencode explicitly: (a) how to implement the ticket (high-level steps, key files), and (b) who last touched the relevant files, using repository history if available.
- Use the helper from step 1 to send this prompt to the per-ticket Opencode session and get back a markdown answer string.
- **Persist result as enriched recommendation (Option 2b)**:
- Extend `ticketRecommendations` in `schema.ts` with a nullable text column such as `opencodeSummary` (or `opencodeNotes`) and add the corresponding Drizzle field.
- Implement a new Drizzle migration for this column, and ensure the seeding/queries that reference `ticketRecommendations` are updated to include it where appropriate.
- In `askOpencode`, either:
- Create a new `ticketRecommendations` row for this run with `recommendedSteps` and `opencodeSummary` filled from the Opencode answer, or
- Update the latest recommendation for the ticket to set `opencodeSummary` (choose one consistent path; recommend creating a new row to preserve history).
- Return `{ answer: string, recommendation: TicketRecommendation }` from the mutation so the UI can render immediately.

## 3. Server-side: Ticket-Opencode chat endpoints

- **TRPC queries/mutations for Opencode chat**: In `ticketRouter`, add:
- `getOpencodeChat`: input `{ ticketId: string }`, which ensures a session exists (via the helper), then calls `GET /session/:id/message` through `fetchFromOpencode` and maps the upstream `info/parts` objects into a lean chat message DTO suitable for the UI (role, text, createdAt, model, optional tool-calls metadata).
- `sendOpencodeChatMessage`: input `{ ticketId: string; message: string }`, which uses the helper to POST a user message to Opencode and returns the new assistant reply (again mapped to the DTO).
- **Error handling & configuration**: Reuse existing error patterns from `/api/opencode/*` routes, surface clear errors when `OPENCODE_SERVER_URL` is missing or Opencode is unreachable, and default agent/provider/model with optional overrides via env vars if needed.

## 4. Frontend: New Opencode tab in `TicketModal`

- **Add tab trigger**: In `TicketModal` (`_components/ticket-modal.tsx`), update the `TabsList` to include a fourth `TabsTrigger` (e.g. value `"opencode"`, label `"Opencode"` or `"Code Chat"`), and adjust the grid columns.
- **Tab content component**:
- Add a new `TabsContent value="opencode"` section that hosts a small Opencode chat UI:
- On mount (when selected), call `api.ticket.getOpencodeChat.useQuery({ ticketId })` to load the mapped messages,
- Render messages similarly to `AdminChatsPage` but simplified for a single session: bubbles aligned by role, optional model/agent badge, and a small metadata line.
- Provide a `Textarea` + `Send` button wired to `api.ticket.sendOpencodeChatMessage.useMutation`, disabling while pending and appending optimistic user messages.
- Reuse as much styling as possible from the existing `chat` tab and `AdminChatsPage` to keep a consistent look.

## 5. Frontend: `askOpencode` enrichment button & display

- **Add enrichment button in AI Insights tab**:
- In the `recommendations` tab of `TicketModal`, add a button such as “Ask Opencode about implementation” near the existing `Regenerate` button.
- Wire it to a new `api.ticket.askOpencode.useMutation` hook; disable while pending and show a small loading indicator.
- **Render Opencode answer**:
- On mutation success, render the returned `answer` below the existing “Recommended Steps” section, e.g. under a heading “Opencode Analysis” and using the same `react-markdown` styling as other markdown content.
- Also surface any stored `opencodeSummary` from the latest recommendation when opening the modal so previously-enriched tickets show their Opencode analysis without re-calling the API.

## 6. Graceful degradation when Opencode is unavailable

- **Health check query**: Add a `getOpencodeStatus` TRPC query that returns `{ available: boolean }` by pinging Opencode's `/agent` endpoint (reuse existing health check logic). Cache this on the client for a short duration to avoid repeated checks.
- **Disable UI when unavailable**:
- In the Opencode tab, if `available === false`, show a muted message like "Opencode is not available" and disable the chat input.
- In AI Insights, disable the "Ask Opencode" button and show a small "(Opencode unavailable)" label next to it when unhealthy.
- **No error throws**: Server-side helpers should return `null` or a result object with an error field rather than throwing when Opencode is unreachable, so the UI can handle it gracefully.

## 7. Testing & polish

- **Test flows**:
- Verify that opening the Opencode tab for a ticket with no previous Opencode usage creates a session, shows empty chat, and subsequent messages work.
- Verify that revisiting the same ticket reuses the same Opencode session (messages persist server-side in Opencode).
- Verify `askOpencode` populates `ticketRecommendations` with `opencodeSummary`, renders correctly in AI Insights.
- Verify that when Opencode is unavailable, buttons are disabled and a helpful message is shown.
- **DX/UX polish**:
- Ensure everything respects dark/light theme and matches existing typography.

### To-dos

- [ ] Create server-side helper for per-ticket Opencode sessions and message sending using fetchFromOpencode, storing opencodeSessionId in tickets.metadata.
- [ ] Add askOpencode TRPC mutation that prompts Opencode with ticket context, stores result in ticketRecommendations.opencodeSummary (with migration), and returns the answer.
- [ ] Add TRPC endpoints getOpencodeChat and sendOpencodeChatMessage that proxy to Opencode and map messages for the UI.
- [ ] Extend TicketModal with a new Opencode tab and a chat UI bound to the new TRPC endpoints.
- [ ] Add an “Ask Opencode about implementation” button in the AI Insights tab and render the stored Opencode analysis, calling the new mutation.
- [ ] Test Opencode chat and askOpencode flows end-to-end, including error states when Opencode is not available.
- [ ] Create server-side helper for per-ticket Opencode sessions and message sending using fetchFromOpencode, storing opencodeSessionId in tickets.metadata.
- [ ] Add askOpencode TRPC mutation that prompts Opencode with ticket context, stores result in ticketRecommendations.opencodeSummary (with migration), and returns the answer.
- [ ] Add TRPC endpoints getOpencodeChat and sendOpencodeChatMessage that proxy to Opencode and map messages for the UI.
- [ ] Extend TicketModal with a new Opencode tab and a chat UI bound to the new TRPC endpoints.
- [ ] Add an “Ask Opencode about implementation” button in the AI Insights tab and render the stored Opencode analysis, calling the new mutation.
- [ ] Test Opencode chat and askOpencode flows end-to-end, including error states when Opencode is not available.