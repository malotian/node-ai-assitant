const assert = require("node:assert");
const { test, describe } = require("node:test");

async function postChat(message) {
  const response = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, threadId: "test-api-" + Date.now() + "-" + Math.random() }),
  });

  assert.strictEqual(response.status, 200);

  const text = await response.text();
  const lines = text.split("\n\n");
  const events = [];

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // ignore
      }
    }
  }

  return events;
}

describe("API Definitive Signal Integration Tests", () => {
  test("POST /api/chat with 'Who am I?' as guest emits definitive requireAuth event", async () => {
    const events = await postChat("Who am I?");
    const hasRequireAuth = events.some((e) => e.requireAuth === true);
    assert.strictEqual(
      hasRequireAuth,
      true,
      "Expected SSE stream to include requireAuth: true event"
    );
  });

  test("POST /api/chat with 'How do I log in to Netflix?' does NOT emit requireAuth event despite LLM talking about login", async () => {
    const events = await postChat("How do I log in to Netflix?");
    const hasRequireAuth = events.some((e) => e.requireAuth === true);
    assert.strictEqual(
      hasRequireAuth,
      false,
      "Expected SSE stream to NOT include requireAuth event for general questions"
    );
  });

  test("POST /api/chat with 'What time is it?' does NOT emit requireAuth event", async () => {
    const events = await postChat("What time is it?");
    const hasRequireAuth = events.some((e) => e.requireAuth === true);
    assert.strictEqual(
      hasRequireAuth,
      false,
      "Expected SSE stream to NOT include requireAuth event for public tools"
    );
  });
});
