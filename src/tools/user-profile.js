const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("../logger");
const { fetchUserInfo } = require("../auth0");
const { createAuthRequiredPayload } = require("../auth-signal");

// Failures are JSON like the auth-required payload, so the agent always gets one shape from this tool
const profileError = (message) => JSON.stringify({ error: "PROFILE_UNAVAILABLE", message });

// This tool requires authentication (user must be logged in)
const getUserProfile = tool(
  async (_input, config) => {
    const authenticated = config.configurable?.authenticated;
    if (!authenticated) {
      logger.debug("get_user_profile: user not logged in, returning auth-required signal");
      return createAuthRequiredPayload("User profile requires authentication");
    }

    const accessToken = config.configurable?.__accessToken;
    if (!accessToken) {
      return createAuthRequiredPayload("There is no user logged in");
    }

    try {
      const { status, claims } = await fetchUserInfo(accessToken);
      if (status === 401) {
        return createAuthRequiredPayload("Session expired, please log in again");
      }
      if (!claims) {
        return profileError(`Failed to fetch user profile: HTTP ${status}`);
      }
      return JSON.stringify({
        name: claims.name,
        email: claims.email,
        email_verified: claims.email_verified,
        picture: claims.picture,
        sub: claims.sub,
      });
    } catch (err) {
      logger.error(`get_user_profile: /userinfo call failed: ${err.message}`);
      return profileError(`Failed to fetch user profile: ${err.message}`);
    }
  },
  {
    name: "get_user_profile",
    description: "Get the profile (name, email) of the currently logged-in user. Requires authentication.",
    schema: z.object({}),
  }
);

module.exports = { getUserProfile };
