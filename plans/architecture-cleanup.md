# Architecture Cleanup Plan

**Created:** 2026-01-09  
**Status:** Proposed  
**Estimated Effort:** 6-10 hours total

---

## Problem Statement

The Sprintagen codebase has accumulated architectural inconsistencies that create confusion, maintenance burden, and drift risk:

1. **Duplicate OpenCode Integrations** - Two parallel systems exist for interacting with OpenCode:
   - Legacy path: `src/server/tickets/opencode.ts` with direct SDK calls
   - New path: `src/server/ai-agents/` with `AgentRegistry` + `OpencodeProvider` abstraction
   - Each uses different persistence: `opencodeSessionsTable` vs `tickets.metadata.opencodeSessionId`

2. **Overlapping tRPC Routers** - Both routers expose similar OpenCode functionality:
   - `ticketRouter`: `getOpencodeChatMessages`, `sendOpencodeChatMessage`, `askOpencode`
   - `agentServerRouter`: `getTicketChat`, `sendMessage`, `askOpencode`
   - Different prompts, error handling, and storage strategies

3. **Schema Cruft** - Unused `posts` table from starter template

4. **Confusing AI Naming** - `src/server/ai/` (LLM text generation) vs `src/server/ai-agents/` (OpenCode sessions) are easily confused

5. **Business Logic in Routers** - Ticket + AI orchestration logic is embedded in tRPC procedures instead of a service layer

---

## Proposed Changes

### Phase 1: Standardize OpenCode Integration (Priority: High)

**Goal:** Single canonical path for all OpenCode interactions.

#### 1.1 Create OpenCode Ticket Service

Create `src/server/tickets/opencode-service.ts`:

```typescript
// Wraps AgentRegistry for ticket-specific OpenCode operations
export class OpencodeTicketService {
  startSession(ticketId: string, sessionType: "chat" | "ask" | "admin"): Promise<{ sessionId: string }>
  sendMessage(ticketId: string, sessionId: string, message: string): Promise<MessageResult>
  getChat(ticketId: string, sessionId?: string): Promise<ChatResult>
  getStatus(sessionId: string): Promise<SessionStatus>
}
```

#### 1.2 Deprecate Legacy Functions

Mark functions in `src/server/tickets/opencode.ts` as deprecated:
- `sendOpencodeMessage`
- `getOpencodeMessages`
- `createNewOpencodeSessionForTicket`
- `persistOpencodeSession`
- `getPersistedSessions`

#### 1.3 Migrate Routers to New Service

Update `ticketRouter` and `agentServerRouter` to use `OpencodeTicketService`.

**Files Changed:**
- `src/server/tickets/opencode-service.ts` (new)
- `src/server/tickets/opencode.ts` (deprecation comments)
- `src/server/api/routers/ticket.ts`
- `src/server/api/routers/agentServer.ts`

---

### Phase 2: Unify tRPC Surface (Priority: High)

**Goal:** Each concept has one API entry point.

#### 2.1 Define Router Responsibilities

| Router | Responsibility |
|--------|----------------|
| `ticketRouter` | Ticket CRUD, sync, ranking, recommendations, AI analysis (non-agent) |
| `agentServerRouter` | All session-based agent operations (including ticket sessions) |

#### 2.2 Remove Duplicate Endpoints from ticketRouter

Remove from `ticketRouter`:
- `getOpencodeChatMessages` → use `agentServerRouter.getTicketChat`
- `sendOpencodeChatMessage` → use `agentServerRouter.sendMessage`
- `askOpencode` → use `agentServerRouter.askOpencode`
- `getSessionHistory` → use `agentServerRouter.listSessions` with ticket filter

#### 2.3 Consolidate askOpencode Logic

Merge the best of both implementations:
- Use `agentServerRouter.askOpencode` as the base
- Add recommendation persistence (currently only in `ticketRouter.askOpencode`)
- Use shared prompt builders from `src/server/ai/prompts.ts`

**Files Changed:**
- `src/server/api/routers/ticket.ts` (remove endpoints)
- `src/server/api/routers/agentServer.ts` (add recommendation persistence)
- Frontend components calling removed endpoints

---

### Phase 3: Introduce Ticket Service Layer (Priority: Medium)

**Goal:** Extract business logic from routers.

#### 3.1 Create Ticket Service

Create `src/server/tickets/ticket-service.ts`:

