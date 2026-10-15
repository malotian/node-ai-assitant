const { config } = require("./config");
const { logger } = require("./logger");

const AUTH0_DOMAIN = config.auth0.domain;

// Calls Auth0 /userinfo with the user's access token.
// Resolves to { status, claims }; claims is null unless the call succeeded.
async function fetchUserInfo(accessToken) {
  const url = `https://${AUTH0_DOMAIN}/userinfo`;
  const started = Date.now();
  logger.debug(`GET ${url} with user's access token`);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  logger.debug(`/userinfo -> ${response.status} (${Date.now() - started}ms)`);

  if (!response.ok) return { status: response.status, claims: null };

  const claims = await response.json();
  logger.debug(`/userinfo returned claims: ${Object.keys(claims).join(", ")}`);
  return { status: response.status, claims };
}

module.exports = { AUTH0_DOMAIN, fetchUserInfo };
