require("dotenv").config();
const path = require("path");
const express = require("express");
const { auth } = require("express-openid-connect");
const { agent } = require("./agent");
const { logger } = require("./logger");
const { isAuthRequiredSignal } = require("./tools");

const {
  APP_BASE_URL = "http://localhost:3000",
  AUTH0_SECRET,
  AUTH0_DOMAIN,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET,
  LLM_API_KEY,
  PORT = 3000,
} = process.env;

const app = express();
app.use(express.json());

// --- Auth0 Universal Login (OAuth 2.0 + OpenID Connect) ---------------------
app.use(
  auth({
    authRequired: false,
    auth0Logout: true,
    baseURL: APP_BASE_URL,
    secret: AUTH0_SECRET,
    issuerBaseURL: `https://${AUTH0_DOMAIN}`,
    clientID: AUTH0_CLIENT_ID,
    clientSecret: AUTH0_CLIENT_SECRET,
    authorizationParams: { response_type: "code", scope: "openid profile email" },
    routes: { login: false, logout: "/auth/logout", callback: "/auth/callback" },
  })
);

app.get("/auth/login", (req, res) => res.oidc.login({ returnTo: "/" }));
app.get("/auth/signup", (req, res) =>
  res.oidc.login({ returnTo: "/", authorizationParams: { screen_hint: "signup" } })
);

// --- Middleware ---
const isAuthenticated = (req) => req.oidc?.isAuthenticated() || false;
const requireUser = (req, res, next) =>
  isAuthenticated(req) ? next() : res.status(401).json({ error: "Not authenticated" });

// --- Static Files ---
const pub = (f) => path.join(__dirname, "..", "public", f);
app.use("/style.css", (req, res) => res.sendFile(pub("style.css")));
app.use("/js", express.static(path.join(__dirname, "..", "public", "js")));

// --- Pages ---
app.get("/", (req, res) => res.sendFile(pub("index.html")));

// --- API: User Info ---
app.get("/api/me", requireUser, (req, res) => {
  const { name, email, picture } = req.oidc.user;
  res.json({ name, email, picture });
});

// --- API: Authentication Status ---
app.get("/api/auth/status", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// --- API: Chat (Anonymous + Authenticated) ---
// Routes to login if a tool requires auth and user isn't logged in
app.post("/api/chat", async (req, res) => {
  const { message, threadId } = req.body || {};
  if (typeof message !== "string" || !message.trim() || typeof threadId !== "string") {
    return res.status(400).json({ error: "message and threadId are required" });
  }
  if (!LLM_API_KEY) return res.status(500).json({ error: "LLM_API_KEY is not set" });

  const authenticated = isAuthenticated(req);
  const user = authenticated ? req.oidc.user : { sub: "anonymous", name: "Guest" };

  logger.info(`Chat request: user=${user.name} authenticated=${authenticated} message="${message.slice(0, 50)}..."`);

  // Use same thread ID for anonymous and authenticated (preserves conversation history after login)
  const thread_id = threadId.slice(0, 64);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    const result = await agent.invoke(
      { messages: [{ role: "user", content: message }] },
      { configurable: { thread_id, user, authenticated } }
    );

    // Definitive signal check: inspect tool messages from agent trace
    const authRequired = isAuthRequiredSignal(result.messages);

    let assistantText = "";
    if (result.messages && Array.isArray(result.messages)) {
      const lastMsg = result.messages[result.messages.length - 1];
      if (lastMsg) {
        if (typeof lastMsg.content === "string") {
          assistantText = lastMsg.content;
        } else if (Array.isArray(lastMsg.content)) {
          assistantText = lastMsg.content
            .filter((c) => c && (c.type === "text" || typeof c === "string"))
            .map((c) => c.text || c)
            .join("");
        }
      }
    }

    if (assistantText) {
      send({ token: assistantText });
    }

    if (authRequired) {
      send({ requireAuth: true, error: "You need to log in to access this feature" });
    }

    send({ done: true });
  } catch (err) {
    if (!abort.signal.aborted) {
      logger.error("Chat error", { error: err.message, code: err.code });
      // Check for authentication required errors
      if (
        err.code === "REQUIRES_AUTH" ||
        err.message?.includes("requires authentication") ||
        err.message?.includes("[AUTH_REQUIRED]")
      ) {
        send({ requireAuth: true, error: "You need to log in to access this feature" });
      } else {
        send({ error: err.message || "Agent error" });
      }
    }
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  logger.info(`🚀 Assistant running at ${APP_BASE_URL}`);
});
