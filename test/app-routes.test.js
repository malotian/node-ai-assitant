const assert = require("node:assert");
const { test, describe, before, after } = require("node:test");
const http = require("node:http");
const { ToolMessage, AIMessage } = require("@langchain/core/messages");

// Config is read from the environment when src/config.js loads, so set safe test values first
process.env.LLM_API_KEY = process.env.LLM_API_KEY || "test-key";
process.env.AUTH0_SECRET = process.env.AUTH0_SECRET || "x".repeat(32);
process.env.AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || "test-client";
process.env.AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || "test-secret";
process.env.ISSUER_BASE_URL = process.env.ISSUER_BASE_URL || "https://test-tenant.auth0.com";
process.env.LOG_LEVEL = "error";

const { createAuthRequiredPayload } = require("../src/auth-signal");
const { createApp } = require("../src/app");

// Stub agent: records the last invocation and replies with whatever the test sets
function stubAgent() {
  const stub = {
    calls: [],
    reply: () => ({ messages: [new AIMessage("hello")] }),
    invoke(input, options) {
      stub.calls.push({ input, options });
      return stub.reply();
    },
  };
  return stub;
}

async function postChat(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const events = text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  return { status: response.status, events };
}

describe("App routes (stub agent)", () => {
  let server;
  let baseUrl;
  let agent;

  before(async () => {
    agent = stubAgent();
    server = http.createServer(createApp({ agent }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  test("GET /healthz reports ok", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.deepStrictEqual(await response.json(), { ok: true });
  });

  test("GET /api/auth/status is false for a guest and /api/me is 401", async () => {
    const status = await (await fetch(`${baseUrl}/api/auth/status`)).json();
    assert.deepStrictEqual(status, { authenticated: false });

    const me = await fetch(`${baseUrl}/api/me`);
    assert.strictEqual(me.status, 401);
  });

  test("POST /api/chat rejects a missing message or threadId with 400", async () => {
    const { status } = await postChat(baseUrl, { message: "   ", threadId: "t1" });
    assert.strictEqual(status, 400);
  });

  test("POST /api/chat streams the reply as a guest, scoped to the anonymous user", async () => {
    agent.reply = () => ({ messages: [new AIMessage("Hi there")] });
    const { status, events } = await postChat(baseUrl, { message: "Hello", threadId: "t-guest" });

    assert.strictEqual(status, 200);
    assert.deepStrictEqual(events, [{ token: "Hi there" }, { done: true }]);

    const { options } = agent.calls.at(-1);
    assert.strictEqual(options.configurable.authenticated, false);
    assert.strictEqual(options.configurable.thread_id, "anonymous:t-guest");
  });

  test("POST /api/chat emits requireAuth when a tool in this turn returns the auth payload", async () => {
    agent.reply = () => ({
      messages: [
        new ToolMessage({
          content: createAuthRequiredPayload("User profile requires authentication"),
          tool_call_id: "call-1",
        }),
        new AIMessage("You need to log in first."),
      ],
    });
    const { events } = await postChat(baseUrl, { message: "Who am I?", threadId: "t-auth" });

    assert.ok(events.some((e) => e.requireAuth === true), "expected a requireAuth event");
    assert.deepStrictEqual(events.at(-1), { done: true });
  });

  test("POST /api/chat emits requireAuth when the agent throws an auth error", async () => {
    agent.reply = () => {
      throw Object.assign(new Error("boom"), { code: "REQUIRES_AUTH" });
    };
    const { events } = await postChat(baseUrl, { message: "Who am I?", threadId: "t-throw" });

    assert.deepStrictEqual(events, [
      { requireAuth: true, error: "You need to log in to access this feature" },
    ]);
  });

  test("POST /api/internal/proxy-log requires the internal header", async () => {
    const forbidden = await fetch(`${baseUrl}/api/internal/proxy-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "GET" }),
    });
    assert.strictEqual(forbidden.status, 403);

    const accepted = await fetch(`${baseUrl}/api/internal/proxy-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-proxy-log": "true" },
      body: JSON.stringify({ method: "GET", url: "https://example.com", statusCode: 200 }),
    });
    assert.strictEqual(accepted.status, 200);
    assert.deepStrictEqual(await accepted.json(), { ok: true });
  });
});
