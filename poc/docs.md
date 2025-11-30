Repo findings (how it actually works)

- The JS SDK lives in packages/sdk/js/src and exposes:
  - createOpencodeClient for HTTP access to an already-running opencode serve server (client.ts, sdk.gen.ts).
  - createOpencodeServer and createOpencode helpers that spawn opencode serve on 127.0.0.1:4096 and return the base URL (server.ts, index.ts).
- The HTTP API surface for the server is defined in packages/opencode/src/server/server.ts (Hono + OpenAPI). Key routes:
  - GET /global/event → global SSE events (session + message + tool updates).
  - GET /session/:id/message → all messages with parts.
  - POST /session/:id/message (operationId session.prompt) → send prompt and get the assistant message + parts.
  - Plus many others: session.status, session.diff, session.todo, file.\*, etc.
- The event and message data model is defined by MessageV2 in packages/opencode/src/session/message-v2.ts and mirrored as types in the SDK (types.gen.ts):
  - Session, Message, Part, ToolPart, FileDiff, SessionStatus, Event, GlobalEvent, etc.
- The web-style UI logic you see when connecting to an opencode server is implemented in:
  - packages/desktop/src/context/\* (state + SDK usage around a base URL).
  - packages/ui/src/components/\* and packages/ui/src/context/data.tsx (rendering sessions, messages, tool calls, progress).
  - packages/enterprise/src/routes/share/[shareID].tsx (share view using the same UI primitives against static data).
- The SDK’s event layer is typed in packages/sdk/js/src/gen/types.gen.ts:
  - Event union for all event types.
  - GlobalEvent { directory, payload: Event }.
  - client.global.event() → SSE of GlobalEvent.
  - client.event.subscribe() → SSE of Event (TUI-specific).

---

Architecture: how the JS SDK talks to an agent

- Server process
  - createOpencodeServer(options?) spawns opencode serve --hostname=... --port=... and waits until it prints opencode server listening on ..., then returns { url, close }. (server.ts:21–88)
  - By default it listens on http://127.0.0.1:4096.
- Client
  - createOpencodeClient(config?) wraps a generated HTTP client and returns an OpencodeClient instance (client.ts:1–29, sdk.gen.ts:86–125).
  - It:
    - Ensures config.fetch exists; default uses fetch and disables request timeout (client.ts:8–18).
    - Adds x-opencode-directory header if you pass config.directory, so all requests run in that project/worktree (client.ts:20–25).
  - The resulting client has methods:
    - client.session.{create,list,get,messages,prompt,promptAsync,status,diff,...}
    - client.global.event() for SSE of { directory, payload: Event }.
    - client.event.subscribe() for SSE of Event (used in the TUI).
    - client.file._, client.config._, client.provider.\*, etc. (sdk.gen.ts).
- Data & events
  - Messages are MessageV2.Info (message-v2.ts:86–107), discriminated by role:
    - UserMessage has agent, model, and optional summary with diffs.
    - AssistantMessage has cost, tokens, providerID, modelID, mode, summary flag, finish, error, etc. (message-v2.ts:86–107, 330–368).
  - Parts (MessageV2.Part) are discriminated by type (message-v2.ts:110–128, 310–328):
    - text, reasoning, file, tool, snapshot, patch, agent, subtask, step-start, step-finish, retry, compaction, etc.
  - Tool parts are ToolPart with an embedded state machine (message-v2.ts:202–279):
    - status: "pending" | "running" | "completed" | "error".
    - input: Record<string, unknown>.
    - For completed:
      - output: string, title: string, metadata: Record<string, unknown>, time: { start, end, compacted? }, and optional attachments: FilePart[].
    - For error:
      - error: string, metadata?, time { start, end }.
  - Events (types.gen.ts:641–685):
    - Event is a union of EventMessageUpdated, EventMessagePartUpdated, EventSessionStatus, EventSessionDiff, EventTodoUpdated, etc.
    - GlobalEvent is { directory: string; payload: Event }.
    - GET /global/event returns an SSE stream of GlobalEvent (types.gen.ts:687–690, 1519–1533; server route in server.ts:128–171).
