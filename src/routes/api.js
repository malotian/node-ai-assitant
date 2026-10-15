const { Router } = require("express");
const { isAuthenticated, requireUser } = require("../session");

// User info and authentication status for the browser
function createApiRouter() {
  const router = Router();

  router.get("/api/me", requireUser, (req, res) => {
    const { sub, name, email, picture } = req.oidc.user;
    res.json({ sub, name, email, picture });
  });

  router.get("/api/auth/status", (req, res) => {
    res.json({ authenticated: isAuthenticated(req) });
  });

  return router;
}

module.exports = { createApiRouter };
