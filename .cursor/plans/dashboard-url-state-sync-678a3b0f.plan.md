<!-- 678a3b0f-d6bb-4a1a-853d-694264c9e17b 8c4300ae-30d5-4f1a-95da-199c9667b59a -->
## URL State for Dashboard Modal, Sorting, and Filtering

### Overview

We will make the dashboard (`src/app/page.tsx`) and ticket table (`src/app/_components/ticket-table.tsx`) use the URL search params as the single source of truth for the open ticket modal, sorting, and filtering, so that the current view is encoded in the URL and can be reloaded or shared.

### Plan

- **Introduce URL helpers in `page.tsx`**
- Import `useSearchParams`, `useRouter`, and `usePathname` from `next/navigation` into `Dashboard`.
- Add a small `updateSearchParams` helper that takes a partial map of keys to string/null, merges them into the current `searchParams`, and `router.push`es the new URL (using `{ scroll: false }`).

- **Drive modal open/close from URL (`ticketId` param)**
- Derive the currently selected ticket id from `searchParams.get("ticketId")` inside `Dashboard`.
- Replace the `modalOpen` boolean state with a derived `isModalOpen = !!ticketIdParam`.
- Update `handleTicketSelect` to call `updateSearchParams({ ticketId: ticket.id })` and still set `selectedTicket` for instant UI.
- Update `handleModalClose` to clear the URL param with `updateSearchParams({ ticketId: null })` and reset local `selectedTicket`.
- Optionally, to support deep-linking directly to a ticket, add `api.ticket.byId.useQuery({ id: ticketIdParam })` (enabled only when `ticketIdParam` is present) and use that result as the `ticket` for `TicketModal` when there is no locally selected ticket.

- **Lift sorting/filtering/view state into `page.tsx` via URL**
- Define canonical query param names in `Dashboard`: `view` (`"standard" | "ai-ranked"`), `sortBy` (`"createdAt" | "priority" | "aiScore"`), `sortOrder` (`"asc" | "desc"`), and `status` (`"all" | ticket status values`).
- Derive each of these from `searchParams`, with sane fallbacks when params are missing or invalid.
- Add handler functions in `Dashboard` that update these values by calling `updateSearchParams`, e.g. `handleViewModeChange`, `handleSortByChange`, `handleSortOrderChange`, and `handleStatusFilterChange`.

- **Make `TicketTable` a controlled component wired to URL state**
- Extend `TicketTableProps` to accept `viewMode`, `sortBy`, `sortOrder`, `statusFilter`, and corresponding change handlers (plus keep `onTicketSelect`).
- Remove local `useState` for `viewMode`, `sortBy`, `sortOrder`, and `statusFilter` inside `TicketTable`; instead, use the props.
- Wire the UI controls to call the new handlers and use the passed-in values for `value`/`onValueChange` and for toggling sort order.
- Keep the existing TRPC queries but base their inputs on the props (unchanged semantics: `list` for `standard`, `listByAIRank` for `ai-ranked`).

- **Connect `page.tsx` and `TicketTable` via props**
- In `Dashboard`, pass the derived URL-based values and handlers into `TicketTable`:
  - `viewMode`, `sortBy`, `sortOrder`, `statusFilter`.
  - `onViewModeChange`, `onSortByChange`, `onSortOrderChange`, `onStatusFilterChange`.
- Ensure that when the URL updates, both the controls and the TRPC queries reflect the new state, and reloading or sharing the URL restores the same view.

- **Quick sanity checks**
- Verify that clicking a ticket row updates the URL with `ticketId` and opens the modal; closing the modal removes it from the URL.
- Verify that changing view/sort/status updates the URL and that reloading the page preserves those settings.
- Optionally test a direct navigation to a URL containing `ticketId` and sort/filter params to confirm the modal and table come up correctly.

### To-dos

- [ ] Add search param helpers and query param parsing to `Dashboard` in `page.tsx`.
- [ ] Drive ticket modal open/close and selected ticket from `ticketId` search param in `page.tsx`.
- [ ] Lift sorting, status filter, and view mode state from `TicketTable` into URL-driven state in `page.tsx` and adjust props.
- [ ] Update `TicketTable` to use controlled props for view/sort/filter and keep TRPC queries consistent.
- [ ] Manually verify URL behavior for modal, sorting, filtering, and deep-linked tickets.