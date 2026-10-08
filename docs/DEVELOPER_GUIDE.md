# Developer Guide

## Quick Start

```bash
npm install
cp .env.example .env   # fill in Auth0 + LLM values (see below)
npm run dev            # auto-restarts on file changes
# Open http://localhost:3000
```

## Directory Structure

```
node-ai-assistant/
├── src/
│   ├── server.js          # Express server, Auth0, API routes, SSE
│   ├── agent.js           # LangGraph agent (Gemini + MemorySaver)
│   ├── tools.js           # AI tools + auth-required signal helpers
│   ├── auth0.js           # Normalized Auth0 domain (shared config)
│   ├── observability.js   # Agent callbacks → logs (tokens masked)
│   └── logger.js          # Winston console logger
├── public/
│   ├── index.html         # Single chat page
│   ├── style.css          # Light/dark, responsive
│   └── js/
│       ├── auth.js        # Auth state (/api/auth/status, /api/me)
│       └── chat.js        # Chat, SSE reader, login button, local history
├── test/                  # node:test suites
├── docker/mitmproxy/      # logger_addon.py (CA files generated, gitignored)
├── docs/                  # Architecture, logging, PlantUML diagrams
├── Dockerfile, docker-compose.yml, docker-compose.debug.yml
└── .env.example
```

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `LLM_API_KEY` | Yes | Google Gemini key: https://aistudio.google.com/apikey |
| `LLM_MODEL` | Yes | Gemini model name |
| `AUTH0_DOMAIN` | Yes | e.g. `your-tenant.auth0.com` (or set `ISSUER_BASE_URL`) |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Yes | Regular Web App credentials |
| `AUTH0_SECRET` | Yes | Session cookie key: `openssl rand -hex 32` |
| `APP_BASE_URL` | No | Default `http://localhost:3000` |
| `AUTH0_API_AUDIENCE` | No | Your own API's identifier; see [ARCHITECTURE.md](ARCHITECTURE.md#auth0-setup) |
| `PORT` | No | Default `3000` |
| `LOG_LEVEL` | No | `error` / `warn` / `info` (default) / `debug` |
| `DEBUG` | No | `express-openid-connect` for Auth0 library internals |

## Adding a Tool

1. Define it in `src/tools.js`:
```javascript
const myTool = tool(
  async (input, config) => {
    if (!config.configurable?.authenticated) {
      return createAuthRequiredPayload("my_tool requires login");
    }
    const accessToken = config.configurable.__accessToken; // if calling an API as the user
    return "result";
  },
  {
    name: "my_tool",
    description: "What this tool does (the LLM reads this to decide when to call it)",
    schema: z.object({ /* inputs */ }),
  }
);
```
2. Add it to the exported `tools` array. The agent picks it up automatically.

**Public tools** skip the auth check. **Login-required tools** must *return* `createAuthRequiredPayload(...)`. The server detects that payload in the tool output and sends `requireAuth: true`, and the UI shows the *Log in* button. Never rely on the LLM's wording to trigger login.

## Customizing the UI

- **Layout:** `public/index.html` (`#chat-screen`)
- **Chat behaviour:** `public/js/chat.js`
- **Auth display:** `public/js/auth.js`
- **Styling:** `public/style.css`

## Testing

```bash
npm test            # unit tests: auth signal, chat UI simulation, observability/proxy log
npm run test:all    # also test/api-auth-signal.test.js; needs the server running with a valid LLM key
```

Manual checks:
- [ ] Anonymous chat works (`What time is it in Tokyo?`)
- [ ] Anonymous "Who am I?" shows the *🔐 Log in* button
- [ ] Login completes and the pending prompt is re-sent automatically
- [ ] Logged in, "Who am I?" returns data from `/userinfo`
- [ ] The access token refreshes after it expires
- [ ] *New chat* starts a separate conversation; *Log out* returns to Guest

Quick API check:
```bash
curl http://localhost:3000/api/auth/status
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What time is it?","threadId":"test"}'
```

## Useful Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Run with `--watch` |
| `npm run debug` | Run with `--inspect` |
| `npm run stop` | Kill a server on port 3000 |
| `npm run debug:proxy` | Run locally through mitmproxy (see [LOGGING.md](LOGGING.md)) |
| `npm run docker:up` / `docker:debug` / `docker:logs` / `docker:down` | Docker workflows |
