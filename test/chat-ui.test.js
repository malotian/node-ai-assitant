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

    if (authRequired && !isAuthenticated) {
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
});

describe("Chat UI History Retention & Auth Transition Simulation", () => {
  function createMockStorage() {
    const store = new Map();
    return {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  }

  test("Restores full message history on reload after switching from anonymous to login", () => {
    const storage = createMockStorage();
    const threadId = "test-thread-uuid-123";
    storage.setItem("threadId", threadId);

    // Simulate anonymous messages saved before login
    const savedMessages = [
      { role: "bot", text: "Hello there! I'm your assistant. (Some features require login.)", requireAuth: false },
      { role: "user", text: "what is the time of the day", requireAuth: false },
      { role: "bot", text: "It is currently 10:45 AM UTC.", requireAuth: false },
      { role: "user", text: "who am I", requireAuth: false },
      { role: "bot", text: "⚠️ You need to log in to access this feature", requireAuth: true },
    ];
    storage.setItem(`chat_history_${threadId}`, JSON.stringify(savedMessages));

    // Simulate restore when authenticated = true
    const restoredDOM = [];
    const history = JSON.parse(storage.getItem(`chat_history_${threadId}`) || "[]");
    const isAuthenticated = true;

    for (const msg of history) {
      const el = { role: msg.role, text: msg.text, hasLoginBtn: false };
      if (msg.requireAuth && !isAuthenticated) {
        el.hasLoginBtn = true;
      }
      restoredDOM.push(el);
    }

    assert.strictEqual(restoredDOM.length, 5, "All 5 prior messages must be restored");
    assert.strictEqual(restoredDOM[1].text, "what is the time of the day");
    assert.strictEqual(restoredDOM[2].text, "It is currently 10:45 AM UTC.");
    assert.strictEqual(restoredDOM[3].text, "who am I");
    assert.strictEqual(restoredDOM[4].hasLoginBtn, false, "Login button must NOT be shown when now authenticated");
  });

  test("Pending auth message is saved on requireAuth and consumed after login", () => {
    const storage = createMockStorage();

    // 1. requireAuth triggers pending message storage
    const prompt = "who am I";
    storage.setItem("pendingMessage", prompt);

    assert.strictEqual(storage.getItem("pendingMessage"), "who am I");

    // 2. On return with authenticated = true, pending message is read and cleared
    const isAuthenticated = true;
    let resumedPrompt = null;
    const pending = storage.getItem("pendingMessage");
    if (isAuthenticated && pending) {
      storage.removeItem("pendingMessage");
      resumedPrompt = pending;
    }

    assert.strictEqual(resumedPrompt, "who am I", "Pending prompt should be retrieved for resumption");
    assert.strictEqual(storage.getItem("pendingMessage"), null, "Pending prompt should be cleared from storage");
  });

  test("New chat clears thread history and pending message", () => {
    const storage = createMockStorage();
    const oldThreadId = "old-thread";
    storage.setItem("threadId", oldThreadId);
    storage.setItem(`chat_history_${oldThreadId}`, JSON.stringify([{ role: "user", text: "old message" }]));
    storage.setItem("pendingMessage", "who am I");

    // Simulate clicking New chat
    storage.removeItem(`chat_history_${oldThreadId}`);
    storage.removeItem("pendingMessage");
    const newThreadId = "new-thread";
    storage.setItem("threadId", newThreadId);

    assert.strictEqual(storage.getItem(`chat_history_${oldThreadId}`), null);
    assert.strictEqual(storage.getItem("pendingMessage"), null);
    assert.strictEqual(storage.getItem("threadId"), newThreadId);
  });
});
