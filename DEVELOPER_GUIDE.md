# Developer Guide

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Directory Structure

```
node-ai-assistant/
├── src/
│   ├── server.js       # Express server & API routes
│   ├── agent.js        # LangGraph ReAct agent
│   └── tools.js        # AI tool definitions
├── public/
│   ├── index.html      # Single page with login + chat screens
│   ├── style.css       # Styling (dark/light mode)
│   └── js/
│       ├── auth.js     # Auth state & UI logic
│       └── chat.js     # Chat messaging logic
├── package.json
├── .env                # Environment variables (Auth0, Gemini API key)
└── ARCHITECTURE.md     # System design overview
```

## Making Changes

### Adding a New Tool

1. Define tool in `src/tools.js`:
```javascript
const myTool = tool(
  async (input, config) => {
    const authenticated = config.configurable?.authenticated;
    if (needsAuth && !authenticated) {
      throw new Error("myTool requires authentication");
    }
    return "result";
  },
  {
    name: "my_tool",
    description: "What this tool does",
    schema: z.object({ /* inputs */ }),
  }
);
```

2. Export it in `tools` array:
```javascript
module.exports = { tools: [getCurrentTime, getUserProfile, myTool] };
```

3. Agent will automatically discover and use it.

### Changing Authentication Logic

- **Public tool**: No auth check needed, works for all users
- **Auth-required tool**: Check `config.configurable?.authenticated` and return `createAuthRequiredPayload(...)` (or throw an error with `code: "REQUIRES_AUTH"`)
- The server detects the definitive signal from tool execution (without relying on LLM text) and sends `requireAuth: true` over SSE
- The frontend will display the "🔐 Log in" button exclusively based on this definitive signal

### Customizing UI

- **Login screen**: Edit HTML in `index.html` (search for `id="login-screen"`)
- **Chat screen**: Edit HTML in `index.html` (search for `id="chat-screen"`)
- **Chat behavior**: Edit `js/chat.js` (message rendering, error handling, etc.)
- **Auth behavior**: Edit `js/auth.js` (login flow, anonymous mode, etc.)
- **Styling**: Edit `style.css` (colors, layout, responsive design)

### Debugging

```bash
# Watch for file changes and auto-restart
npm run dev

# Check if server is running
curl http://localhost:3000/api/auth/status

# Test anonymous chat
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What time is it?","threadId":"test"}'
```

## Common Tasks

### Test Anonymous Chat
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!","threadId":"'$(uuidgen)'"}'
```

### View Live Logs
```bash
tail -f /tmp/app.log
```

### Restart Server
```bash
kill $(cat /tmp/app.pid)
npm run dev
```

## Environment Variables

Required in `.env`:
- `LLM_API_KEY` — Large Language Model API key
- `LLM_MODEL` — Model name (e.g., `gemini-2.0-flash`)
- `AUTH0_SECRET` — Random secret for sessions
- `AUTH0_DOMAIN` — Your Auth0 domain (e.g., `example.auth0.com`)
- `AUTH0_CLIENT_ID` — Auth0 application ID
- `AUTH0_CLIENT_SECRET` — Auth0 application secret
- `APP_BASE_URL` — Full URL (default: `http://localhost:3000`)
- `PORT` — Server port (default: 3000)

## Performance Tips

- **Gemini model**: Try `gemini-1.5-flash` for faster responses (cheaper)
- **Caching**: Add Redis for conversation memory (replace `MemorySaver`)
- **Streaming**: Already implemented with Server-Sent Events for real-time feel
- **Frontend**: Vanilla JS is already lightweight; no framework overhead

## Testing Checklist

- [ ] Anonymous user can chat
- [ ] Anonymous user sees "login required" when asking for profile
- [ ] Authenticated user can see their profile
- [ ] "New chat" button creates new thread
- [ ] "Log out" button works
- [ ] Messages persist within a thread
- [ ] Different threads have separate conversations
