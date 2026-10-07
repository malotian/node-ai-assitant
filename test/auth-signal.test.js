const assert = require("node:assert");
const { test, describe } = require("node:test");
const {
  isAuthRequiredSignal,
  createAuthRequiredPayload,
  AUTH_REQUIRED_CODE,
  AUTH_REQUIRED_MARKER,
} = require("../src/tools");
const { ToolMessage, AIMessage, HumanMessage } = require("@langchain/core/messages");

describe("Definitive Authentication Signal Detection", () => {
  test("returns true when a ToolMessage contains structured JSON requiresAuth: true", () => {
    const messages = [
      new HumanMessage("Who am I?"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "get_user_profile", id: "call_1", args: {} }],
      }),
      new ToolMessage({
        name: "get_user_profile",
        content: createAuthRequiredPayload("Profile requires login"),
        tool_call_id: "call_1",
      }),
      new AIMessage("You need to log in to see your profile."),
    ];

    assert.strictEqual(isAuthRequiredSignal(messages), true);
  });

  test("returns true when a ToolMessage contains [AUTH_REQUIRED] marker", () => {
    const messages = [
      new HumanMessage("Who am I?"),
      new ToolMessage({
        name: "get_user_profile",
        content: `${AUTH_REQUIRED_MARKER} User profile requires authentication`,
        tool_call_id: "call_2",
      }),
      new AIMessage("Please log in first."),
    ];

    assert.strictEqual(isAuthRequiredSignal(messages), true);
  });

  test("returns false when ONLY the LLM (AIMessage) mentions login or authentication", () => {
    // Crucial requirement: We shall NOT depend upon LLM text!
    const messages = [
      new HumanMessage("How do I log in to Netflix?"),
      new AIMessage(
        "To log in to Netflix, visit netflix.com and click the Sign In button. You can also sign in on your TV app."
      ),
    ];

    assert.strictEqual(isAuthRequiredSignal(messages), false);
  });

  test("returns false when user query mentions login but no auth tool was invoked", () => {
    const messages = [
      new HumanMessage("Can you explain how oauth and login work?"),
      new AIMessage(
        "OAuth is an open standard authorization framework that enables applications to obtain limited access to user accounts."
      ),
    ];

    assert.strictEqual(isAuthRequiredSignal(messages), false);
  });

  test("returns false for regular tool outputs (e.g. get_current_time)", () => {
    const messages = [
      new HumanMessage("What time is it?"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "get_current_time", id: "call_3", args: {} }],
      }),
      new ToolMessage({
        name: "get_current_time",
        content: "10/7/2026, 1:45:00 PM UTC",
        tool_call_id: "call_3",
      }),
      new AIMessage("It is currently 1:45 PM UTC."),
    ];

    assert.strictEqual(isAuthRequiredSignal(messages), false);
  });

  test("returns false for successful authenticated user profile retrieval", () => {
    const messages = [
      new HumanMessage("Who am I?"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "get_user_profile", id: "call_4", args: {} }],
      }),
      new ToolMessage({
        name: "get_user_profile",
        content: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
        tool_call_id: "call_4",
      }),
      new AIMessage("You are logged in as Alice (alice@example.com)."),
    ];

    assert.strictEqual(isAuthRequiredSignal(messages), false);
  });
});
