# Architecture Overview

An AI assistant with a clean frontend/backend split. Anyone can chat anonymously; login is requested only when a tool needs the user's identity.

- Component diagram: [ARCHITECTURE.puml](ARCHITECTURE.puml)
- Step-by-step flows: the numbered sequence diagrams listed in [README.md](README.md)

## Backend (`src/`)

### `server.js` — Express server & routing
- Auth0 via `express-openid-connect` with `authRequired: false` (chat never requires login)
- Session is an encrypted, HTTP-only cookie; tokens stay on the server and are never sent to the browser
- Endpoints:

| Route | Purpose |
|-------|---------|
| `GET /` | Serves `index.html` |
| `GET /healthz` | Health check (Docker) |
| `GET /auth/login`, `/auth/signup`, `/auth/logout`, `/auth/callback` | Auth0 Universal Login |
| `GET /api/auth/status` | `{ authenticated: boolean }` |
| `GET /api/me` | `{ name, email, picture }`, 401 when anonymous |
| `POST /api/chat` | `{ message, threadId }` → Server-Sent Events, works anonymous or logged in |
| `POST /api/internal/proxy-log` | Receives mitmproxy events (requires `x-internal-proxy-log: true`), see [LOGGING.md](LOGGING.md) |

### `agent.js` — LangGraph agent
- `createAgent` (from `langchain`) with Google Gemini (`LLM_MODEL`)
- `MemorySaver` checkpointer keyed by `thread_id`: in-memory, lost on restart

### `tools.js` — AI tools and the auth signal
| Tool | Access | Behaviour |
|------|--------|-----------|
| `get_current_time(timezone?)` | Public | Current time in an IANA timezone |
| `get_user_profile()` | Login required | Calls Auth0 `/userinfo` with the user's access token |
| `request_login()` | Public | Returns the auth-required signal when the user asks to log in |

Tools that need login **return** `createAuthRequiredPayload(...)` (they do not throw). `isAuthRequiredSignal(messages)` scans only the ToolMessages of the current turn for that payload.

### `observability.js` / `logger.js`
Winston console logger plus LangChain callbacks that log LLM and tool calls with timings, masking tokens. See [LOGGING.md](LOGGING.md).

## Frontend (`public/`)

- **`index.html`** — a single chat screen. The header shows the user name ("Guest" when anonymous), *New chat*, and *Log in* or *Log out*.
- **`js/auth.js`** — on load calls `/api/auth/status`, then `/api/me` if logged in; exposes `AUTH` and the `authReady` promise. Logging out clears the local thread and history.
- **`js/chat.js`** — keeps `threadId` and the chat history in `localStorage`, posts to `/api/chat`, and reads the SSE stream. When the stream contains `requireAuth: true` it appends a *🔐 Log in* button and saves the prompt as `pendingMessage`. After login the pending prompt is re-sent automatically.
- **`style.css`** — light/dark (system preference), responsive.

## Chat request flow

```
Browser ──cookie──▶ Express (express-openid-connect)
                      │  req.oidc.accessToken  (refreshed if expired)
                      ▼
                    agent.invoke  configurable: { thread_id, user, authenticated, __accessToken }
                      │
                      ▼
                    get_user_profile ──Authorization: Bearer <token>──▶ https://AUTH0_DOMAIN/userinfo
```

1. The server reads the session. Anonymous users get `user = { sub: "anonymous", name: "Guest" }`.
2. If the user is logged in, the server gets the access token and refreshes it when expired. Login requests `offline_access`, so a refresh token is available.
3. The agent runs to completion. The `__` prefix on `__accessToken` keeps the token out of LangChain tracing metadata.
4. The server sends the final assistant text as one `{ token }` event. If `isAuthRequiredSignal` matched, it then sends `{ requireAuth: true, error }`, followed by `{ done: true }`.

The `threadId` is kept across login, so the conversation continues after the user authenticates.

### SSE events

| Event | Meaning |
|-------|---------|
| `{ token: string }` | Assistant reply text |
| `{ requireAuth: true, error }` | A tool needs login: show the *Log in* button |
| `{ error }` | Agent failure |
| `{ done: true }` | End of turn |

## Auth signal: why not parse LLM text

The login button is driven only by a structured payload that a tool returns:

```json
{ "requiresAuth": true, "error": "AUTH_REQUIRED", "code": "REQUIRES_AUTH", "message": "[AUTH_REQUIRED] ..." }
```

The server inspects ToolMessages and ignores user and assistant text. A reply that only *talks about* logging in (for example "How do I log in to Netflix?") does not trigger the button, and prompt injection cannot fake the signal. Only the current turn is scanned, so a login prompt from an earlier turn does not repeat.

## Auth0 setup

**Application:** Regular Web App
- Allowed Callback URLs: `http://localhost:3000/auth/callback`
- Allowed Logout URLs: `http://localhost:3000`

**Audience (optional):** without `AUTH0_API_AUDIENCE`, Auth0 issues an access token that only works for its own `/userinfo`, which is all `get_user_profile` needs. To have the agent call **your own** API:
1. Applications → APIs → Create API, with Identifier = `AUTH0_API_AUDIENCE`, RS256, and *Allow Offline Access* on. If the API does not exist, login fails with `Service not found: <audience>`.
2. Set `AUTH0_API_AUDIENCE` in `.env`. The access token becomes a JWT for that API and still works for `/userinfo`.

## Key design decisions

1. **Vanilla JS frontend** — no framework or build step
2. **Anonymous-first** — chat works immediately; login only when a tool needs it
3. **Server-side tokens** — the browser holds only the session cookie
4. **Definitive auth signal** — structured tool output, never keyword matching
5. **Separation of concerns** — `auth.js` / `chat.js` on the client; `server.js` (HTTP), `agent.js` (model), `tools.js` (tools) on the server

## Deployment checklist

- [ ] Replace `MemorySaver` with a persistent checkpointer (Postgres, Redis, …)
- [ ] Set `APP_BASE_URL` to the production URL and update the Auth0 callback/logout URLs
- [ ] Use a strong `AUTH0_SECRET` (`openssl rand -hex 32`)
- [ ] Rate-limit `/api/chat`
- [ ] Protect or disable `/api/internal/proxy-log` (debug only)
- [ ] Monitor LLM token usage and costs
