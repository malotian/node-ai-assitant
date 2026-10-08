# Documentation

This folder contains architecture documentation, developer guides, implementation notes, and PlantUML diagrams for the Express AI Assistant.

## Guides & Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Detailed system design and flow walkthroughs
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** — Guide for developers, directory structure, adding tools
- **[LOGGING.md](LOGGING.md)** — Unified Winston + mitmproxy logging and observability guide
- **[PHASE1_IMPLEMENTATION.md](PHASE1_IMPLEMENTATION.md)** — First-party API call and Auth0 implementation notes

## Architecture Diagrams

**[ARCHITECTURE.puml](ARCHITECTURE.puml)**
- System architecture overview
- Component layers: Client, Server, AI, Auth
- Data flow and external service integrations

**[SEQUENCE.puml](SEQUENCE.puml)**
- Comprehensive sequence flows in a single diagram

## Sequence Diagrams

Each diagram shows a complete flow from user action to response.

### 1. [Anonymous Public Tool](01_anonymous_public_tool.puml)
**Scenario:** User asks "What time is it in Tokyo?" without authentication

**Flow:**
- Browser → Server: POST /api/chat
- Server → Agent: invoke with authenticated=false
- Agent calls `get_current_time()` tool (public, no auth required)
- Tool returns result → LLM generates response
- Server checks `isAuthRequiredSignal()` → FALSE
- Response streamed to browser (no login button)

**Key Point:** Public tools work for anonymous users.

---

### 2. [Protected Tool Auth Signal](02_protected_tool_auth_signal.puml)
**Scenario:** User asks "Who am I?" without authentication

**Flow:**
- Browser → Server: POST /api/chat
- Server → Agent: invoke with authenticated=false
- Agent calls `get_user_profile()` tool (protected)
- Tool detects authenticated=false → returns **requiresAuth: true**
- **DEFINITIVE SIGNAL:** ToolMessage contains requiresAuth flag
- Server checks `isAuthRequiredSignal()` → TRUE (scans ToolMessage, never parses LLM text)
- Response + requireAuth event sent to browser
- Browser appends [🔐 Log in] button

**Key Point:** Signal-based auth detection is definitive and immune to prompt injection.

---

### 3. [OAuth Authentication Flow](03_oauth_authentication_flow.puml)
**Scenario:** User clicks [🔐 Log in]

**Flow:**
- Browser → Server: GET /auth/login
- Server → Auth0: Redirect to /authorize (OIDC Code Grant)
- User enters credentials at Auth0
- Auth0 → Server: Redirect with authorization code
- Server exchanges code for tokens (via OIDC middleware)
- Server validates JWT, extracts claims (name, email, sub)
- Server creates session → issues HTTP-only cookie
- Server → Browser: Redirect to home
- Browser fetches /api/auth/status and /api/me
- Header updated: "Alice" + [Log out] button

**Key Point:** Secure session established via OAuth 2.0 / OIDC with HTTP-only cookies.

---

### 4. [Authenticated Protected Tool](04_authenticated_protected_tool.puml)
**Scenario:** User asks "Who am I?" after logging in

**Flow:**
- Browser → Server: POST /api/chat **+ session cookie**
- OIDC middleware validates session → authenticated=true
- Server → Agent: invoke with user config (name, email)
- Agent calls `get_user_profile()` tool
- Tool sees authenticated=true → returns user data from config
- LLM generates response with user's actual data
- Server checks `isAuthRequiredSignal()` → FALSE
- Response streamed (no login button)

**Key Point:** Protected tools succeed when authenticated flag is true.

---

### 5. [Logout & Session Revocation](05_logout_session_revocation.puml)
**Scenario:** User clicks [Log out]

**Flow:**
- Browser → Server: GET /auth/logout
- OIDC middleware invalidates session (deletes from store)
- Server clears HTTP-only cookie (Set-Cookie: ...; Max-Age=0)
- Server → Browser: Redirect to home
- Browser UI clears cached auth state
- Next request without session cookie → authenticated=false
- Protected tools trigger auth signal again

**Key Point:** Session cookie is cleared and session data destroyed.

---

### 6. [Error Handling - Tool Exception](06_error_handling_tool_exception.puml)
**Scenario:** Tool throws an error (e.g., API timeout)

**Flow:**
- Browser → Server: POST /api/chat
- Agent calls tool (e.g., `get_weather()`)
- Tool throws exception → returns ToolMessage with error field
- LLM receives error message → generates recovery response
- Server checks `isAuthRequiredSignal()` → FALSE (no requiresAuth flag)
- Error message safely streamed to browser

**Key Point:** Tool errors are not auth signals; LLM handles gracefully.

---

### 7. [Session Expiration & Recovery](07_session_expiration_recovery.puml)
**Scenario:** Session expires after 24 hours; user tries to call protected tool

**Flow:**
- 24 hours pass → session cookie expires in browser storage
- User → Browser: "Who am I?"
- Browser sends expired session cookie
- OIDC middleware: session lookup fails → authenticated=false
- Protected tool triggers **requiresAuth: true** signal
- Browser shows [🔐 Log in] button
- User clicks → OAuth flow (diagram #3)
- New session established
- Protected tool succeeds

**Key Point:** Expired sessions are detected gracefully; users re-authenticate.

---

## Usage

### View Diagrams

- **Online:** Use [PlantUML.com](http://www.plantuml.com/plantuml/uml/) 
  - Paste content from any `.puml` file
  - Select "SVG" for rendering

- **VS Code:** Install PlantUML extension
  - Open `.puml` file → Preview

- **Local CLI:**
  ```bash
  brew install plantuml  # or apt-get/etc
  plantuml -Tsvg 01_anonymous_public_tool.puml
  ```

### Export

Each diagram can export to: SVG, PNG, PDF

```bash
plantuml -Tsvg *.puml  # All diagrams to SVG
```

---

## Key Concepts

### Definitive Auth Signal
- Located in `ToolMessage.requiresAuth` flag
- Server scans ToolMessage items only
- **Never parses LLM text** (immune to prompt injection)
- Set by protected tools when `config.authenticated=false`

### Config Object
Passed to agent at each invocation:
```javascript
{
  authenticated: boolean,
  user: {
    name: string,
    email: string,
    sub: string  // OIDC subject (unique ID)
  } | null
}
```

### Session Management
- HTTP-only secure cookies (cannot be read by JS)
- Session store: in-memory (MemorySaver)
- Middleware: express-openid-connect (OIDC)
- Expiry: 24 hours (configurable)

### Tool Categories
1. **Public:** `get_current_time` (always allowed)
2. **Protected:** `get_user_profile` (requires auth)
3. **Signal:** `requestLogin` (explicit auth intent)

---

## References

- [ARCHITECTURE.puml](ARCHITECTURE.puml) — System overview
- [SEQUENCE.puml](SEQUENCE.puml) — Sequence overview
- [server.js](../src/server.js) — Express routing & SSE
- [agent.js](../src/agent.js) — LangGraph orchestration
- [tools.js](../src/tools.js) — Tool implementations
- [auth.js](../public/js/auth.js) — Frontend auth state
- [chat.js](../public/js/chat.js) — Chat UI & SSE listener
