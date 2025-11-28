<!-- b0ab91b2-3681-49c5-a8d6-d3daaac83344 fc04719f-fd77-4444-98b2-583c18a4c77c -->
# Per-ticket Ask Opencode Sessions (Created Only On Demand)

#### 1. Backend: Separate "lookup" vs "create" for Opencode sessions

- **Introduce a pure lookup helper in `src/server/tickets/opencode.ts`**: given

### To-dos

- [ ] Add a pure lookup helper and `createNewOpencodeSessionForTicket` in `src/server/tickets/opencode.ts`, and adapt `getOpencodeMessages`, `askOpencodeQuestion`, and `sendOpencodeMessage` to support explicit new-session and explicit-session-ID flows.
- [ ] Add a `ticket.startOpencodeSession` TRPC mutation that creates a fresh Opencode session per ticket and returns its `sessionId` without sending a message.
- [ ] Scope Ask Opencode loading and step polling in `TicketModal` to the ticket that initiated the run using an `activeAskTicketId` state.
- [ ] Make the Opencode chat tab create a new session when opened (via `ticket.startOpencodeSession`), hold that `sessionId` in local state while the modal is open, and pass it into `sendOpencodeChatMessage` so each modal-open lifetime has its own session.
- [ ] Manually test multiple tickets: Ask Opencode on A, then close; open A again to confirm a new session starts on the next Ask; open B and verify no loading state until Ask/Chat is explicitly triggered, and that A and B have separate sessions in the Opencode admin view.
- [ ] Refactor `src/server/tickets/opencode.ts` to separate pure session lookup (no creation) from creation, and make `getOpencodeMessages` use lookup-only behavior.
- [ ] Make `askOpencodeQuestion` always start a new Opencode session per click while persisting that session ID on the ticket for follow-up chat.
- [ ] Update `TicketModal` Ask Opencode state and polling so loading/progress and session polling are scoped to the ticket that initiated the run, avoiding side effects on other tickets.
- [ ] Manually verify that sessions are only created when Ask Opencode (or explicit chat send) is used, and that multiple tickets can be analyzed in parallel without shared loading indicators.