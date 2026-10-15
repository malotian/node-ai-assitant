const { Router } = require("express");
const { auth } = require("express-openid-connect");
const { config } = require("../config");
const { logger } = require("../logger");

// Claims of a signed JWT (ID token, or an access token issued for an API audience)
const decodeJwt = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  } catch {
    return null;
  }
};

// Auth0 Universal Login (OAuth 2.0 + OpenID Connect). authRequired is false: chat never requires login.
function createAuthRouter() {
  const router = Router();
  const { auth0 } = config;

  router.use(
    auth({
      authRequired: false,
      auth0Logout: true,
      baseURL: config.appBaseUrl,
      secret: auth0.secret,
      issuerBaseURL: auth0.issuerBaseUrl,
      clientID: auth0.clientId,
      clientSecret: auth0.clientSecret,
      // offline_access gives a refresh token so the session outlives the access token
      authorizationParams: {
        response_type: "code",
        scope: "openid profile email offline_access",
        ...(auth0.apiAudience && { audience: auth0.apiAudience }),
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
          audience: auth0.apiAudience || "(none: /userinfo only)",
        });
        return session;
      },
    })
  );

  router.get("/auth/login", (req, res) => res.oidc.login({ returnTo: "/" }));
  router.get("/auth/signup", (req, res) =>
    res.oidc.login({ returnTo: "/", authorizationParams: { screen_hint: "signup" } })
  );

  return router;
}

module.exports = { createAuthRouter };
