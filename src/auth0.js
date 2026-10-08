// Auth0 tenant domain without scheme or trailing slash, e.g. "your-tenant.auth0.com"
const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN || process.env.ISSUER_BASE_URL || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

module.exports = { AUTH0_DOMAIN };
