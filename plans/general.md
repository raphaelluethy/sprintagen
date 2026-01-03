# Sprintagen Architecture Rework Plan

## Overview

This plan consolidates the rework of the Sprintagen codebase covering: typing, documentation, AI provider abstraction, testing, UI redesign, component cleanup, dependency updates, and repository structure optimization.

### Design Decisions

- **Agent Mode**: Single active agent - only one agent provider active at a time, switchable via configuration
- **Strategy Pattern**: Opencode abstracted behind an `AiToolStrategy` interface for mockability and extensibility
- **UI Approach**: Inspired by Opencode - adopt token system and principles while maintaining Sprintagen's unique identity
- **Test Coverage**: Critical data flow paths - session composition, SSE streaming, message transforms, ticket-session persistence

### Success Criteria

- **Type safety**: UI and server code do not depend on `@opencode-ai/sdk` types directly; no `@ts-expect-error` in Opencode flows
- **Strategy abstraction**: Opencode is one implementation of the strategy interface, easily mockable
- **Tests**: Vitest tests that mock the strategy and verify data flow boundaries
- **UI**: Aligned design language with Opencode (typography, spacing, surfaces, tool-call presentation)
- **Clean structure**: Consistent naming conventions; reduced duplication across API routes, tRPC, and server modules

---

## Phase 1: Foundation - Typing and Documentation

### 1.1 Create Centralized Type Definitions

**New directory structure:**
```
src/types/
  index.ts              # Central exports
  ticket.ts             # Ticket-related types
  ai-agent.ts           # Agent provider interfaces
  message.ts            # Message/chat types
```

**Current issues to fix:**
- `Record<string, unknown>` for metadata in `src/server/db/schema.ts:52-55,207`
- Inline `RankingResult` type in `src/server/api/routers/ticket.ts:427-434`
- Type assertions without validation (`as Session`) in `src/server/api/routers/opencode.ts`
- Duplicate `Ticket` type in `src/app/page.tsx`, `ticket-table.tsx`, `ticket-modal.tsx`

**Actions:**
1. Define strict metadata interfaces:
```typescript
// src/types/ticket.ts
export interface TicketMetadata {
  opencodeSessionId?: string;
  externalUrl?: string;
  jiraIssueType?: string;
  linearProjectId?: string;
}

export type Ticket = typeof tickets.$inferSelect;
export type TicketWithRelations = Ticket & {
  recommendations?: (typeof ticketRecommendations.$inferSelect)[];
  rankings?: (typeof ticketRankings.$inferSelect)[];
  messages?: (typeof ticketMessages.$inferSelect)[];
};
```

2. Export inline types:
```typescript
// src/types/ai-agent.ts
export interface RankingResult {
  ticketId: string;
  urgencyScore: number;
  impactScore: number;
  complexityScore: number;
  overallScore: number;
  reasoning: string;
}
```

3. Add Zod schemas for runtime validation where type assertions occur

### 1.2 Add JSDoc/TSDoc Documentation

**Priority files:**
- `src/server/api/routers/opencode.ts` (643 lines)
- `src/server/api/routers/ticket.ts` - Full router
- `src/server/tickets/opencode.ts` - Session management
- `src/server/ai/index.ts` - Provider selection
- `src/hooks/useOpencodeSSE.ts` - SSE hook

**Template:**
```typescript
/**
 * Sends a message to an Opencode session for a specific ticket.
 *
 * @param ticketId - The UUID of the ticket
 * @param message - The message content to send
 * @returns OpencodeResult containing the message response or error
 */
```

---

## Phase 2: AI Provider Strategy Pattern

### 2.1 New Directory Structure

