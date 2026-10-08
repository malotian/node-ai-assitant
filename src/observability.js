// Unified observability and tracing for LangChain / LangGraph agent execution.
// Replaces external tracing services with local Winston-integrated logging.
const { BaseCallbackHandler } = require("@langchain/core/callbacks/base");
const { logger } = require("./logger");

// Defense in depth: never log bearer tokens or JWTs/JWEs
const TOKEN_PATTERN = /eyJ[\w-]+(?:\.[\w-]*){2,4}|Bearer\s+[\w.~+/=-]+/g;

function mask(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") {
    try {
      value = JSON.stringify(value);
    } catch {
      value = String(value);
    }
  }
  return value.replace(TOKEN_PATTERN, "<redacted token>");
}

class ConsoleAgentLogger extends BaseCallbackHandler {
  name = "ConsoleAgentLogger";

  constructor({ userId, sessionId } = {}) {
    super();
    this.userId = userId || "guest";
    this.sessionId = sessionId || "default";
    this.timers = new Map();
  }

  handleLLMStart(llm, _prompts, runId) {
    if (runId) this.timers.set(runId, Date.now());
    const model = process.env.LLM_MODEL || "Gemini";
    logger.info(`🤖 Agent invoking LLM [${model}]`);
  }

  handleLLMEnd(_output, runId) {
    const elapsed = runId && this.timers.has(runId) ? Date.now() - this.timers.get(runId) : null;
    const timing = elapsed !== null ? ` (${elapsed}ms)` : "";
    logger.info(`🤖 LLM response received${timing}`);
  }

  handleLLMError(err, runId) {
    const elapsed = runId && this.timers.has(runId) ? Date.now() - this.timers.get(runId) : null;
    const timing = elapsed !== null ? ` (${elapsed}ms)` : "";
    logger.error(`❌ LLM error${timing}: ${err.message || err}`);
  }

  handleToolStart(tool, input, runId) {
    if (runId) this.timers.set(runId, Date.now());
    const toolName = tool?.name || "tool";
    const safeInput = mask(input);
    const preview = safeInput.length > 100 ? `${safeInput.slice(0, 100)}...` : safeInput;
    logger.info(`🔧 Tool executing: ${toolName} args=${preview || "{}"}`);
  }

  handleToolEnd(output, runId) {
    const elapsed = runId && this.timers.has(runId) ? Date.now() - this.timers.get(runId) : null;
    const timing = elapsed !== null ? ` (${elapsed}ms)` : "";
    const safeOutput = mask(output);
    const preview = safeOutput.length > 100 ? `${safeOutput.slice(0, 100)}...` : safeOutput;
    logger.info(`✅ Tool completed${timing} -> ${preview}`);
  }

  handleToolError(err, runId) {
    const elapsed = runId && this.timers.has(runId) ? Date.now() - this.timers.get(runId) : null;
    const timing = elapsed !== null ? ` (${elapsed}ms)` : "";
    logger.error(`❌ Tool error${timing}: ${err.message || err}`);
  }
}

// Callbacks for agent run: integrates agent steps directly into the logger
function tracingCallbacks({ userId, sessionId } = {}) {
  return [new ConsoleAgentLogger({ userId, sessionId })];
}

module.exports = {
  ConsoleAgentLogger,
  tracingCallbacks,
  mask,
};
