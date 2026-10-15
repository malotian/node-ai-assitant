// The only module that reads environment variables. Loads .env once, before anything reads process.env.
require("dotenv").config();

// Auth0 tenant domain without scheme or trailing slash, e.g. "your-tenant.auth0.com"
const auth0Domain = (process.env.AUTH0_DOMAIN || process.env.ISSUER_BASE_URL || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

const config = {
  port: process.env.PORT || 3000,
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  logLevel: process.env.LOG_LEVEL || "info",
  llmApiKey: process.env.LLM_API_KEY,
  llmModel: process.env.LLM_MODEL,
  auth0: {
    domain: auth0Domain,
    issuerBaseUrl: process.env.ISSUER_BASE_URL || (auth0Domain ? `https://${auth0Domain}` : undefined),
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    secret: process.env.AUTH0_SECRET,
    // Without an audience the access token is valid for Auth0 /userinfo only
    apiAudience: process.env.AUTH0_API_AUDIENCE,
  },
};

module.exports = { config };