- UI state management (desktop/web pattern)
  - GlobalSDKProvider:
    - Creates an SDK client for the base URL and subscribes to global SSE events:
      - createOpencodeClient({ baseUrl, signal }).
      - sdk.global.event().then(async (events) => { for await (const event of events.stream) { emitter.emit(event.directory, event.payload) } }). (global-sdk.tsx:9–24)
  - GlobalSyncProvider:
    - Maintains a per-directory State (global-sync.tsx:21–47), keyed by project directory.
    - Listens to those emitted events and updates session, session_status, todo, message, and part maps via binary-search + setStore (global-sync.tsx:63–161).
  - SyncProvider (per-directory, per-app):
    - Uses useGlobalSync + useSDK() to get current directory’s store and client.
    - Does initial hydration via one-shot SDK calls:
      - session.list, session.status, config.get, file.status, file.list, project.current, config.providers, app.agents. (sync.tsx:15–34)
    - Exposes methods:
      - sync.session.sync(id) → session.get, session.messages, session.todo, session.diff, then merges into store (sync.tsx:45–72).
      - absolute(path) to resolve project-relative paths (sync.tsx:36–37).
  - The UI (SessionTurn, Message, MessageProgress) reads from this store:
    - message map (sessionID → messages).
    - part map (messageID → parts).
    - session_status map (sessionID → status).
    - session_diff map (sessionID → diffs).

---

How they display messages and tool calls

- Core UI types & context
  - packages/ui/src/context/data.tsx defines a simple Data context for preloaded data:
    - session, session_status, session_diff, session_diff_preload, message, part. (data.tsx:5–22)
  - DataProvider wraps children with { store: data, directory }.
- Message + Part rendering
  - Message (message-part.tsx:44–61):
    - For UserMessage:
      - Concatenates non-synthetic text parts and renders inline (UserMessageDisplay). (message-part.tsx:75–83)
    - For AssistantMessage:
      - Filters out reasoning parts and internal todoread tool parts, then renders remaining via Part component (AssistantMessageDisplay). (message-part.tsx:63–72)
  - Part (message-part.tsx:85–93):
    - Looks up a registered component by part.type (PART_MAPPING) and renders it via <Dynamic>.
    - Before rendering, runs sanitizePart to redact any sensitive paths using a regex (e.g. directory/). (message-part.tsx:85–88)
  - PART_MAPPING includes:
    - "text" → Markdown rendering (Markdown component). (message-part.tsx:177–187)
    - "reasoning" → separate Markdown block (can be hidden or displayed). (message-part.tsx:189–197)
    - "tool" → generic tool UI driven by ToolRegistry. (message-part.tsx:127–175)
- Tool registry & per-tool UIs
  - ToolRegistry.register({ name, render }) stores a renderer for tool name (message-part.tsx:100–121).
  - "tool" part renderer:
    - Determines the specific ToolComponent via ToolRegistry.render(part.tool) || GenericTool. (message-part.tsx:128–133)
    - Computes:
      - metadata: empty unless state.status !== "pending".
      - input: only filled for status === "completed" by design (they intentionally hide inputs while running). (message-part.tsx:129–133)
    - For status === "error":
      - Displays a red Card with parsed title/message from state.error. (message-part.tsx:136–158)
    - Otherwise:
      - Renders the registered component with input, output, metadata, tool, hideDetails. (message-part.tsx:160–168)
  - Built-in tool UIs (message-part.tsx:200–408):
    - read → compact card showing filename (from input.filePath).
    - list / glob / grep → show directory + query arguments.
    - webfetch → show URL and a “open” icon.
    - task → show subagent type and description (delegation).
    - bash → show shell command and output formatted in a code block.
    - edit / write → show file path and (for edit) inline diff details when metadata.filediff is present.
    - todowrite → checklist of todos with completion state.
- Progress & status
  - MessageProgress (message-progress.tsx) builds a “timeline” of completed tools:
    - Flattens all ToolPart in assistant messages for the current turn (assistantMessages).
    - Detects nested task tool sessions (state.metadata.sessionId) and, if present, resolves to that sub-session’s assistant messages instead (message-progress.tsx:20–36).
    - Computes eligibleItems as completed tool parts; animates them into a vertical list to show progress.
    - Derives a human-readable status from the last part:
      - task → “Delegating work…”
      - todowrite/todoread → “Planning next steps…”
      - read / list / grep / glob → “Searching the codebase…”
      - webfetch → “Searching the web…”
      - edit / write → “Making edits…”
      - bash → “Running commands…”
      - reasoning → “Thinking…”
      - text → “Gathering thoughts…” (message-progress.tsx:76–108).
- Final response and summary
  - SessionTurn ties it all together (session-turn.tsx):
    - Finds the user message by sessionID + messageID.
    - Identifies its assistant responses (assistantMessages) via parentID and loads their parts from the shared store.
    - Shows:
      - Title (with typewriter animation if first time seen).
      - The original user message text (via <Message>).
      - A “Summary / Response” section, using UserMessage.summary.body or the last assistant text part (session-turn.tsx:123–141).
      - Inline per-file diffs using Diff + DiffChanges.
    - While the turn is still running:
      - Shows <MessageProgress> instead of final details (session-turn.tsx:193–197).
    - Once done and there were tools:
      - Shows a collapsible “Show details / Hide details” area with full tool call trail (assistant messages and ToolParts). (session-turn.tsx:193–243)
