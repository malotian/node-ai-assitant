# Unified Logging & Observability Guide

All logs across Express, the LangChain agent, and mitmproxy outbound HTTP traffic flow through Winston into a unified, readable console stream.

## Example Flow (What You See)

```
2026-10-07 19:40:00 [info] 🚀 Assistant running at http://localhost:3000
2026-10-07 19:40:02 [info] Chat request: user=Guest authenticated=false message="What time is it in Tokyo?..."
2026-10-07 19:40:02 [info] 🤖 Agent invoking LLM [gemini-latest-flash]
2026-10-07 19:40:03 [info] 🌐 [mitmproxy] POST https://generativelanguage.googleapis.com/... -> 200 (450ms) [Google Gemini]
2026-10-07 19:40:03 [info] 🤖 LLM response received (455ms)
2026-10-07 19:40:03 [info] 🔧 Tool executing: get_current_time args={"timezone":"Asia/Tokyo"}
2026-10-07 19:40:03 [info] ✅ Tool completed (2ms) -> 10/8/2026, 10:40:03 AM JST
2026-10-07 19:40:03 [info] 🤖 Agent invoking LLM [gemini-latest-flash]
2026-10-07 19:40:04 [info] 🌐 [mitmproxy] POST https://generativelanguage.googleapis.com/... -> 200 (390ms) [Google Gemini]
2026-10-07 19:40:04 [info] 🤖 LLM response received (395ms)
```

## Running with mitmproxy

| Mode | Start | Stop |
|------|-------|------|
| All in Docker | `npm run docker:debug`, then `npm run docker:logs` | `npm run docker:down` |
| App local, proxy in Docker | `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d mitmproxy`, then `npm run debug:proxy` | Ctrl+C, then `npm run docker:down` |

- Web UI with full requests and responses: http://localhost:8081. It shows raw API keys and tokens, so use it only locally.
- `npm start` / `npm run dev` do **not** use the proxy, so no `🌐 [mitmproxy]` lines appear.
- The addon relays to the app at `app:3000` (Docker), then `host.docker.internal:3000`, then `127.0.0.1:3000`. Set `APP_INTERNAL_URL` to override.
- The app must trust the mitmproxy CA (`docker/mitmproxy/mitmproxy-ca-cert.pem`, generated on first start). Both modes set `NODE_EXTRA_CA_CERTS` for you.

## Layers of Logging

1. **Express Server (`src/server.js`)**
   - HTTP request status and duration (under `LOG_LEVEL=debug`)
   - Chat request details (`user`, `authenticated`, prompt preview)
   - Login and auth state transitions

2. **Agent Observability (`src/observability.js`)**
   - Model invocations (`🤖 Agent invoking LLM [...]`)
   - Model completions with execution timing (`🤖 LLM response received (Xms)`)
   - Tool execution start with argument preview (`🔧 Tool executing: [...]`)
   - Tool completion with response preview and timing (`✅ Tool completed (Xms) -> [...]`)
   - Redaction: Bearer tokens and JWTs are automatically masked

3. **Outbound HTTP / mitmproxy (`docker/mitmproxy/logger_addon.py`)**
   - When running in debug / proxy mode (`npm run debug:proxy` or `npm run docker:debug`), mitmproxy intercepts all outbound HTTP traffic
   - Captures calls to Google Gemini (`generativelanguage.googleapis.com`) and Auth0 (`tenant.auth0.com`)
   - Strips sensitive query keys (e.g. `?key=...`)
   - Color-coded status codes and millisecond latency
   - Automatically relays events to `/api/internal/proxy-log` so they appear inline in the application log stream

## Log Levels

- `info` — General information (green)
- `warn` — Warnings (yellow)
- `error` — Errors (red, includes stack trace)
- `debug` — Detailed internal state and per-request lines

Configure via environment variable:
```bash
LOG_LEVEL=debug npm start    # Show all debug logs
LOG_LEVEL=info npm start     # Standard operational logs
```
