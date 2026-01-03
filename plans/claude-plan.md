# Sprintagen Architecture Rework Plan

## Overview

This plan addresses a comprehensive rework of the Sprintagen codebase covering: typing, documentation, AI provider abstraction, testing, UI redesign, component cleanup, dependency updates, and repository structure optimization.

### Design Decisions

- **Agent Mode**: Single active agent - only one agent provider active at a time, switchable via configuration
- **UI Approach**: Inspired by Opencode - adopt token system and principles while maintaining Sprintagen's unique identity
- **Test Coverage**: Critical paths only - agent provider, message transformation, tRPC procedures

---

## Phase 1: Foundation - Typing and Documentation

### 1.1 Create Centralized Type Definitions

**New files to create:**
```
src/types/
  index.ts              # Central exports
  ticket.ts             # Ticket-related types
  ai-agent.ts           # Agent provider interfaces
  opencode.ts           # Opencode-specific types
  message.ts            # Message/chat types
```

**Current issues to fix:**
- `Record<string, unknown>` for metadata in `src/server/db/schema.ts:52-55,207`
- Inline `RankingResult` type in `src/server/api/routers/ticket.ts:427-434`
- Type assertions without validation (`as Session`) in `src/server/api/routers/opencode.ts:303,418,519`
- Duplicate `Ticket` type in `src/app/page.tsx:22-25`, `ticket-table.tsx:39-42`, `ticket-modal.tsx:39-43`

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
- `src/server/api/routers/opencode.ts` - 643 lines
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
src/server/ai-agents/
  index.ts                    # Agent registry and factory
  types.ts                    # Shared interfaces
  base-agent.ts               # Abstract base class
  model-selector.ts           # Model selection strategy
  providers/
    opencode/
      index.ts                # Opencode agent implementation
      client.ts               # SDK client (move from src/lib/opencode-client.ts)
      message-utils.ts        # (move from src/server/opencode/message-utils.ts)
      types.ts                # Opencode-specific types
    mock/
      index.ts                # Mock agent for testing
```

### 2.2 Core Interfaces

```typescript
// src/server/ai-agents/types.ts
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  metadata?: {
    model?: string;
    toolCalls?: ToolCallInfo[];
    reasoning?: string;
  };
}

export interface AgentSession {
  id: string;
  title?: string;
  status: "idle" | "busy" | "error";
  createdAt: Date;
}

export interface AgentProvider {
  readonly name: string;

  // Health & Configuration
  isConfigured(): boolean;
  checkHealth(): Promise<boolean>;

  // Session Management
  createSession(title?: string): Promise<AgentSession>;
  getSession(sessionId: string): Promise<AgentSession | null>;
  listSessions(): Promise<AgentSession[]>;

  // Messaging
  sendMessage(sessionId: string, message: string, options?: SendMessageOptions): Promise<AgentMessage>;
  getMessages(sessionId: string): Promise<AgentMessage[]>;

  // Real-time (optional capability)
  supportsStreaming(): boolean;
  getEventSourceUrl?(sessionId: string): string;
}
```

### 2.3 Files to Refactor

**Move:**
- `src/lib/opencode-client.ts` → `src/server/ai-agents/providers/opencode/client.ts`
- `src/server/opencode/message-utils.ts` → `src/server/ai-agents/providers/opencode/message-utils.ts`

**Extract hardcoded model selection from:**
- `src/server/api/routers/opencode.ts:327-329,365-367,537-539`
- `src/server/tickets/opencode.ts:397-405`

**Create model selector:**
```typescript
// src/server/ai-agents/model-selector.ts
export function getDefaultModel(): ModelSelection {
  return env.FAST_MODE
    ? { providerId: "cerebras", modelId: "zai-glm-4.6" }
    : { providerId: "opencode", modelId: "minimax-m2.1-free" };
}
```

### 2.4 Agent Registry (Single Active)

```typescript
// src/server/ai-agents/index.ts
export class AgentRegistry {
  private providers = new Map<string, AgentProvider>();
  private activeProvider: string | null = null;

  register(provider: AgentProvider): void;
  get(name: string): AgentProvider | undefined;

  // Single active agent pattern
  setActive(name: string): void;
  getActive(): AgentProvider;

  listAvailable(): string[];
}

export const agentRegistry = new AgentRegistry();

// Configuration via environment
// AGENT_PROVIDER=opencode | mock | claude-code (future)
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

### 3.2 Mock Agent Provider

```typescript
// src/server/ai-agents/providers/mock/index.ts
export class MockAgentProvider implements AgentProvider {
  readonly name = "mock";

  private sessions = new Map<string, AgentSession>();
  private messages = new Map<string, AgentMessage[]>();
  private mockResponses = new Map<string, AgentMessage>();

  // Configure mock responses
  setMockResponse(sessionId: string, response: AgentMessage): void;
  setMockError(error: Error): void;

  // Full AgentProvider implementation...
}
```

### 3.3 Test Files to Create (Critical Paths)

