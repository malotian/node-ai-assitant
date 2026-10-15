const { Router } = require("express");
const { config } = require("../config");
const { logger } = require("../logger");
const { tracingCallbacks } = require("../observability");
const { isAuthenticated, getAccessToken } = require("../session");
const { requireAuthEvent, isAuthRequiredError, isAuthRequiredSignal } = require("../auth-signal");

// Text of the final assistant message (string content, or the text parts of a content array)
function extractAssistantText(messages) {
  const lastMsg = Array.isArray(messages) ? messages[messages.length - 1] : undefined;
  if (!lastMsg) return "";
  if (typeof lastMsg.content === "string") return lastMsg.content;
  if (Array.isArray(lastMsg.content)) {
    return lastMsg.content
      .filter((c) => c && (c.type === "text" || typeof c === "string"))
      .map((c) => c.text || c)
      .join("");
  }
  return "";
}

// POST /api/chat: streams the agent reply as Server-Sent Events, works anonymous or logged in
function createChatRouter({ agent }) {
  const router = Router();

  router.post("/api/chat", async (req, res) => {
    const { message, threadId } = req.body || {};
    if (typeof message !== "string" || !message.trim() || typeof threadId !== "string") {
      return res.status(400).json({ error: "message and threadId are required" });
    }
    if (!config.llmApiKey) return res.status(500).json({ error: "LLM_API_KEY is not set" });

    const authenticated = isAuthenticated(req);
    const user = authenticated ? req.oidc.user : { sub: "anonymous", name: "Guest" };

    let accessToken = null;
    if (authenticated) {
      try {
        accessToken = await getAccessToken(req);
      } catch (err) {
        logger.warn(`Access token refresh failed: ${err.message}`);
      }
    }

    logger.info(`Chat request: user=${user.name} authenticated=${authenticated} message="${message.slice(0, 50)}..."`);

    // Scope memory per user: a thread id never carries a guest conversation into a login,
    // and one user cannot read another user's thread by sending its id
    const thread_id = `${user.sub}:${threadId.slice(0, 64)}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const abort = new AbortController();
    res.on("close", () => abort.abort());

    try {
      const result = await agent.invoke(
        { messages: [{ role: "user", content: message }] },
        {
          // "__" prefix keeps the token out of tracing metadata (LangChain copies other string values)
          configurable: { thread_id, user, authenticated, __accessToken: accessToken },
          callbacks: tracingCallbacks({ userId: user.email || user.sub, sessionId: thread_id }),
        }
      );

      // Definitive signal: inspect tool messages of the current turn
      const authRequired = isAuthRequiredSignal(result.messages);
      const assistantText = extractAssistantText(result.messages);

      if (assistantText) send({ token: assistantText });
      if (authRequired) send(requireAuthEvent());
      send({ done: true });
    } catch (err) {
      if (!abort.signal.aborted) {
        logger.error("Chat error", { error: err.message, code: err.code });
        send(isAuthRequiredError(err) ? requireAuthEvent() : { error: err.message || "Agent error" });
      }
    } finally {
      res.end();
    }
  });

  return router;
}

module.exports = { createChatRouter };
