# Architecture Overview

This project is an AI assistant with a clean separation between frontend and backend, supporting both anonymous and authenticated users.

```plantuml
@startuml Express_AI_Assistant_Architecture
!theme plain
skinparam componentStyle uml2
skinparam packageStyle rectangle
skinparam shadowing false
skinparam roundcorner 8
skinparam defaultFontName Arial

title Express AI Assistant - System Architecture

package "Frontend (Browser Client)" {
    [index.html] as HTML
    [js/auth.js] as AuthUI
    [js/chat.js] as ChatUI
    [style.css] as Style
    
    HTML ..> AuthUI : loads
    HTML ..> ChatUI : loads
    HTML ..> Style : loads
}

package "Backend (Express Server)" {
    [src/server.js\nExpress App] as Server
    [express-openid-connect\nOIDC Middleware] as OIDC
    [src/logger.js\nWinston Logger] as Logger
    
    Server --> OIDC : session & auth
    Server --> Logger : logs events
}

package "AI Agent Layer" {
    [src/agent.js\nLangGraph Agent] as Agent
    [MemorySaver\nCheckpointer] as Memory
    [ChatGoogleGenerativeAI\nModel Client] as LLMClient
    
    Agent --> Memory : conversation state
    Agent --> LLMClient : prompt & invoke
}

package "AI Tools (src/tools.js)" {
    [get_current_time\n(Public Tool)] as ToolTime
    [get_user_profile\n(Auth Required)] as ToolProfile
    [request_login\n(Explicit Login Intent)] as ToolLogin
    [isAuthRequiredSignal()\n(Definitive Signal Validator)] as SignalDetector
}

cloud "External Services" {
    [Auth0\nUniversal Login] as Auth0
    [Google Gemini API] as GeminiAPI
}

' Frontend <-> Backend
ChatUI -right-> Server : POST /api/chat (SSE Stream)
AuthUI --> Server : GET /api/auth/status\nGET /api/me
HTML --> Server : GET /auth/login\nGET /auth/logout

' Backend Auth
OIDC <--> Auth0 : OAuth 2.0 / OIDC Authorization Code Flow

' Backend <-> Agent
Server --> Agent : agent.invoke(messages, config)
Agent --> ToolTime : calls public tool
Agent --> ToolProfile : calls profile tool
Agent --> ToolLogin : calls login request
Server --> SignalDetector : inspects ToolMessage trace (ignores LLM text)
LLMClient <--> GeminiAPI : generateContent (Function Calling)

@enduml
```

## Backend Structure (`src/`)

### `server.js` — Express server & routing
- **Entry point**: Runs on `http://localhost:3000`
- **Auth**: Auth0 integration via `express-openid-connect` (optional, not required for chat)
- **Key endpoints**:
  - `GET /` — Serves index.html (shows login or chat based on auth status)
  - `GET /api/auth/status` — Returns `{authenticated: boolean}`
  - `GET /api/me` — Returns user profile (requires login)
  - `POST /api/chat` — Streams chat responses as Server-Sent Events
    - Works for **both anonymous and authenticated users**
    - Passes `authenticated` flag to agent so tools can check auth status

### `agent.js` — LangGraph ReAct agent
- Uses `createReactAgent` from LangGraph (ReAct = Reasoning + Acting pattern)
- Model: Google Gemini
- Checkpointer: In-memory (use Postgres/Redis for production)
- System prompt: Friendly, concise personal assistant

### `tools.js` — AI tools
- **`get_current_time(timezone?)`** — Public tool, works for all users
- **`get_user_profile()`** — Auth-required, throws error if `authenticated === false`

## Frontend Structure (`public/`)

### `index.html` — Single page, two screens
- **Login screen**: Shows for non-authenticated users (or if not in anonymous mode)
  - "Log in" button
  - "Sign up" button
  - "Start chatting anonymously" link
- **Chat screen**: Shows for all users (authenticated or anonymous)
  - Header with user name (shows "Guest" for anonymous)
  - Chat log (messages)
  - Input form
  - New chat button
  - Log out button (only for authenticated users)

### `js/auth.js` — Authentication UI logic
- Checks `/api/auth/status` on page load
- Fetches `/api/me` if authenticated
- Stores auth state in `AUTH` object
- Handles anonymous mode toggle
- Renders login or chat screen based on auth state

### `js/chat.js` — Chat messaging logic
- Manages thread ID (UUID, persisted per browser session)
- Sends messages to `/api/chat` endpoint
- Streams Server-Sent Events (SSE) responses
- Displays tool usage (e.g., "🔧 using get_current_time…")
- Handles auth errors gracefully:
  - If tool requires auth, shows login prompt to user
  - User can click "Log in" to proceed

### `style.css` — Styling
- Dark/light mode support (system preference)
- Mobile-responsive layout
- Clean, minimal design

## Data Flow

