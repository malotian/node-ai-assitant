# AI Assistant with Auth0 + LangGraph + LLM

A modern, clean Express.js application featuring:
- **Anonymous chat** — Users chat immediately without login
- **Conditional authentication** — Login only when features require it
- **LangGraph ReAct agent** — Tool-calling AI with conversation memory
- **Auth0 integration** — Secure user authentication
- **Vanilla JavaScript frontend** — No frameworks, simple and maintainable

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env  # Fill in Auth0 credentials and LLM API key
# For LLM_API_KEY: Get from https://aistudio.google.com/apikey (Google Gemini)
# For AUTH0_SECRET: `openssl rand -hex 32`

# Run
npm run dev
```

Open http://localhost:3000

## Docker

```bash
npm run docker:up      # start app in Docker
npm run docker:logs    # follow app logs
npm run docker:down    # stop containers
```

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |

## Debugging & Observability

- **End-to-End Unified Logs:** The console displays structured logs for incoming chat requests, LLM execution timings, tool start/completion, and errors.
- **Outbound HTTP (Gemini, Auth0) via mitmproxy:**
  - Docker: `npm run docker:debug`, then open http://localhost:8081 (no password required).
  - Without Docker: start the proxy with `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d mitmproxy`, then `npm run debug:proxy`.
  - In proxy mode, mitmproxy's `logger_addon.py` automatically captures all outbound calls (URL, method, status code, latency) and relays them directly into the Winston log stream for a single readable timeline.
- **Server logs:** `LOG_LEVEL=debug` in `.env`; `DEBUG=express-openid-connect` adds Auth0 library internals.
- **Browser:** DevTools console shows one collapsed group per chat turn; `localStorage.setItem("debug", "off")` silences it.

## Structure

| Component | Purpose |
|-----------|---------|
| `src/server.js` | Express + Auth0 (express-openid-connect) + API routes |
| `src/agent.js` | LangGraph agent (createAgent) with LLM model |
| `src/tools.js` | AI tools with auth checks |
| `src/observability.js` | Console tracing & agent callbacks integrated with Winston |
| `Dockerfile`, `docker-compose.yml` | App image and compose setup |
| `docker-compose.debug.yml` | mitmproxy debug service with logger addon |
| `public/index.html` | Single page (login + chat screens) |
| `public/js/auth.js` | Authentication UI logic |
| `public/js/chat.js` | Chat messaging logic |
| `public/style.css` | Styling (dark/light mode, responsive) |

## Key Features

✅ **Anonymous chat first** — Start without login
✅ **Graceful auth prompts** — Login only when needed
✅ **Tool-aware** — Tools can require authentication
✅ **Clean code** — Simple, understandable architecture
✅ **Mobile responsive** — Works on all devices

## Next Steps

- **Add tools:** Edit `src/tools.js`
- **Switch LLM:** Update `src/agent.js` (supports OpenAI, Anthropic, etc.)
- **Persistent storage:** Replace `MemorySaver` with Redis/Postgres
- **Custom logic:** Extend agent with `StateGraph`

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system design, [DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) for development reference, and the [docs/](./docs/) directory for diagrams and guides.