```
src/server/ai-tools/
  index.ts                    # Factory: getAiToolStrategy()
  types.ts                    # Domain types (AiSession, AiMessage, AiPart, AiEvent)
  strategy.ts                 # AiToolStrategy interface
  service.ts                  # Business logic using strategy
  model-selector.ts           # Model selection logic
  opencode/
    opencode-strategy.ts      # Opencode adapter (SDK -> domain)
    client.ts                 # SDK client (move from src/lib/opencode-client.ts)
    message-utils.ts          # (move from src/server/opencode/message-utils.ts)
  mock/
    mock-strategy.ts          # Mock for testing
```

### 2.2 Domain Types

```typescript
// src/server/ai-tools/types.ts
export interface AiSession {
  id: string;
  title?: string;
  status: "idle" | "busy" | "error";
  createdAt: Date;
}

export type AiPartType = "text" | "reasoning" | "tool" | "file" | "step-finish";

export interface AiPart {
  type: AiPartType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  parts: AiPart[];
  createdAt: Date;
  metadata?: {
    model?: string;
    toolCalls?: AiToolCall[];
  };
}

export interface AiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  state: "pending" | "running" | "completed" | "error";
  result?: string;
}

export interface AiEvent {
  type: string;
  sessionId: string;
  data: unknown;
  timestamp: Date;
}
```

### 2.3 Strategy Interface

```typescript
// src/server/ai-tools/strategy.ts
export interface AiToolStrategy {
  readonly name: string;

  // Health & Configuration
  isConfigured(): boolean;
  checkHealth(): Promise<boolean>;

  // Session Management
  createSession(title?: string): Promise<AiSession>;
  getSession(sessionId: string): Promise<AiSession | null>;
  listSessions(): Promise<AiSession[]>;
  getStatus(sessionId: string): Promise<AiSession["status"]>;

  // Messaging
  prompt(sessionId: string, message: string): Promise<AiMessage>;
  promptAsync(sessionId: string, message: string): Promise<void>;
  getMessages(sessionId: string): Promise<AiMessage[]>;

  // Real-time
  supportsStreaming(): boolean;
  subscribeEvents?(sessionId: string): AsyncIterable<AiEvent>;
  getEventSourceUrl?(sessionId: string): string;

  // Extended capabilities
  getDiff?(sessionId: string): Promise<string | null>;
  getTodos?(sessionId: string): Promise<unknown[]>;
}
```

### 2.4 Service Layer

```typescript
// src/server/ai-tools/service.ts
export class AiToolService {
  constructor(private strategy: AiToolStrategy) {}

  async getFullSession(sessionId: string): Promise<FullSessionData> {
    // Compose messages, status, diff, todos, tool calls
  }

  async startSessionForTicket(ticket: Ticket): Promise<AiSession> {
    // Create session with ticket context
  }

  async askTicket(sessionId: string, prompt: string): Promise<AiMessage> {
    // Send prompt and handle response
  }
}
```

### 2.5 Files to Refactor

**Move:**
- `src/lib/opencode-client.ts` -> `src/server/ai-tools/opencode/client.ts`
- `src/server/opencode/message-utils.ts` -> `src/server/ai-tools/opencode/message-utils.ts`

**Refactor to use service:**
- `src/server/api/routers/opencode.ts` - Thin orchestration calling service
- `src/app/api/opencode/*` - Keep URLs stable, delegate to service
- `src/server/tickets/opencode.ts` - Wrapper around service or rename to `tickets/ai-assistant.ts`

### 2.6 Model Selector

```typescript
// src/server/ai-tools/model-selector.ts
export interface ModelSelection {
  providerId: string;
  modelId: string;
}

export function getDefaultModel(): ModelSelection {
  return env.FAST_MODE
    ? { providerId: "cerebras", modelId: "zai-glm-4.6" }
    : { providerId: "opencode", modelId: "minimax-m2.1-free" };
}
```

---

## Phase 3: Testing Infrastructure

### 3.1 Configure Vitest

**Add to package.json:**
```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testing-library/react": "^16.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Create vitest.config.ts:**
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 3.2 Mock Strategy

```typescript
// src/server/ai-tools/mock/mock-strategy.ts
export class MockAiToolStrategy implements AiToolStrategy {
  readonly name = "mock";

