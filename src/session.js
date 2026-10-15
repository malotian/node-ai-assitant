const { logger } = require("./logger");

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

module.exports = { isAuthenticated, getAccessToken, requireUser };
