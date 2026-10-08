# Documentation

## Guides

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — components, endpoints, chat request flow, auth signal, Auth0 setup
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** — setup, project layout, adding tools, testing
- **[LOGGING.md](LOGGING.md)** — Winston + agent callbacks + mitmproxy logging

## Diagrams (PlantUML)

| Diagram | Scenario |
|---------|----------|
| [ARCHITECTURE.puml](ARCHITECTURE.puml) | Component overview: client, server, AI, external services |
| [01_anonymous_public_tool.puml](01_anonymous_public_tool.puml) | Guest asks "What time is it in Tokyo?" → `get_current_time` → answer, no login button |
| [02_protected_tool_auth_signal.puml](02_protected_tool_auth_signal.puml) | Guest asks "Who am I?" → `get_user_profile` returns the auth-required payload → `requireAuth` event → *🔐 Log in* button |
| [03_oauth_authentication_flow.puml](03_oauth_authentication_flow.puml) | Log in via Auth0 Universal Login (authorization code flow) → session cookie |
| [04_authenticated_protected_tool.puml](04_authenticated_protected_tool.puml) | Logged-in user asks "Who am I?" → `/userinfo` with the user's access token |
| [05_logout_session_revocation.puml](05_logout_session_revocation.puml) | Log out → local chat cleared, session cookie cleared → Auth0 logout → back to Guest |
| [06_error_handling_tool_exception.puml](06_error_handling_tool_exception.puml) | `/userinfo` fails → LLM explains, no auth signal; agent errors → `{ error }` event |
| [07_session_expiration_recovery.puml](07_session_expiration_recovery.puml) | Access token refreshed silently; expired session → guest → log in again → new thread |

### Viewing

- **VS Code:** PlantUML extension → open a `.puml` file → Preview
- **Online:** paste into [plantuml.com](https://www.plantuml.com/plantuml/uml/)
- **CLI:** `plantuml -Tsvg docs/*.puml`

## Key concepts

### Agent config
`server.js` passes this to `agent.invoke` on every chat request:
```javascript
configurable: {
  thread_id: string,            // "<user.sub>:<threadId from browser>", scoped per user
  authenticated: boolean,
  user: { sub, name, email, ... } | { sub: "anonymous", name: "Guest" },
  __accessToken: string | null, // Auth0 access token, server-side only
}
```

### Definitive auth signal
- Protected tools return `createAuthRequiredPayload()` (`requiresAuth: true`)
- `isAuthRequiredSignal()` scans only the ToolMessages of the current turn and never reads LLM text
- The server sends `{ requireAuth: true }` over SSE and the UI shows the *Log in* button

### State
| What | Where | Lifetime |
|------|-------|----------|
| Login session + tokens | Encrypted HTTP-only cookie (`express-openid-connect`) | Library defaults: 24 h rolling, 7 days absolute |
| Conversation memory | `MemorySaver`, keyed by `thread_id` | Until server restart |
| Thread id + owner, rendered history | Browser `localStorage` | Until *New chat* or the user changes (login, logout, other account) |

### Tools
| Tool | Access |
|------|--------|
| `get_current_time` | Public |
| `get_user_profile` | Login required |
| `request_login` | Public; signals login intent |
