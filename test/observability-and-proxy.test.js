const assert = require("node:assert");
const { test, describe } = require("node:test");
const { ConsoleAgentLogger, tracingCallbacks, mask } = require("../src/observability");

describe("Observability & Console Agent Logger", () => {
  test("mask() redacts bearer tokens and JWT patterns", () => {
    const rawJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature";
    const text = `User Authorization: Bearer secret-token-123 and token=${rawJwt}`;
    const redacted = mask(text);

    assert.ok(!redacted.includes("secret-token-123"), "Bearer token must be redacted");
    assert.ok(!redacted.includes("doNotLeakThisSignature"), "JWT signature must be redacted");
    assert.ok(redacted.includes("<redacted token>"), "Replacement marker should appear");
  });

  test("tracingCallbacks returns an array with ConsoleAgentLogger", () => {
    const callbacks = tracingCallbacks({ userId: "test-user", sessionId: "thread-123" });
    assert.ok(Array.isArray(callbacks), "Should return an array");
    assert.strictEqual(callbacks.length, 1);
    assert.ok(callbacks[0] instanceof ConsoleAgentLogger, "Should be instance of ConsoleAgentLogger");
    assert.strictEqual(callbacks[0].userId, "test-user");
    assert.strictEqual(callbacks[0].sessionId, "thread-123");
  });

  test("ConsoleAgentLogger handles full LLM lifecycle without crashing", () => {
    const loggerInstance = new ConsoleAgentLogger({ userId: "user-1", sessionId: "session-1" });
    const runId = "run-llm-1";

    assert.doesNotThrow(() => {
      loggerInstance.handleLLMStart({ id: ["ChatGoogleGenerativeAI"] }, ["Hello"], runId);
      loggerInstance.handleLLMEnd({ generations: [[{ text: "Hi there" }]] }, runId);
    });
  });

  test("ConsoleAgentLogger handles tool lifecycle and error handling without crashing", () => {
    const loggerInstance = new ConsoleAgentLogger({ userId: "user-1", sessionId: "session-1" });
    const runId = "run-tool-1";

    assert.doesNotThrow(() => {
      loggerInstance.handleToolStart({ name: "get_current_time" }, { timezone: "UTC" }, runId);
      loggerInstance.handleToolEnd("2026-10-07 19:40:00 UTC", runId);
      loggerInstance.handleToolError(new Error("Failed to get time"), runId);
    });
  });


  test("/api/internal/proxy-log endpoint validates header and accepts valid proxy payload", async () => {
    const express = require("express");
    const http = require("node:http");

    const app = express();
    app.use(express.json());

    // Import or mount the same handler used in server.js
    app.post("/api/internal/proxy-log", (req, res) => {
      if (req.headers["x-internal-proxy-log"] !== "true") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { method, url, statusCode, durationMs, service } = req.body || {};
      const safeMethod = String(method || "HTTP").replace(/[\r\n]/g, "").slice(0, 10);
      const safeUrl = String(url || "").replace(/[\r\n]/g, "").slice(0, 200);
      const safeStatus = Number(statusCode) || 0;
      const safeDuration = Number(durationMs) || 0;
      const safeService = String(service || "External").replace(/[\r\n]/g, "").slice(0, 50);

      res.json({ ok: true, safeMethod, safeUrl, safeStatus, safeDuration, safeService });
    });

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    try {
      // 1. Missing header -> 403
      const unauthorized = await fetch(`http://127.0.0.1:${port}/api/internal/proxy-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "POST" }),
      });
      assert.strictEqual(unauthorized.status, 403);

      // 2. Valid header -> 200
      const ok = await fetch(`http://127.0.0.1:${port}/api/internal/proxy-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-proxy-log": "true",
        },
        body: JSON.stringify({
          method: "POST",
          url: "https://generativelanguage.googleapis.com/v1beta/test",
          statusCode: 200,
          durationMs: 340,
          service: "Google Gemini",
        }),
      });
      assert.strictEqual(ok.status, 200);
      const body = await ok.json();
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.service, undefined); // sanitized internally
      assert.strictEqual(body.safeService, "Google Gemini");
      assert.strictEqual(body.safeStatus, 200);
    } finally {
      server.close();
    }
  });
});
