require("dotenv").config();
const { createAgent } = require("langchain");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { MemorySaver } = require("@langchain/langgraph");
const { tools } = require("./tools");

const model = new ChatGoogleGenerativeAI({
  model: process.env.LLM_MODEL,
  apiKey: process.env.LLM_API_KEY,
});

const checkpointer = new MemorySaver();

const agent = createAgent({
  model,
  tools,
  checkpointer,
  systemPrompt:
    "You are a concise, friendly personal assistant. " +
    "Use your tools when they help. Address the user by name occasionally, not in every message.",
});

module.exports = { agent };