```plantuml
@startuml Definitive_Auth_Signal_Sequence
!theme plain
autonumber
skinparam shadowing false
skinparam roundcorner 6
skinparam defaultFontName Arial

title Express AI Assistant - Definitive Signal & Authentication Flow

actor User
participant "Chat UI\n(chat.js)" as UI
participant "Express Server\n(server.js)" as Server
participant "LangGraph Agent\n(agent.js)" as Agent
participant "Tools\n(tools.js)" as Tools
participant "Gemini LLM" as LLM
participant "Auth0" as Auth0

== 1. Public Tool Flow (Anonymous) ==
User -> UI : "What time is it in Tokyo?"
UI -> Server : POST /api/chat { message, threadId }
Server -> Agent : agent.invoke() [authenticated: false]
Agent -> LLM : Prompt user message
LLM --> Agent : FunctionCall: get_current_time({ timezone: "Asia/Tokyo" })
Agent -> Tools : execute get_current_time
Tools --> Agent : ToolMessage: "4:57 AM JST"
Agent -> LLM : Return tool output
LLM --> Agent : AIMessage: "It's 4:57 AM in Tokyo."
Agent --> Server : result { messages }
Server -> Server : isAuthRequiredSignal(messages) -> false
Server -> UI : SSE { token: "It's 4:57 AM in Tokyo." }
Server -> UI : SSE { done: true }
UI -> User : Displays answer (No login button)

== 2. Auth-Protected Tool Flow (Definitive Signal Base) ==
User -> UI : "Who am I?"
UI -> Server : POST /api/chat { message, threadId }
Server -> Agent : agent.invoke() [authenticated: false]
Agent -> LLM : Prompt user message
LLM --> Agent : FunctionCall: get_user_profile()
Agent -> Tools : execute get_user_profile (config.authenticated = false)
note over Tools #ffebee
  Definitive Signal:
  returns { requiresAuth: true, error: "AUTH_REQUIRED" }
end note
Tools --> Agent : ToolMessage (content contains requiresAuth: true)
Agent -> LLM : Provide tool result
LLM --> Agent : AIMessage: "Please log in so I can look up your profile."
Agent --> Server : result { messages: [..., ToolMessage, AIMessage] }

Server -> Server : isAuthRequiredSignal(messages)\n-> Inspects ONLY ToolMessage (never parses LLM text) -> TRUE
Server -> UI : SSE { token: "Please log in so I can look up your profile." }
Server -> UI : SSE { requireAuth: true, error: "You need to log in..." }
Server -> UI : SSE { done: true }

UI -> UI : receives event.requireAuth == true\n(Zero keyword string matching on bot text)
UI -> User : Displays bot explanation + Appends [🔐 Log in] button

== 3. Authentication Flow ==
User -> UI : Clicks [🔐 Log in] button
UI -> Server : GET /auth/login
Server -> Auth0 : Redirects to Universal Login
User -> Auth0 : Authenticates with credentials
Auth0 -> Server : Redirects to /auth/callback with code
Server -> Server : Issues secure HTTP-only session cookie
Server -> UI : Redirects back to "/"
UI -> Server : GET /api/auth/status
Server --> UI : { authenticated: true }
UI -> Server : GET /api/me
Server --> UI : { name: "Alice", email: "alice@example.com" }
UI -> User : Updates header: "Alice" + displays [Log out]

== 4. Authenticated User Flow ==
User -> UI : "Who am I?"
UI -> Server : POST /api/chat [with session cookie]
Server -> Agent : agent.invoke() [authenticated: true, user: Alice]
Agent -> Tools : get_user_profile() (authenticated = true)
Tools --> Agent : ToolMessage: { name: "Alice", email: "alice@example.com" }
Agent -> LLM : Return Alice profile
LLM --> Agent : AIMessage: "You are Alice (alice@example.com)."
Server -> Server : isAuthRequiredSignal(messages) -> FALSE
Server -> UI : SSE { token: "You are Alice..." }
Server -> UI : SSE { done: true }
UI -> User : Displays profile (No login button)

@enduml
```

### Anonymous Chat Flow
```
User → "What time is it?" 
  → POST /api/chat (no auth header)
  → Agent runs (authenticated = false)
  → Agent calls get_current_time (public tool)
  → Response streamed to UI
  → User sees answer
```

### Authenticated Chat Flow
```
User → Login (Auth0)
  → GET / (redirects to chat.html)
  → GET /api/auth/status (returns authenticated: true)
  → GET /api/me (shows user name)
  → "Who am I?"
  → POST /api/chat (with session)
  → Agent runs (authenticated = true)
  → Agent calls get_user_profile
  → Response streamed to UI
  → User sees their profile
```

### Auth Error Flow (Definitive Signal Base)
```
Anonymous user → "Who am I?"
  → POST /api/chat (no auth)
  → Agent runs (authenticated = false)
  → Agent invokes get_user_profile tool
  → Tool returns structured auth-required payload: { requiresAuth: true, error: "AUTH_REQUIRED" }
  → Server checks tool trace with isAuthRequiredSignal (never parses LLM text)
  → Server streams assistant explanation + SSE event: { requireAuth: true }
  → UI displays assistant message and appends "🔐 Log in" button based on signal
  → User clicks button → redirects to /auth/login
```

## Key Design Decisions

1. **No React** — Vanilla JavaScript keeps the codebase simple and dependency-free
2. **Anonymous-first** — Users can chat immediately without login
3. **Gradual authentication** — Only ask for login when a feature needs it
4. **Separation of concerns**:
   - `auth.js` handles auth UI
   - `chat.js` handles chat messaging
   - `server.js` handles API routing
   - `tools.js` handles AI tool definitions
   - `agent.js` handles AI agent configuration
5. **Server-Sent Events** — Streams token-by-token responses for real-time feel
6. **Thread persistence** — Each browser session gets a UUID, conversations persist within that session

## Deployment Checklist

- [ ] Replace `MemorySaver()` checkpointer with persistent store (Postgres, Redis, etc.)
- [ ] Set `APP_BASE_URL` to production domain
- [ ] Ensure Auth0 credentials are set in environment
- [ ] Consider rate limiting on `/api/chat` endpoint
- [ ] Add CORS if frontend and backend are on different domains
- [ ] Monitor LLM token usage and costs