  private sessions = new Map<string, AiSession>();
  private messages = new Map<string, AiMessage[]>();
  private mockResponses: AiMessage[] = [];
  private mockError?: Error;

  // Configure mock behavior
  setMockResponse(response: AiMessage): void { ... }
  setMockError(error: Error): void { ... }
  reset(): void { ... }

  // Full AiToolStrategy implementation with deterministic data
}
```

### 3.3 Test Files

```
src/server/ai-tools/
  __tests__/
    service.test.ts           # getFullSession, startSessionForTicket, askTicket
    opencode-strategy.test.ts # SDK -> domain mapping
    model-selector.test.ts    # Model selection logic
src/app/api/opencode/
  __tests__/
    events.test.ts            # SSE streaming, bootstrap, event filtering
src/server/tickets/
  __tests__/
    ai-assistant.test.ts      # Ticket session/prompt flow
```

**Critical path tests:**
1. **Service tests**: `getFullSession()` composes correctly (tool call extraction, timestamps, status mapping)
2. **SSE route test**: Bootstrap + forwards only session-relevant events
3. **Ticket flow test**: Create/reuse session -> promptAsync/prompt -> persist session ID

---

## Phase 4: UI Redesign (Opencode-Inspired)

### 4.1 Design Token System

**Create src/styles/tokens.css:**
```css
:root {
  /* Color scales (12-step, OKLCH) */
  --color-smoke-1: oklch(0.99 0 0);
  --color-smoke-6: oklch(0.85 0 0);
  --color-smoke-12: oklch(0.45 0 0);

  --color-cobalt-6: oklch(0.55 0.15 250);  /* Primary/interactive */
  --color-apple-6: oklch(0.65 0.2 145);    /* Success */
  --color-ember-6: oklch(0.6 0.25 25);     /* Error/critical */
  --color-solaris-6: oklch(0.75 0.15 85);  /* Warning */

  /* Semantic tokens */
  --text-base: var(--color-smoke-12);
  --text-weak: var(--color-smoke-9);
  --text-strong: var(--color-smoke-11);
  --surface-base: var(--color-smoke-1);
  --surface-raised: var(--color-smoke-2);
  --border-base: var(--color-smoke-4);

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --text-xs: 0.8125rem;
  --text-sm: 0.875rem;
  --text-base: 0.9375rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-6: 1.5rem;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
}
```

### 4.2 BTCA Research Tasks

Before UI implementation, run:
```bash
btca ask -t opencode -q "Describe Opencode UI design system: typography, spacing, surfaces, message list, tool-call display, code blocks"
btca ask -t opencode -q "How does Opencode present tool calls (pending/running/completed/error) and streaming updates?"
```

### 4.3 Component Split Plan

**Current -> New:**
```
src/app/_components/opencode-tool-call.tsx (507 lines, 5 exports)
  -> src/components/chat/tools/tool-steps-collapsible.tsx
  -> src/components/chat/tools/tool-call-display.tsx
  -> src/components/chat/tools/tool-step-item.tsx
  -> src/components/chat/tools/tool-steps-block.tsx
  -> src/components/chat/reasoning-display.tsx

src/app/_components/ticket-modal.tsx (457 lines)
  -> src/app/_components/ticket-modal/index.tsx
  -> src/app/_components/ticket-modal/header.tsx
  -> src/app/_components/ticket-modal/ai-score-panel.tsx

src/app/_components/ticket-table.tsx (703 lines)
  -> src/app/_components/ticket-table/index.tsx
  -> src/app/_components/ticket-table/control-bar.tsx
  -> src/app/_components/ticket-table/table-row.tsx
```

### 4.4 New Chat Components

```
src/components/chat/
  message/
    user-message.tsx
    assistant-message.tsx
  parts/
    text-part.tsx
    reasoning-part.tsx
    tool-part.tsx
  index.ts
