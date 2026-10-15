const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { createAuthRequiredPayload } = require("../auth-signal");

// Tool for explicit login requests by the user
const requestLogin = tool(
  async (_input, config) => {
    const authenticated = config.configurable?.authenticated;
    if (authenticated) {
      const user = config.configurable?.user || {};
      return JSON.stringify({
        authenticated: true,
        message: `Already logged in as ${user.name || user.email || "User"}.`,
      });
    }
    return createAuthRequiredPayload("User requested to log in");
  },
  {
    name: "request_login",
    description: "Invoke this tool when the user asks or wants to log in, sign in, or authenticate.",
    schema: z.object({}),
  }
);

module.exports = { requestLogin };
