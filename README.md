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

## Structure

| Component | Purpose |
|-----------|---------|
| `src/server.js` | Express + Auth0 (express-openid-connect) + API routes |
| `src/agent.js` | LangGraph agent (createAgent) with LLM model |
| `src/tools.js` | AI tools with auth checks |
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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design and [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for development reference.
