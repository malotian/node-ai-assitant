const path = require("path");
const express = require("express");
const { logger } = require("./logger");
const { createAuthRouter } = require("./routes/auth");
const { createApiRouter } = require("./routes/api");
const { createChatRouter } = require("./routes/chat");
const { createInternalRouter } = require("./routes/internal");

const pub = (f) => path.join(__dirname, "..", "public", f);

// Builds the Express app. The agent is passed in so tests can supply a stub.
function createApp({ agent }) {
  const app = express();
  app.use(express.json());

  // Request log (debug): one line per request; runs before auth so it also sees /auth/*
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

  // Health check (Docker)
  app.get("/healthz", (req, res) => res.json({ ok: true }));

  app.use(createAuthRouter());

  // Static files and pages
  app.use("/style.css", (req, res) => res.sendFile(pub("style.css")));
  app.use("/js", express.static(path.join(__dirname, "..", "public", "js")));
  app.get("/", (req, res) => res.sendFile(pub("index.html")));

  app.use(createApiRouter());
  app.use(createInternalRouter());
  app.use(createChatRouter({ agent }));

  // Login errors returned by Auth0 (e.g. "Service not found" when the API audience doesn't exist)
  app.use((err, req, res, next) => {
    if (req.path !== "/auth/callback") return next(err);
    const reason = err.error_description || err.message;
    logger.error(`Login failed: ${reason}`);
    res.status(400).send(`<p>Login failed: ${reason.replace(/[<>&]/g, "")}</p><p><a href="/">Back</a></p>`);
  });

  return app;
}

module.exports = { createApp };