- Prompt submission
  - The desktop prompt bar (prompt-input.tsx) builds the SessionPromptData body exactly like the SDK types expect:
    - Text: an aggregated string from the contenteditable buffer.
    - Attachments: FilePartInput objects with mime, filename, file:// URL and a source for local selection (optional). (prompt-input.tsx:303–323)
    - Model + agent: selected from UI (local.model.current, local.agent.current).
    - Then calls:
      sdk.client.session.prompt({
      path: { id: existing.id },
      body: {
      agent: local.agent.current()!.name,
      model: {
      modelID: local.model.current()!.id,
      providerID: local.model.current()!.provider.id,
      },
      parts: [
      { type: "text", text },
      ...attachmentParts,
      ],
      },
      })
      (prompt-input.tsx:331–347)
    - UI does not manually handle streaming of the response. Instead:
      - The server immediately starts processing.
      - message.updated and message.part.updated events arrive over SSE and update the UI store.

---

Practical plan: using the JS SDK in your own web UI
Below is a concrete plan based on what the repo actually does.

1. Start or connect to an opencode server
   - Option A – manage server yourself:
     - Run opencode serve --hostname=127.0.0.1 --port=4096 in your project and point your UI at http://127.0.0.1:4096.
   - Option B – let the SDK spawn it (Node/Bun environment):
     - Use createOpencodeServer:
       import { createOpencodeServer } from "@opencode-ai/sdk";
       const server = await createOpencodeServer({
       hostname: "127.0.0.1",
       port: 4096,
       config: {/_ optional opencode config _/},
       });
       // server.url is e.g. "http://127.0.0.1:4096" - When done, call server.close() to kill the child process.
2. Create a client bound to a project/directory
   - In the web UI (or desktop host), create an OpencodeClient:
     import { createOpencodeClient } from "@opencode-ai/sdk";
     const client = createOpencodeClient({
     baseUrl: serverUrlOrEnv, // e.g. "http://127.0.0.1:4096"
     directory: process.cwd() /_ or any project path (server-side) _/,
     // signal?: AbortSignal // optional cancellation
     });
     - directory is important: the backend uses x-opencode-directory to know which repo/worktree to operate on.
3. Set up event streaming to keep UI state live
   - For a multi-project or multi-directory app (like desktop):
     - Subscribe to client.global.event():
       const events = await client.global.event();
       for await (const evt of events.stream) {
       const { directory, payload } = evt; // GlobalEvent
       // payload: Event { type, properties }
       // Route to a per-directory store
       } - Maintain a map directory → { session[], message, part, session_status, todo, session_diff }.
     - For each payload.type, update the appropriate slice (exactly like global-sync.tsx does with Binary.search).
   - For a single-project app, you can either:
     - Keep using client.global.event() and ignore directory, or
     - Use client.event.subscribe() and treat events as global (TUI pattern).
4. Hydrate initial state
   For each directory/project you care about (or just one):
   - Load config, project, and providers:
     const project = await client.project.current();
     const config = await client.config.get();
     const providers = await client.config.providers();
     - Load sessions and their status:
       const sessions = await client.session.list();
       const status = await client.session.status();
     - For a given session id:
       const session = await client.session.get({ path: { id } });
       const messages = await client.session.messages({
       path: { id },
       query: { limit: 100 },
       });
       const todo = await client.session.todo({ path: { id } });
       const diff = await client.session.diff({ path: { id } });
     - Normalize into your store:
     - Sort messages.data by info.id.
     - Store message[sessionID] = messages.data.map(m => m.info).
     - Store part[messageID] = m.parts for each message.
     - Store session_diff[sessionID] = diff.data.
     - Store todo[sessionID], session_status[sessionID].
5. Send prompts and commands to the agent
   - To send a chat-like prompt:
     import type { TextPartInput, FilePartInput } from "@opencode-ai/sdk";
     const textPart: TextPartInput = { type: "text", text: userText };
     const filePart: FilePartInput = {
     type: "file",
     mime: "text/plain",
     url: "file:///abs/path/to/file.ts",
     filename: "file.ts",
     // optional source for local selection
     // source: { type: "file", text: { value, start, end }, path: "/abs/path" },
     };
     const res = await client.session.prompt({
     path: { id: sessionID },
     body: {
     agent: "build", // or other agent
     model: { providerID, modelID },
     // optional: messageID, noReply, system, tools
     parts: [textPart, filePart],
     },
     });
     const { info: assistantMessage, parts } = res.data;
     // You can optimistically insert this, but the UI usually relies on events.
     - For fire-and-forget behavior (immediately return and let SSE drive UI):
       await client.session.promptAsync({
       path: { id: sessionID },
       body: { agent, model: { providerID, modelID }, parts: [textPart, ...files] },
       });
     - For commands (non-natural-language operations):
       await client.session.command({
       path: { id: sessionID },
       body: { command: "session.share", arguments: "", agent: "build" },
       });
