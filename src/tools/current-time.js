const { tool } = require("@langchain/core/tools");
const { z } = require("zod");

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

module.exports = { getCurrentTime };
