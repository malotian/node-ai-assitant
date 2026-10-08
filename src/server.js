require("dotenv").config();
const { tracingCallbacks } = require("./observability");
const path = require("path");
const express = require("express");
const { auth } = require("express-openid-connect");
const { agent } = require("./agent");
const { logger } = require("./logger");
const { isAuthRequiredSignal } = require("./tools");
const { AUTH0_DOMAIN } = require("./auth0");

const {
  APP_BASE_URL = "http://localhost:3000",
  AUTH0_SECRET,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET,
  AUTH0_API_AUDIENCE,
  LLM_API_KEY,
  PORT = 3000,
} = process.env;

const ISSUER_BASE_URL_CLEAN =
  process.env.ISSUER_BASE_URL || (AUTH0_DOMAIN ? `https://${AUTH0_DOMAIN}` : undefined);

// Claims of a signed JWT (ID token, or an access token issued for an API audience)
const decodeJwt = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  } catch {
    return null;
  }
};

const app = express();
app.use(express.json());

// --- Request log (debug): one line per request; runs before auth so it also sees /auth/* ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const who = req.oidc?.isAuthenticated() ? req.oidc.user.email || req.oidc.user.sub : "guest";
    const location = res.getHeader("location");
    logger.debug(`${req.method} ${req.originalUrl.split("?")[0]} -> ${res.statusCode} (${Date.now() - start}ms) [${who}]`, {
      redirect: location ? String(location).split("?")[0] : undefined,
    });
  });
  next();
});

// --- Health check (Docker) ---
app.get("/healthz", (req, res) => res.json({ ok: true }));

// --- Auth0 Universal Login (OAuth 2.0 + OpenID Connect) ---------------------
app.use(
  auth({
    authRequired: false,
    auth0Logout: true,
    baseURL: APP_BASE_URL,
    secret: AUTH0_SECRET,
    issuerBaseURL: ISSUER_BASE_URL_CLEAN,
    clientID: AUTH0_CLIENT_ID,
    clientSecret: AUTH0_CLIENT_SECRET,
    // Without an audience the access token is valid for Auth0 /userinfo; set AUTH0_API_AUDIENCE
    // (an API registered in Auth0) to get a JWT for your own API instead.
    // offline_access gives a refresh token so the session outlives the access token
    authorizationParams: {
      response_type: "code",
      scope: "openid profile email offline_access",
      ...(AUTH0_API_AUDIENCE && { audience: AUTH0_API_AUDIENCE }),
    },
    routes: { login: false, logout: "/auth/logout", callback: "/auth/callback" },
    // Runs after Auth0 redirects back and the code is exchanged for tokens (values never logged)
    afterCallback: (req, res, session) => {
      const claims = decodeJwt(session.id_token) || {};
      logger.info(`Login succeeded: ${claims.email || claims.sub}`);
      logger.debug("Tokens received", {
        access_token: !!session.access_token,
        refresh_token: !!session.refresh_token,
        access_token_expires: new Date(session.expires_at * 1000).toISOString(),
        audience: AUTH0_API_AUDIENCE || "(none: /userinfo only)",
      });
      return session;
    },
  })
);

app.get("/auth/login", (req, res) => res.oidc.login({ returnTo: "/" }));
app.get("/auth/signup", (req, res) =>
  res.oidc.login({ returnTo: "/", authorizationParams: { screen_hint: "signup" } })
);

// --- Middleware ---
const isAuthenticated = (req) => req.oidc?.isAuthenticated() || false;
// Access token for the first-party API, kept server-side in the session (never sent to the browser)
const getAccessToken = async (req) => {
  let { accessToken } = req.oidc;
  if (!accessToken) return null;
  if (accessToken.isExpired()) {
    accessToken = await accessToken.refresh();
    logger.debug(`Access token refreshed, expires in ${accessToken.expires_in}s`);
  }
  return accessToken.access_token;
};
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
  const { sub, name, email, picture } = req.oidc.user;
  res.json({ sub, name, email, picture });
});

// --- API: Authentication Status ---
app.get("/api/auth/status", (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// --- API: Internal Proxy Log Ingestion (mitmproxy) ---
app.post("/api/internal/proxy-log", (req, res) => {
  if (req.headers["x-internal-proxy-log"] !== "true") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { method, url, statusCode, durationMs, service, details } = req.body || {};
  const safeMethod = String(method || "HTTP").replace(/[\r\n]/g, "").slice(0, 10);
  const safeUrl = String(url || "").replace(/[\r\n]/g, "").slice(0, 200);
  const safeStatus = Number(statusCode) || 0;
  const safeDuration = Number(durationMs) || 0;
  const safeService = String(service || "External").replace(/[\r\n]/g, "").slice(0, 50);
  const safeDetails = details ? ` [${String(details).replace(/[\r\n]/g, "").slice(0, 120)}]` : "";

  logger.info(
    `🌐 [mitmproxy] ${safeMethod} ${safeUrl} -> ${safeStatus} (${safeDuration}ms) [${safeService}]${safeDetails}`
  );
  res.json({ ok: true });
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

  let accessToken = null;
  if (authenticated) {
    try {
      accessToken = await getAccessToken(req);
    } catch (err) {
      logger.warn(`Access token refresh failed: ${err.message}`);
    }
  }

  logger.info(`Chat request: user=${user.name} authenticated=${authenticated} message="${message.slice(0, 50)}..."`);

  // Scope memory per user: a thread id never carries a guest conversation into a login,
  // and one user cannot read another user's thread by sending its id
  const thread_id = `${user.sub}:${threadId.slice(0, 64)}`;

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
      {
        // "__" prefix keeps the token out of tracing metadata (LangChain copies other string values)
        configurable: { thread_id, user, authenticated, __accessToken: accessToken },
        callbacks: tracingCallbacks({ userId: user.email || user.sub, sessionId: thread_id }),
      }
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

// Login errors returned by Auth0 (e.g. "Service not found" when the API audience doesn't exist)
app.use((err, req, res, next) => {
  if (req.path !== "/auth/callback") return next(err);
  const reason = err.error_description || err.message;
  logger.error(`Login failed: ${reason}`);
  res.status(400).send(`<p>Login failed: ${reason.replace(/[<>&]/g, "")}</p><p><a href="/">Back</a></p>`);
});

const server = app.listen(PORT, () => {
  logger.info(`🚀 Assistant running at ${APP_BASE_URL}`);
});

// Docker sends SIGTERM on stop: finish in-flight requests gracefully
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