6. Maintain a message + part store in the UI
   - For each directory:
     - sessions: Session[]
     - session_status: Record<sessionID, SessionStatus>
     - message: Record<sessionID, Message[]>
     - part: Record<messageID, Part[]>
     - session_diff: Record<sessionID, FileDiff[]>
     - todo: Record<sessionID, Todo[]>
   - Handle events:
     - EventSessionUpdated → insert/update Session in sessions (sorted, no duplicates).
     - EventSessionStatus → set session_status[sessionID].
     - EventSessionDiff → set session_diff[sessionID].
     - EventTodoUpdated → set todo[sessionID].
     - EventMessageUpdated → insert/update Message in message[sessionID].
     - EventMessagePartUpdated → insert/update Part in part[messageID].
   - This is exactly what GlobalSyncProvider does (global-sync.tsx:95–161).
7. Rendering messages and tool calls in your own components
   - User messages
     - Filter message[sessionID] by role === "user" to get user turns.
     - Render:
       - summary.title as the “turn title”.
       - Optional summary.body as the primary answer snippet.
       - Their original text parts via Part components.
   - Assistant messages
     - For each user turn, define:
       - assistantMessages = messages.filter(m => m.role === "assistant" && m.parentID === userMessage.id).
     - For each assistant message:
       - Lookup parts = part[assistantMessage.id].
       - Pass (message, parts) into a <Message> component that:
         - Filters out internal parts (e.g. reasoning or todoread) as desired.
         - Renders text and reasoning parts as Markdown.
         - Renders tool parts via a tool registry.
   - Tool calls
     - Each ToolPart has:
       - tool: string → the tool name ("read", "glob", "bash", "edit", etc.).
       - state → see above.
     - Recommended pattern (same as ToolRegistry):
       - Define a registry mapping tool → renderer.
       - For pending → show a skeleton or spinner with the tool name and key params.
       - For running → show progress (e.g. “Running grep on src/…”).
       - For completed:
         - Show core info from input (file path, pattern, URL, etc.).
         - Show summary or full output (or hide behind “Show details”).
         - Render attachments using your file viewer (or inline preview).
       - For error → show a compact error card parsed from state.error.
   - Progress indicator
     - Optionally build a “progress strip” like MessageProgress:
       - Flatten ToolParts across assistant messages for the current turn.
       - Use their order and completion to create an animated list.
       - Derive a single status string from the last part’s tool / type for human-readable state.
   - Final response
     - Once session_status[sessionID].type returns to "idle" and the last assistant message has info.time.completed:
       - Consider the turn “complete”.
       - Use:
         - UserMessage.summary.body or last assistant text part as the main answer.
         - session_diff[sessionID] for per-file change previews.
         - Optionally a collapsible area with the full tool call trace.

---

Minimal end-to-end example (pseudo-code)
import { createOpencodeClient } from "@opencode-ai/sdk";
const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096", directory: "/path/to/project" });
const store = {
sessions: [] as Session[],
sessionStatus: {} as Record<string, SessionStatus>,
messages: {} as Record<string, Message[]>,
parts: {} as Record<string, Part[]>,
};
async function init() {
const [sessionsRes, statusRes] = await Promise.all([
client.session.list(),
client.session.status(),
]);
store.sessions = sessionsRes.data;
store.sessionStatus = statusRes.data;
const events = await client.global.event();
(async () => {
for await (const { directory, payload } of events.stream) {
if (directory !== "/path/to/project") continue;
switch (payload.type) {
case "message.updated": {
const msg = payload.properties.info;
const list = store.messages[msg.sessionID] ?? [];
// insert / update msg by id
break;
}
case "message.part.updated": {
const part = payload.properties.part;
const list = store.parts[part.messageID] ?? [];
// insert / update part by id
break;
}
case "session.status":
store.sessionStatus[payload.properties.sessionID] = payload.properties.status;
break;
}
}
})();
}
async function sendPrompt(sessionID: string, text: string) {
await client.session.promptAsync({
path: { id: sessionID },
body: {
agent: "build",
model: { providerID: "anthropic", modelID: "claude-3-5-sonnet-latest" },
parts: [{ type: "text", text }],
},
});
// UI will update as events arrive
}

---

Summary

- The JS SDK is a thin, strongly typed client over the HTTP API implemented in server.ts.
- Real-time behavior (streaming text, tool calls, progress, final response) is implemented by:
  - The server emitting events (Session, MessageV2, ToolPart) over SSE.
  - The SDK’s global.event() / event.subscribe() helpers.
  - UI state stores that merge events into session, message, part maps.
  - Rendering components that: - Interpret Part.type and ToolPart.state. - Aggregate assistant messages per user turn. - Provide summary + detailed tool call views.
