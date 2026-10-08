const assert = require("node:assert");
const { test, describe } = require("node:test");

describe("Chat UI Definitive Signal Button Rendering Simulation", () => {
  // Simulate DOM environment
  function createMockDOM() {
    const elements = {};
    const chatLog = {
      children: [],
      scrollTop: 0,
      scrollHeight: 100,
      appendChild(child) {
        this.children.push(child);
      },
    };

    function createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: "",
        textContent: "",
        href: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        querySelector(selector) {
          if (selector === ".login-action-btn" || selector === "button") {
            const findBtn = (node) => {
              for (const c of node.children) {
                if (
                  c.className?.includes("login-action-btn") ||
                  c.tagName === "BUTTON"
                ) {
                  return c;
                }
                const found = findBtn(c);
                if (found) return found;
              }
              return null;
            };
            return findBtn(this);
          }
          return null;
        },
      };
      return el;
    }

    return { createElement, chatLog };
  }

  function simulateChatStreamHandler({ events, isAuthenticated = false }) {
    const { createElement, chatLog } = createMockDOM();
    const botMsg = createElement("div");
    botMsg.className = "msg bot";
    botMsg.textContent = "…";
    chatLog.appendChild(botMsg);

    function showLoginButton(targetMsg) {
      if (targetMsg.querySelector(".login-action-btn")) return;
      const btnWrapper = createElement("div");
      btnWrapper.className = "auth-action-wrapper";
      btnWrapper.style = "margin-top: 10px;";

      const loginLink = createElement("a");
      loginLink.className = "btn small login-action-btn";
      loginLink.href = "/auth/login";
      loginLink.textContent = "🔐 Log in";

      btnWrapper.appendChild(loginLink);
      targetMsg.appendChild(btnWrapper);
    }

    let received = false;
    let authRequired = false;

    for (const event of events) {
      if (event.requireAuth) {
        authRequired = true;
        if (!received || !botMsg.textContent || botMsg.textContent === "…") {
          botMsg.textContent = "⚠️ " + (event.error || "Login required for this feature.");
          received = true;
        }
      }

      if (event.token) {
        if (!received) {
          botMsg.textContent = "";
          received = true;
        }
        botMsg.textContent += event.token;
      }
    }

    if (authRequired) {
      showLoginButton(botMsg);
    }

    return { botMsg, hasLoginButton: !!botMsg.querySelector(".login-action-btn") };
  }

  test("Renders login button when requireAuth signal is received and user is guest", () => {
    const { botMsg, hasLoginButton } = simulateChatStreamHandler({
      events: [
        { token: "Please sign in so I can look up your profile!" },
        { requireAuth: true, error: "You need to log in to access this feature" },
        { done: true },
      ],
      isAuthenticated: false,
    });

    assert.strictEqual(hasLoginButton, true, "Login button should be rendered");
    assert.strictEqual(
      botMsg.textContent,
      "Please sign in so I can look up your profile!"
    );
  });

  test("Does NOT render login button when text mentions login but NO requireAuth signal is sent", () => {
    const { botMsg, hasLoginButton } = simulateChatStreamHandler({
      events: [
        {
          token:
            "To log in to Netflix, visit netflix.com and click Sign In. Then enter your login info.",
        },
        { done: true },
      ],
      isAuthenticated: false,
    });

    assert.strictEqual(
      hasLoginButton,
      false,
      "Login button must NOT be rendered just because text contains 'log in'"
    );
  });

  test("Does NOT render login button when user is already authenticated", () => {
    const { hasLoginButton } = simulateChatStreamHandler({
      events: [
        { token: "Your profile: Alice (alice@example.com)" },
        { done: true },
      ],
      isAuthenticated: true,
    });

    assert.strictEqual(
      hasLoginButton,
      false,
      "Authenticated user should not see login button"
    );
  });

  test("Renders login button for a logged-in user whose session expired (server sent requireAuth)", () => {
    const { hasLoginButton } = simulateChatStreamHandler({
      events: [
        { token: "Your session has expired." },
        { requireAuth: true, error: "You need to log in to access this feature" },
        { done: true },
      ],
      isAuthenticated: true,
    });

    assert.strictEqual(hasLoginButton, true, "Server signal decides, not client auth state");
  });
});

describe("Chat UI Thread Ownership Simulation", () => {
  function createMockStorage() {
    const store = new Map();
    return {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  }

  // Mirrors startNewThread / getThreadId in public/js/chat.js
  function threadHelpers(storage) {
    let n = 0;
    const startNewThread = (owner) => {
      storage.removeItem(`chat_history_${storage.getItem("threadId")}`);
      const threadId = `thread-${++n}`;
      storage.setItem("threadId", threadId);
      storage.setItem("threadOwner", owner);
      return threadId;
    };
    const getThreadId = (owner) => {
      const threadId = storage.getItem("threadId");
      if (threadId && storage.getItem("threadOwner") === owner) return threadId;
      return startNewThread(owner);
    };
    return { startNewThread, getThreadId };
  }

  test("Reloading as the same user keeps the thread and its history", () => {
    const storage = createMockStorage();
    const { getThreadId } = threadHelpers(storage);
    const first = getThreadId("guest");
    storage.setItem(`chat_history_${first}`, JSON.stringify([{ role: "user", text: "what time is it" }]));

    assert.strictEqual(getThreadId("guest"), first);
    assert.notStrictEqual(storage.getItem(`chat_history_${first}`), null);
  });

  test("Logging in starts a new thread and drops the guest history", () => {
    const storage = createMockStorage();
    const { getThreadId } = threadHelpers(storage);
    const guestThread = getThreadId("guest");
    storage.setItem(`chat_history_${guestThread}`, JSON.stringify([{ role: "user", text: "who am I" }]));

    const userThread = getThreadId("auth0|alice");
    assert.notStrictEqual(userThread, guestThread);
    assert.strictEqual(storage.getItem(`chat_history_${guestThread}`), null);
    assert.strictEqual(storage.getItem("threadOwner"), "auth0|alice");
  });

  test("Logging out or switching accounts also starts a new thread", () => {
    const storage = createMockStorage();
    const { getThreadId } = threadHelpers(storage);
    const alice = getThreadId("auth0|alice");
    const bob = getThreadId("auth0|bob");
    const guest = getThreadId("guest");
    assert.strictEqual(new Set([alice, bob, guest]).size, 3);
  });

  test("New chat replaces the thread and clears its history", () => {
    const storage = createMockStorage();
    const { getThreadId, startNewThread } = threadHelpers(storage);
    const old = getThreadId("guest");
    storage.setItem(`chat_history_${old}`, JSON.stringify([{ role: "user", text: "old message" }]));

    const next = startNewThread("guest");
    assert.notStrictEqual(next, old);
    assert.strictEqual(storage.getItem(`chat_history_${old}`), null);
    assert.strictEqual(storage.getItem("threadId"), next);
  });
});