```
src/
  server/
    ai-agents/
      providers/
        opencode/
          message-utils.test.ts   # Message transformation
      model-selector.test.ts      # Model selection logic
    api/
      routers/
        opencode.test.ts          # Agent tRPC procedures
  test/
    fixtures/
      sessions.ts
    mocks/
      agent-provider.ts
    utils.ts
```

**Critical path tests:**
1. `message-utils.test.ts` - Test `transformMessage()`, `extractTextFromParts()`
2. `model-selector.test.ts` - Test model selection based on `FAST_MODE`
3. `opencode.test.ts` - Test session management with mock provider

---

## Phase 4: UI Redesign (Opencode-Inspired)

**Approach**: Adopt Opencode's architectural patterns (token system, data attributes, component structure) while maintaining Sprintagen's unique visual identity. Use similar organization and principles without directly copying colors/styles.

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

### 4.2 Component Split Plan

**Current → New:**
```
src/app/_components/opencode-tool-call.tsx (507 lines, 5 exports)
  → src/components/chat/tools/tool-steps-collapsible.tsx
  → src/components/chat/tools/tool-call-display.tsx
  → src/components/chat/tools/tool-step-item.tsx
  → src/components/chat/tools/tool-steps-block.tsx
  → src/components/chat/reasoning-display.tsx

src/app/_components/ticket-modal.tsx (457 lines)
  → src/app/_components/ticket-modal/index.tsx
  → src/app/_components/ticket-modal/header.tsx
  → src/app/_components/ticket-modal/ai-score-panel.tsx

src/app/_components/ticket-table.tsx (703 lines)
  → src/app/_components/ticket-table/index.tsx
  → src/app/_components/ticket-table/control-bar.tsx
  → src/app/_components/ticket-table/table-row.tsx
```

### 4.3 New Chat Components

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

### 4.4 Data Attribute Styling

Adopt Opencode's pattern:
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

## Phase 5: Component/Page Naming Cleanup

### 5.1 Current Issues

- Flat structure in `_components/` - all tabs at same level
- Inconsistent admin naming - `_utils.tsx` should be in `_lib/`
- Types/constants scattered in `_components/`

### 5.2 Proposed Structure

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

### 5.3 Migration Steps

1. Create new directories alongside existing
2. Add re-exports from old locations
3. Update imports gradually
4. Remove old locations when all imports updated

---

## Phase 6: Dependency Updates

### 6.1 Critical Fixes

**Remove dead dependency:**
```bash
bun remove ioredis
```

**Pin @types/bun:**
```json
"@types/bun": "^1.1.0"  // Instead of "latest"
```

### 6.2 Update Process

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
bun run typecheck && bun run check && bun run build
```

### 6.3 Add New Dependencies

```bash
# Testing
bun add -d vitest @vitest/coverage-v8 @testing-library/react

# Fonts (if self-hosting)
bun add @fontsource/inter @fontsource/ibm-plex-mono
```

---

## Phase 7: Repository Structure Optimization

### 7.1 Final Structure

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
      ai-agents/              # Agent strategy pattern (NEW)
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

### 7.2 Files to Move

| Current | New |
|---------|-----|
| `src/lib/opencode-client.ts` | `src/server/ai-agents/providers/opencode/client.ts` |
| `src/server/opencode/message-utils.ts` | `src/server/ai-agents/providers/opencode/message-utils.ts` |
| `src/app/_components/constants.ts` | `src/lib/constants/index.ts` |
| `src/app/_components/types.ts` | `src/types/chat.ts` |

---

## Implementation Order

| Phase | Priority | Dependencies |
|-------|----------|--------------|
| Phase 1: Types & Docs | High | None |
| Phase 2: Strategy Pattern | High | Phase 1 |
| Phase 3: Testing | High | Phase 2 |
| Phase 6: Dependencies | Medium | None (parallel) |
| Phase 4: UI Redesign | Medium | Phase 1 |
| Phase 5: Naming Cleanup | Low | Phase 4 |
| Phase 7: Structure | Low | Phases 1-5 |

---

## Critical Files Summary

**Must modify:**
- `src/server/api/routers/opencode.ts` (643 lines) - Extract to agent pattern
- `src/server/api/routers/ticket.ts` - Export inline types, add docs
- `src/server/tickets/opencode.ts` - Refactor into agent provider
- `src/app/_components/ticket-modal.tsx` (457 lines) - Split components
- `src/app/_components/ticket-table.tsx` (703 lines) - Split components
- `src/app/_components/opencode-tool-call.tsx` (507 lines) - Split into 5 files
- `package.json` - Remove ioredis, pin @types/bun, add test deps

**Must create:**
- `src/types/` directory with shared types
- `src/server/ai-agents/` directory with strategy pattern
- `src/styles/tokens.css` with design system
- `src/components/chat/` with message components
- `vitest.config.ts` for testing
- `src/test/` directory with fixtures and mocks

---

## Risk Mitigation

1. **Breaking Changes**: Each phase independently deployable
2. **Type Migration**: Use `// @ts-expect-error MIGRATION` temporarily
3. **Testing During Migration**: Run `bun run check && bun run typecheck && bun run build` after each change
4. **Rollback**: Atomic commits per sub-task
