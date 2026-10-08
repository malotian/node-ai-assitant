const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("./logger");

const AUTH_REQUIRED_CODE = "AUTH_REQUIRED";
const AUTH_REQUIRED_MARKER = "[AUTH_REQUIRED]";

function createAuthRequiredPayload(message = "Authentication required") {
  return JSON.stringify({
    requiresAuth: true,
    error: AUTH_REQUIRED_CODE,
    code: "REQUIRES_AUTH",
    message: `${AUTH_REQUIRED_MARKER} ${message}`,
  });
}

function isAuthRequiredSignal(messages) {
  if (!Array.isArray(messages)) return false;

  for (const msg of messages) {
    // Only inspect tool execution outputs, NEVER user or assistant text messages
    const isTool =
      msg._getType?.() === "tool" ||
      msg.role === "tool" ||
      msg.name === "tool" ||
      msg.constructor?.name === "ToolMessage";

    if (!isTool) continue;

    const content = msg.content;
    if (typeof content === "string") {
      if (
        content.includes(AUTH_REQUIRED_MARKER) ||
        content.includes(AUTH_REQUIRED_CODE) ||
        content.includes("REQUIRES_AUTH")
      ) {
        return true;
      }
      try {
        const parsed = JSON.parse(content);
        if (
          parsed &&
          (parsed.requiresAuth === true ||
            parsed.error === AUTH_REQUIRED_CODE ||
            parsed.code === "REQUIRES_AUTH")
        ) {
          return true;
        }
      } catch {
        // Not JSON
      }
    } else if (content && typeof content === "object") {
      if (
        content.requiresAuth === true ||
        content.error === AUTH_REQUIRED_CODE ||
        content.code === "REQUIRES_AUTH"
      ) {
        return true;
      }
    }

    if (
      msg.artifact &&
      (msg.artifact.requiresAuth === true || msg.artifact.error === AUTH_REQUIRED_CODE)
    ) {
      return true;
    }
  }

  return false;
}

const getCurrentTime = tool(
  async ({ timezone }) => {
    try {
      return new Date().toLocaleString("en-US", {
        timeZone: timezone || "UTC",
        timeZoneName: "short"
      });
    } catch {
      return `Unknown timezone "${timezone}". Use an IANA name like "America/Edmonton".`;
    }
  },
  {
    name: "get_current_time",
    description: "Get the current date and time, optionally in an IANA timezone.",
    schema: z.object({
      timezone: z.string().optional().describe('IANA timezone, e.g. "America/Edmonton". Defaults to UTC.'),
    }),
  }
);

// This tool requires authentication (user must be logged in)
const getUserProfile = tool(
  async (_input, config) => {
    const authenticated = config.configurable?.authenticated;
    if (!authenticated) {
      logger.debug("get_user_profile: user not logged in, returning auth-required signal");
      // Return definitive structured payload signaling auth requirement
      return createAuthRequiredPayload("User profile requires authentication");
    }

    const accessToken = config.configurable?.__accessToken;
    if (!accessToken) {
      return createAuthRequiredPayload("There is no user logged in");
    }

    // Phase 1: call a first-party API (Auth0 /userinfo) on the user's behalf
    const url = `https://${process.env.AUTH0_DOMAIN}/userinfo`;
    try {
      const started = Date.now();
      logger.debug(`get_user_profile: GET ${url} with user's access token`);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      logger.debug(`get_user_profile: /userinfo -> ${response.status} (${Date.now() - started}ms)`);
      if (response.status === 401) {
        return createAuthRequiredPayload("Session expired, please log in again");
      }
      if (!response.ok) {
        return `Failed to fetch user profile: HTTP ${response.status}`;
      }
      const data = await response.json();
      logger.debug(`get_user_profile: /userinfo returned claims: ${Object.keys(data).join(", ")}`);
      return JSON.stringify({
        name: data.name,
        email: data.email,
        email_verified: data.email_verified,
        picture: data.picture,
        sub: data.sub,
      });
    } catch (err) {
      logger.error(`get_user_profile: /userinfo call failed: ${err.message}`);
      return `Failed to fetch user profile: ${err.message}`;
    }
  },
  {
    name: "get_user_profile",
    description: "Get the profile (name, email) of the currently logged-in user. Requires authentication.",
    schema: z.object({}),
  }
);

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

module.exports = {
  tools: [getCurrentTime, getUserProfile, requestLogin],
  createAuthRequiredPayload,
  isAuthRequiredSignal,
  AUTH_REQUIRED_CODE,
  AUTH_REQUIRED_MARKER,
};