```typescript
export const ticketService = {
  getOrThrow(db, ticketId, options?): Promise<Ticket>
  update(db, input): Promise<Ticket>
  analyzeWithAI(db, ticketId): Promise<RankingResult>
  generateRecommendation(db, ticketId): Promise<Recommendation>
  recordRecommendation(db, ticketId, data): Promise<void>
}
```

#### 3.2 Refactor Routers to Use Service

Routers become thin:
1. Validate input (Zod)
2. Call service method
3. Map errors to TRPCError

**Files Changed:**
- `src/server/tickets/ticket-service.ts` (new)
- `src/server/api/routers/ticket.ts`
- `src/server/api/routers/agentServer.ts`

---

### Phase 4: Clean Schema & Session Storage (Priority: Low)

**Goal:** Remove cruft, simplify storage.

#### 4.1 Remove posts Table

Delete from `src/server/db/schema.ts`:
- `posts` table definition
- Related relations

Regenerate migrations if needed.

#### 4.2 Simplify OpenCode Session Storage

**Decision:** Use metadata-only approach (Option A)

- Store active session ID in `tickets.metadata.opencodeSessionId`
- Rely on OpenCode server as source of truth for messages
- Remove `opencodeSessionsTable` if not needed for archival

If archival is needed, keep the table but access only through `OpencodeTicketService`.

**Files Changed:**
- `src/server/db/schema.ts`
- Migration files

---

### Phase 5: Clarify AI Module Naming (Priority: Low)

**Goal:** Reduce confusion between AI modules.

#### 5.1 Add Documentation

Create README files:

`src/server/ai/README.md`:
```markdown
# AI Text Providers

Stateless LLM providers for one-shot text generation and analysis.

- **OpenRouter** - Primary provider for paid models
- **Cerebras** - Alternative fast inference provider

Use `analyzeWithAI()` for ticket ranking, recommendations, and chat.
```

`src/server/ai-agents/README.md`:
```markdown
# AI Agent Providers

Session-based code agents with tool execution capabilities.

- **OpenCode** - Primary agent provider for code analysis

Uses `AgentRegistry` pattern for pluggable providers.
```

#### 5.2 Optional: Rename Folders

Consider renaming for clarity:
- `src/server/ai/` → `src/server/llm/`
- `src/server/ai-agents/` → `src/server/agents/`

**Files Changed:**
- `src/server/ai/README.md` (new)
- `src/server/ai-agents/README.md` (new)

---

## Verification Criteria

### Phase 1 Verification
- [ ] `OpencodeTicketService` exists and is used by both routers
- [ ] Legacy `opencode.ts` functions have `@deprecated` JSDoc comments
- [ ] No direct imports from `@/server/tickets/opencode` in routers (except deprecated endpoints)
- [ ] `bun run typecheck` passes

### Phase 2 Verification
- [ ] `ticketRouter` has no OpenCode chat/session endpoints
- [ ] `agentServerRouter.askOpencode` writes to `ticketRecommendations` table
- [ ] Frontend uses only `agentServerRouter` for agent operations
- [ ] All existing functionality works (manual testing)

### Phase 3 Verification
- [ ] `ticketService` contains all ticket business logic
- [ ] Router procedures are < 20 lines each (validation + service call + error mapping)
- [ ] `bun run typecheck` passes

### Phase 4 Verification
- [ ] `posts` table removed from schema
- [ ] `bun run db:generate` succeeds
- [ ] Session storage decision documented and implemented consistently

### Phase 5 Verification
- [ ] README files exist in both AI directories
- [ ] New developer can understand the difference in < 2 minutes

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking frontend API calls | Keep deprecated endpoints temporarily with console warnings; migrate frontend first |
| Data loss from table removal | Verify no runtime usage via logs before removing `opencodeSessionsTable` |
| Behavior drift during consolidation | Write tests for canonical "ask about ticket" flow before refactoring |
| AgentRegistry not initialized | Ensure `OpencodeProvider` registration fails loudly on boot if misconfigured |

---

## Implementation Order

```
Phase 1.1 → Phase 1.2 → Phase 1.3 → Phase 2 → Phase 3 → Phase 4 → Phase 5
   ↓           ↓           ↓          ↓          ↓          ↓          ↓
 Service    Deprecate   Migrate    Unify     Extract    Clean     Document
 Created    Legacy      Routers    tRPC      Logic      Schema
```

Each phase can be merged independently. Phase 1-2 should be done together to avoid intermediate broken states.

---

## Out of Scope

- Multi-tenant support
- Additional AI provider integrations
- Rate limiting / circuit breaking
- Full DDD architecture refactor
