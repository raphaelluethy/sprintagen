<!-- c5d8be56-7295-4114-acdd-6ab7b1e1b092 3aa9e536-0fb0-4662-b4f1-b1ddec80ca2a -->
# Plan: Docker dev setup and Opencode chat UI with Opencode auth

### 1. Dockerfiles and entrypoint for dev

- **Create `Dockerfile` for the Next.js app (dev)**: Use a Node + pnpm base image, install dependencies, and run `pnpm dev` with `next dev --turbo` exposing port 3000. Mount the project as a volume so code changes are picked up live, and keep `db.sqlite` inside the project directory so it persists on the host.
- **Create `Dockerfile.opencode` for the Opencode server**: Use a Node + pnpm base image, install the `opencode` CLI via pnpm, add a small `entrypoint.sh` that (a) optionally clones `GIT_REPO_URL` into `/workspace/repo` when provided, and (b) otherwise trusts a volume-mounted `/workspace/repo` (which can be mounted read-only to ensure the agent cannot modify code, while still being able to read commit history).
- **Entrypoint behavior**: In `entrypoint.sh` detect whether `/workspace/repo/.git` already exists (volume case) and skip cloning if so; always `cd /workspace/repo` and run `opencode serve --hostname 0.0.0.0 --port 4096` as documented in the Opencode server docs (`https://opencode.ai/docs/server/`).

### 2. `docker-compose.yml` for local development

- **Define `web` service**: Build from the main `Dockerfile`, use `command: pnpm dev`, map `3000:3000`, load env from `.env`, and mount `.:/app` plus a named volume for `/app/node_modules` to avoid clobbering dependencies.
- **SQLite persistence**: Ensure `DATABASE_URL="file:./db.sqlite"` continues to work by keeping `working_dir: /app` and sharing the project root; this means the SQLite file lives in the bind-mounted project folder and persists across container runs.
- **Define `opencode` service**: Build from `Dockerfile.opencode`, expose `4096:4096`, declare `environment` for `GIT_REPO_URL` (optional) and a shared network with `web`. Document that private repos should be mounted via a read-only volume like `./my-repo:/workspace/repo:ro` instead of cloning.
- **Networking between services**: Add an env var like `OPENCODE_SERVER_URL=http://opencode:4096` into the `web` service so the Next app can talk to the Opencode server by service name on the Docker network.

### 3. Env wiring for Opencode in the Next app

- **Extend `src/env.js`**: Add a new server-side env var `OPENCODE_SERVER_URL` (string URL, optional in dev) to the `createEnv` schema and `.env.example`, keeping the existing `OPENCODE_IMAGE` / `DOCKER_SOCKET` entries intact.
- **Opencode provider auth env**: Add one or more env vars to carry the credentials the Opencode agent needs (for example `OPENCODE_PROVIDER_ID` and `OPENCODE_PROVIDER_API_KEY`, or reuse `OPENROUTER_API_KEY`/`CEREBRAS_API_KEY` if you want Opencode to talk to the same providers) and surface them in `runtimeEnv` so they can be passed into the Opencode container.
- **Runtime usage**: Use `env.OPENCODE_SERVER_URL` and the auth-related envs only on the server side (API routes / server components) so URLs and keys are never hard-coded or exposed to the browser.

### 4. Auth handshake against Opencode `/auth/:id`

- **Container-side bootstrap**: In the Opencode Docker image, add a small Node or shell bootstrap (run from `entrypoint.sh`) that, once the Opencode server is listening, calls `PUT /auth/:id` as described in the Opencode docs (`https://opencode.ai/docs/server/`) to register credentials for the configured provider ID using the env-provided key(s).
- **Retry and health behavior**: Implement a simple wait/retry loop so the bootstrap only proceeds once `GET /app` (or `/config`) responds successfully, and fail fast with clear logs if auth cannot be configured (missing env, bad key, etc.).
- **Optional refresh endpoint**: Optionally expose a Next.js API route like `/api/opencode/auth` that can be triggered from the UI to re-run the auth setup (calling through to the container’s `/auth/:id` endpoint) if keys are rotated while the stack is running.