```

### 4.5 Data Attribute Styling Pattern

```tsx
// Before
<div className="flex items-center gap-2 rounded-md bg-background/50">

// After
<div data-component="control-group" data-slot="sort">
```

With companion CSS:
```css
[data-component="control-group"] {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}
```

---

## Phase 5: Client Hooks Migration

### 5.1 New Domain-Typed Hooks

Replace SDK-dependent hooks with domain-typed versions:

```typescript
// src/hooks/useAiToolSession.ts
export function useAiToolSession(sessionId: string) {
  // Returns AiSession, AiMessage[], loading states
  // No SDK types exposed
}

// src/hooks/useAiToolSSE.ts
export function useAiToolSSE(sessionId: string) {
  // Subscribes to SSE events
  // Returns domain-typed AiEvent stream
}
```

### 5.2 Migration Path

1. Introduce new hooks alongside existing ones
2. Keep `useOpencodeSSE` as a wrapper temporarily
3. Migrate components incrementally
4. Remove `@ts-expect-error` casts from `useOpencodeStream.ts`
5. Delete old hooks when migration complete

---

## Phase 6: Component/Page Naming Cleanup

### 6.1 Current Issues

- Flat structure in `_components/` - all tabs at same level
- Inconsistent admin naming - `_utils.tsx` should be in `_lib/`
- Types/constants scattered in `_components/`

### 6.2 Proposed Structure

```
src/
  app/
    (dashboard)/
      page.tsx
      _components/
        dashboard-header.tsx
        stats-grid.tsx
    tickets/
      _components/
        ticket-table/
          index.tsx
          control-bar.tsx
          table-row.tsx
        ticket-modal/
          index.tsx
          header.tsx
          tabs/
            details-tab.tsx
            insights-tab.tsx
            chat-tab.tsx
            agent-tab.tsx
    admin/
      chats/
        _components/
          chat-area.tsx
          sessions-sidebar.tsx
        _lib/
          utils.ts

  components/
    ui/                     # Radix primitives (keep)
    chat/                   # Chat components (new)
    layout/                 # Layout components (new)

  lib/
    constants/
      priorities.ts         # From _components/constants.ts
      statuses.ts
      providers.ts
```

### 6.3 Naming Conventions

Document in `docs/conventions/react.md`:
- File naming: `kebab-case.tsx`
- Export style: Named exports preferred
- Folder conventions: `_components` only for route-local components
- Truly reusable components go in `src/components/`

### 6.4 Migration Steps

1. Create new directories alongside existing
2. Add re-exports from old locations
3. Update imports gradually
4. Remove old locations when all imports updated

---

## Phase 7: Dependency Updates

### 7.1 Critical Fixes

```bash
# Remove dead dependency
bun remove ioredis

# Pin @types/bun (instead of "latest")
# Update package.json: "@types/bun": "^1.1.0"
```

### 7.2 Add New Dependencies

```bash
# Testing
bun add -d vitest @vitest/coverage-v8 @testing-library/react

# Fonts (if self-hosting)
bun add @fontsource/inter @fontsource/ibm-plex-mono
```

### 7.3 Update Process

```bash
# 1. Check outdated
bun outdated

# 2. Update patch versions
bun update

# 3. Update minor versions individually
bun update @opencode-ai/sdk
bun update drizzle-orm drizzle-kit
bun update @trpc/client @trpc/server @trpc/react-query

# 4. Verify after each
bun run check && bun run typecheck && bun run test
```

---

## Phase 8: Repository Structure Optimization

### 8.1 Final Structure

```
sprintagen/
  src/
    app/                      # Next.js App Router (pages only)

    components/               # Shared React components
      ui/                     # Radix primitives
      chat/                   # Chat/message components
      layout/                 # Layout components

    server/                   # Server-only code
      ai/                     # AI providers (Cerebras, OpenRouter)
      ai-tools/               # Strategy pattern (NEW)
        opencode/
        mock/
      api/                    # tRPC setup
      db/                     # Drizzle schema & client
      tickets/                # Ticket providers

    lib/                      # Shared utilities
      constants/
      utils/

    types/                    # Global type definitions (NEW)

    hooks/                    # Shared React hooks

    styles/                   # Global styles & tokens (NEW)

    test/                     # Test utilities (NEW)
      fixtures/
      mocks/
