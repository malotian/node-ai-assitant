const { createAgent } = require("langchain");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { MemorySaver } = require("@langchain/langgraph");
const { config } = require("./config");
const { tools } = require("./tools");

const SYSTEM_PROMPT =
  "You are a concise, friendly personal assistant. " +
  "Use your tools when they help. Address the user by name occasionally, not in every message.";

// Builds an agent with its own model and in-memory checkpointer. Called once at startup (see server.js).
function createAssistantAgent() {
  const model = new ChatGoogleGenerativeAI({
    model: config.llmModel,
    apiKey: config.llmApiKey,
  });

  return createAgent({
    model,
    tools,
    checkpointer: new MemorySaver(),
    systemPrompt: SYSTEM_PROMPT,
  });
}

module.exports = { createAssistantAgent };