### 5. Next.js API proxy to Opencode server

- **Session management endpoints**: Add an API route like `src/app/api/opencode/sessions/route.ts` that proxies `GET` to `GET /session` on the Opencode server and `POST` to `POST /session` to create a new session (body `{ title? }`), using `env.OPENCODE_SERVER_URL`.
- **Message endpoints**: Add nested routes like `src/app/api/opencode/sessions/[id]/messages/route.ts `that (a) `GET` messages via `GET /session/:id/message` and (b) `POST` a new user message via `POST /session/:id/message`, shaping the request body to match the `ChatInput` schema from the Opencode OpenAPI spec (`/doc`) and handling basic error mapping.
- **Optional utility route**: Optionally add a simple health-check route (e.g. `/api/opencode/health`) that hits `/app` on the Opencode server to verify connectivity and surface clear errors in the UI when the Opencode service is down.

### 6. `/admin/chats` UI route in the Next app

- **Route skeleton**: Create `src/app/admin/chats/page.tsx` as a client component that uses existing UI primitives (`card`, `tabs`, `scroll-area`, `textarea`, `button`, etc.) to present a two-pane layout: left for sessions, right for messages.
- **Session list panel**: On mount, call the proxy `GET /api/opencode/sessions` to list sessions (id, title, created time), allow selecting an existing session, and provide a button to create a new session (POST to `/api/opencode/sessions`).
- **Chat panel**: For the selected session, fetch messages via `GET /api/opencode/sessions/[id]/messages` and render them in a scrollable area; below that, add a message input box and send button that POSTs to `/api/opencode/sessions/[id]/messages`, then refreshes or appends to the message list. Start with a simple request/response model (no streaming), and add loading/error states consistent with the rest of the app.
- **Styling and access**: Integrate this page into the existing layout (header, background, container) and keep it under the `/admin/chats` path; if you already have auth/roles, we can later gate it so only admins can access it.

### 7. (Optional) Minimal persistence tables in `schema.ts`

- **Opencode session metadata table**: Add a new `sqliteTable` like `sprintagen_opencode_session` with fields such as `id`, `opencodeSessionId`, `title`, `repoUrl`, `createdAt`, and possibly a foreign key to `user.id` if you want per-user scoping. This can be used to remember which sessions belong to this app and surface them alongside the raw `/session` data.
- **Integration layer (later if needed)**: In a follow-up iteration, we can wire this table into the API proxy so that when a new Opencode session is created we also persist a record in SQLite, enabling richer filtering and association to tickets; for this first pass, the UI can rely solely on the Opencode server’s `/session` and `/session/:id/message` endpoints.

### 8. Docs and formatting

- **Update `README.md`**: Add a short section describing how to run the dev stack with `docker compose up`, how to pass `GIT_REPO_URL`, how auth is wired into Opencode via `/auth/:id`, and how to mount a read-only repo if authentication is required.
- **Run checks/formatters**: After implementation, run `pnpm check` or at least `pnpm run check:write` (or the Biome script you prefer) to keep style consistent, and ensure TypeScript types compile.

### To-dos

- [ ] Add main app Dockerfile and Opencode-specific Dockerfile with entrypoint script for cloning or mounting a repo read-only.
- [ ] Create docker-compose.yml wiring web and opencode services with ports, volumes, and env vars for dev.
- [ ] Extend src/env.js and .env.example with OPENCODE_SERVER_URL and wire it into runtime usage.
- [ ] Implement Next.js API routes under /api/opencode/* that proxy to the Opencode server for sessions and messages.
- [ ] Implement /admin/chats page with session list and chat panel using the proxy APIs.
- [ ] (Optional) Add a minimal sprintagen_opencode_session table in schema.ts for future persistence of Opencode session metadata.