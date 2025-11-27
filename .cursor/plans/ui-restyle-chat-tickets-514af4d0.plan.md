<!-- 514af4d0-3e67-4a7a-b859-623825da6ace f56ff9e0-65b4-4c2f-9974-7a878d5f7627 -->
# Restyle Chat and Ticket UI with shadcn + Tailwind

## Scope and Principles

- **Scope**: Redesign the **chat** and **ticket** UIs only; keep all backend, API routes, TRPC hooks, and business logic intact.
- **Libraries**: Use existing **shadcn UI components** (e.g. `button`, `card`, `input`, `textarea`, `tabs`, `scroll-area`, `dialog`, `table`) and **Tailwind CSS utility classes`** for layout and styling.
- **Visual direction**: Modern, minimal, mostly **black/white** with subtle grayscale for borders/backgrounds and a restrained primary accent color for key actions.
- **Non-goals**: No new features, no data model changes, no changes to API contracts or integration flows.

## Key Files to Update

- **Global shell**
- `src/app/layout.tsx`: Ensure app-wide background, typography, and main content container structure reflect the new minimal theme.
- `src/styles/globals.css`: Align body/html background, base text color, and any global helpers with the black/white aesthetic.
- **Chat UI**
- `src/app/admin/chats/page.tsx`: Main admin chat page layout, panels, lists, and composer.
- **Ticket UI**
- `src/app/_components/ticket-table.tsx`: Ticket listing table and surrounding controls.
- `src/app/_components/ticket-modal.tsx`: Ticket detail / edit modal.
- `src/app/_components/create-ticket-dialog.tsx`: New-ticket creation dialog.

## Implementation Steps

### 1. Establish Global Theme and Shell

- **Update layout container** in `layout.tsx` to use a minimal dashboard shell: full-height flex, dark/black background (`bg-black`/`bg-neutral-950`), and white text, with a centered main content area.
- **Set base colors** in `globals.css` so `body`/`html` use appropriate background, `text-white` (or near-white), font smoothing, and consistent font sizing.
- **Ensure shadcn tokens** (e.g. CSS variables from the design system) still work but visually align with a monochrome-first palette.

### 2. Standardize Page Headers and Containers

- For chat and ticket pages, create or adjust a **page header pattern**: title, short description, and primary actions (buttons) aligned using shadcn `button` and Tailwind layout utilities.
- Wrap primary content sections (chat area, ticket table, dialogs) in shadcn `card` or well-structured `div`s with consistent padding, radius, and border treatment to get a cohesive surface style.

### 3. Redesign Chat UI Layout (Admin)

- In `admin/chats/page.tsx`, refactor markup to a **multi-panel layout**:
- **Sidebar**: conversation/session list using `ScrollArea` + `card`/list items, with clear selection states.
- **Main panel**: messages thread with a `ScrollArea` and a sticky header (conversation info) if present.
- Optional **details panel**: only if already present; restyle but do not add new functionality.
- Style **messages** as chat bubbles:
- Align user vs assistant messages left/right with different background shades of black/gray and rounded corners.
- Show timestamps and metadata with small, subtle text; preserve any existing data fields.
- Redesign the **composer/input bar** at the bottom using shadcn `textarea`/`input` and `button`:
- Sticky or anchored to the bottom of the messages panel.
- Clear disabled/loading visual states entirely via classes (no logic changes).

### 4. Modernize Ticket List UI

- In `ticket-table.tsx`, refactor the table into a clean, dense layout using shadcn `Table` (or existing table primitives):
- Improve header and cell padding, vertical alignment, and row hover states.
- Use `Badge` components and Tailwind classes to visually encode **status**, **priority**, or other key fields.
- Ensure alternating row backgrounds or subtle borders for readability on a dark/black canvas.
- Restyle any **filters/search inputs** above the table (if present) with shadcn `input`, `select`, and `button` while keeping their onChange/onClick handlers intact.

### 5. Refine Ticket Dialogs and Modals

- In `ticket-modal.tsx` and `create-ticket-dialog.tsx`, ensure dialogs use the standard shadcn `Dialog` structure with:
- A clear title/subtitle region.
- A content area with labeled form fields using `Label`, `Input`, `Textarea`, and `Select` as appropriate.
- A footer with primary and secondary actions (`button` variants) right-aligned and visually consistent across dialogs.
- Standardize **spacing and grouping** of form fields, section dividers, and helper/error texts using Tailwind utilities.
- Keep all **form field names, validation hooks, and submit handlers** identical; only adjust JSX structure and classNames to improve aesthetics and layout.

### 6. Responsiveness and Polish

- Verify chat and ticket UIs on **small, medium, and large** breakpoints:
- For small screens, allow panels to stack (e.g. chat list collapsible or messages full-width).
- Ensure tables are scrollable horizontally if necessary, instead of overflowing.
- Fine-tune **scroll behavior**, including max-heights and `ScrollArea` usage, so content is accessible in smaller viewports.
- Adjust **focus, hover, and disabled** states to maintain usability and contrast in a black/white theme.

### 7. Verification and Non-functional Checks

- Manually confirm that no **API calls, hooks, or integration code** were modified—only JSX structure and classNames.
- Run the existing **format** and **lint** commands (e.g. `bun run format` / `bun run lint` if configured) to ensure code style and basic static checks pass.
- Do a quick smoke test of chat flows and ticket operations to verify behavior is unchanged aside from visuals.

### To-dos

- [ ] Adjust global theme and layout shell in `layout.tsx` and `globals.css` for a modern black/white base.
- [ ] Redesign the admin chat page UI in `admin/chats/page.tsx` using shadcn components and Tailwind.
- [ ] Modernize the ticket list in `ticket-table.tsx` with shadcn table, badges, and improved spacing.
- [ ] Restyle `ticket-modal.tsx` and `create-ticket-dialog.tsx` dialogs using shadcn dialog and form components.
- [ ] Review chat and ticket UIs across breakpoints and refine responsiveness and scroll behavior.
- [ ] Verify no integration/logic changes and run format/lint after UI updates.