```

### 8.2 Files to Move

| Current | New |
|---------|-----|
| `src/lib/opencode-client.ts` | `src/server/ai-tools/opencode/client.ts` |
| `src/server/opencode/message-utils.ts` | `src/server/ai-tools/opencode/message-utils.ts` |
| `src/app/_components/constants.ts` | `src/lib/constants/index.ts` |
| `src/app/_components/types.ts` | `src/types/chat.ts` |

---

## Phase 9: Documentation & Handoff

### 9.1 Documentation Updates

- Update README with new architecture overview
- Add "How to add a new AI provider" guide
- Document the strategy pattern and service layer
- Update CLAUDE.md with new conventions

### 9.2 Architecture Notes

Create `docs/architecture/`:
- `ai-tools.md` - Strategy pattern, providers, service layer
- `testing.md` - Test setup, mock strategy usage
- `ui-design.md` - Token system, component patterns

---

## Implementation Order

| Phase | Priority | Dependencies | Effort |
|-------|----------|--------------|--------|
| Phase 1: Types & Docs | High | None | Medium |
| Phase 2: Strategy Pattern | High | Phase 1 | High |
| Phase 3: Testing | High | Phase 2 | Medium |
| Phase 5: Client Hooks | High | Phase 2 | Medium |
| Phase 7: Dependencies | Medium | None (parallel) | Low |
| Phase 4: UI Redesign | Medium | Phase 1 | High |
| Phase 6: Naming Cleanup | Low | Phase 4 | Medium |
| Phase 8: Structure | Low | Phases 1-6 | Low |
| Phase 9: Docs | Low | All | Low |

**Recommended execution:** Phases 1-3, 5 first (types/strategy/tests/hooks), then UI/naming (4, 6), then deps/structure/docs (7-9).

---

## Critical Files Summary

**Must modify:**
- `src/server/api/routers/opencode.ts` (643 lines) - Extract to service pattern
- `src/server/api/routers/ticket.ts` - Export inline types, add docs
- `src/server/tickets/opencode.ts` - Refactor into service consumer
- `src/app/_components/ticket-modal.tsx` (457 lines) - Split components
- `src/app/_components/ticket-table.tsx` (703 lines) - Split components
- `src/app/_components/opencode-tool-call.tsx` (507 lines) - Split into 5 files
- `package.json` - Remove ioredis, pin @types/bun, add test deps

**Must create:**
- `src/types/` directory with shared types
- `src/server/ai-tools/` directory with strategy pattern
- `src/styles/tokens.css` with design system
- `src/components/chat/` with message components
- `vitest.config.ts` for testing
- `src/test/` directory with fixtures and mocks

---

## Risk Mitigation

1. **Breaking Changes**: Each phase independently deployable
2. **Type Migration**: Use `// @ts-expect-error MIGRATION` temporarily
3. **Testing During Migration**: Run `bun run check && bun run typecheck` after each change
4. **Rollback**: Atomic commits per sub-task
5. **Validation Checklist**:
   - `bun run check`
   - `bun run typecheck`
   - `bun run test` (after Phase 3)
   - Manual smoke via `bun run dev`

---

## Guardrails

- Keep existing HTTP entrypoints stable (`src/app/api/opencode/*`) to avoid breaking the UI
- Prefer incremental refactors with short-lived compatibility shims (re-exports / wrapper hooks)
- There should be exactly **one** place that imports `@opencode-ai/sdk` (the opencode strategy adapter)
- UI imports only app/domain types, not SDK types
