# Rework Plan: Typing, Strategy Abstraction, UI Alignment, Testing

## Objectives
- Strong typing and documentation across Opencode flows.
- Strategy-pattern abstraction for AI assistant providers (Opencode + future).
- Tests that mock the provider and verify data flow.
- UI aligned with Opencode design (via BTCA guidance).
- Clean component/page naming and structure.
- Safe dependency updates.
- Repo structure reviewed for feature-first clarity.

## Phases
1) Discovery & Standards
   - Inventory Opencode touchpoints (routers, services, hooks, UI) and typing gaps.
   - Establish TS/Zod/TSDoc conventions for public helpers and data models.

2) Strategy Abstraction
   - Define `AiAssistantProvider` interface (sessions, messages, events, ask, health).
   - Implement `OpencodeProvider` using the SDK; centralize model/config selection.
   - Add provider factory (env-driven) for future providers; inject into server/services.

3) Typing & Documentation
   - Formalize session/message/event schemas and ticket metadata for Opencode linkage.
   - Add TSDoc to public helpers, provider interface, and adapters.

4) Testing with Mocks
   - Select Vitest (via Bun) with minimal setup.
   - Unit-test provider abstraction (mocking Opencode SDK responses).
   - Service/router tests injecting a mock provider to validate data flow (sessions, messages, SSE filtering).

5) UI Alignment (Opencode)
   - Run BTCA: `btca ask -t opencode -q "<UI patterns>"`.
   - Apply design tokens (spacing, typography, colors) to match Opencode.
   - Refine Opencode-related components (tool-call display, chat panes) for pattern parity.

6) Component & Naming Cleanup
   - Normalize feature foldering (e.g., `src/features/opencode`, `src/features/tickets`, `src/features/admin-chat`).
   - Rename components for clarity (e.g., `OpencodeToolCallPanel`, `TicketAssistantTab`).
   - Extract shared Opencode UI pieces into `components/opencode/`; keep routing glue in app pages.

7) Dependency Refresh & Safety
   - Review and bump minor/patch versions; use `bun update --latest` selectively.
   - Run `bun run check` and `bun run typecheck`; fix any regressions.

8) Repo Structure Re-evaluation
   - Propose feature-first layout; keep shared libs in `src/lib` and `src/server`.
   - Keep App Router pages thin; delegate logic to feature modules.

9) Docs & Handoff
   - Update README/architecture notes for strategy, tests, and UI alignment.
   - Add "how to add a new AI provider" guide.

## Deliverables
- Provider interface + Opencode adapter wired through server/ticket services.
- Typed models/schemas + TSDoc.
- Tests with mock provider covering data flow.
- UI styling closer to Opencode patterns.
- Cleaned component naming/structure.
- Dependencies updated and validated.
- Updated docs for architecture and provider extensibility.
