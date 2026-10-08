// Chat UI and logic
// Persist threadId across page loads/logins to maintain conversation history
const getThreadId = () => {
  let threadId = localStorage.getItem("threadId");
  if (!threadId) {
    threadId = crypto.randomUUID();
    localStorage.setItem("threadId", threadId);
    log("chat", "No saved thread, started new threadId:", threadId);
  } else {
    log("chat", "Reusing saved threadId (server keeps this conversation's history):", threadId);
  }
  return threadId;
};

const getHistoryKey = (threadId) => `chat_history_${threadId}`;

function loadHistory(threadId) {
  try {
    const raw = localStorage.getItem(getHistoryKey(threadId));
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load history from localStorage:", err);
    return [];
  }
}

function saveMessage(threadId, role, text, requireAuth = false) {
  try {
    const history = loadHistory(threadId);
    history.push({ role, text, requireAuth: !!requireAuth });
    localStorage.setItem(getHistoryKey(threadId), JSON.stringify(history));
  } catch (err) {
    console.error("Failed to save message to localStorage:", err);
  }
}

// Initialize CHAT object after DOM is ready
let CHAT = null;

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = text;
  CHAT.log.appendChild(el);
  CHAT.log.scrollTop = CHAT.log.scrollHeight;
  return el;
}

function greet() {
  log("chat", "Greeting as", AUTH.authenticated ? "logged-in user" : "guest");
  const name = AUTH.user?.name || AUTH.user?.email || "there";
  const greeting = AUTH.authenticated
    ? `Hello ${name}, I'm your personal assistant. How can I help you today?`
    : `Hello ${name}! I'm your assistant. (Some features require login.)`;
  addMessage("bot", greeting);
  saveMessage(CHAT.threadId, "bot", greeting, false);
}

function showLoginButton(targetMsg) {
  if (targetMsg.querySelector(".login-action-btn")) return;
  const btnWrapper = document.createElement("div");
  btnWrapper.className = "auth-action-wrapper";
  btnWrapper.style.marginTop = "10px";

  const loginLink = document.createElement("a");
  loginLink.className = "btn small login-action-btn";
  loginLink.href = "/auth/login";
  loginLink.textContent = "🔐 Log in";
  loginLink.addEventListener("click", () => {
    log("auth", "Log in clicked (from chat) -> /auth/login");
    if (CHAT && CHAT.lastUserPrompt) {
      localStorage.setItem("pendingMessage", CHAT.lastUserPrompt);
    }
  });
  log("chat", "Showing Log in button (server sent requireAuth)");

  btnWrapper.appendChild(loginLink);
  targetMsg.appendChild(btnWrapper);
}

function restoreHistory() {
  const history = loadHistory(CHAT.threadId);
  if (history && history.length > 0) {
    CHAT.log.innerHTML = "";
    for (const msg of history) {
      const el = addMessage(msg.role, msg.text);
      if (msg.requireAuth && !AUTH.authenticated) {
        showLoginButton(el);
      }
    }
    CHAT.log.scrollTop = CHAT.log.scrollHeight;
    return true;
  }
  return false;
}

async function sendMessageText(text) {
  CHAT.lastUserPrompt = text;
  addMessage("user", text);
  saveMessage(CHAT.threadId, "user", text, false);
  CHAT.sendBtn.disabled = true;

  const botMsg = addMessage("bot", "…");
  let received = false;

  const started = performance.now();
  const since = () => `+${Math.round(performance.now() - started)}ms`;
  // Everything about this turn is printed as one collapsed console group when it finishes
  const turn = [];
  let summary = "failed";
  let authRequired = false;

  try {
    // Session cookie identifies the user; the server attaches the access token
    const body = JSON.stringify({ message: text, threadId: CHAT.threadId });
    turn.push([`Request body (loggedIn: ${AUTH.authenticated})`, JSON.parse(body)]);
    log("chat", `Sending: "${text}"`);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    turn.push([`Response ${response.status} at ${since()}, headers`, Object.fromEntries(response.headers)]);
    if (response.status === 401) {
      summary = "401 (login required)";
      botMsg.textContent = "⚠️ This feature requires login. Please log in to continue.";
      authRequired = true;
      localStorage.setItem("pendingMessage", text);
      showLoginButton(botMsg);
      saveMessage(CHAT.threadId, "bot", botMsg.textContent, true);
      return;
    }

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Something went wrong");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      turn.push([`Stream chunk ${value.length} B at ${since()} (raw)`, chunk]);
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        let event;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        turn.push([`Server event at ${since()}`, event]);

        // Definitive signal from server indicating authentication is required
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
        } else if (event.tool) {
          botMsg.textContent = `🔧 using ${event.tool}…`;
        } else if (event.error && !event.requireAuth) {
          throw new Error(event.error);
        }

        CHAT.log.scrollTop = CHAT.log.scrollHeight;
      }
    }

    // Definitive action: only show login button if server signaled that auth is required
    // and the user is not already authenticated. Never inspect LLM text for keywords!
    if (authRequired) {
      localStorage.setItem("pendingMessage", text);
      if (!AUTH.authenticated) {
        showLoginButton(botMsg);
        CHAT.log.scrollTop = CHAT.log.scrollHeight;
      }
    } else {
      localStorage.removeItem("pendingMessage");
    }

    saveMessage(CHAT.threadId, "bot", botMsg.textContent, authRequired);
    summary = `${response.status} in ${Math.round(performance.now() - started)}ms${authRequired ? " (login required)" : ""}`;
  } catch (error) {
    console.error("[chat] Request failed:", error);
    turn.push(["Error", error]);
    botMsg.textContent = "⚠️ " + error.message;
    saveMessage(CHAT.threadId, "bot", botMsg.textContent, false);
  } finally {
    logGroup("chat", `POST /api/chat "${text.slice(0, 40)}" → ${summary}`, turn);
    CHAT.sendBtn.disabled = false;
    CHAT.input.focus();
  }
}

async function sendMessage() {
  const text = CHAT.input.value.trim();
  if (!text) return;

  CHAT.input.value = "";
  await sendMessageText(text);
}

function initChat() {
  CHAT = {
    threadId: getThreadId(),
    log: document.getElementById("chat-log"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("chat-input"),
    sendBtn: document.getElementById("send-btn"),
    newChatBtn: document.getElementById("new-chat"),
    messagesReceived: false,
    lastUserPrompt: null,
  };

  if (!CHAT.form) {
    console.error("Chat form not found in DOM");
    return;
  }

  // Attach event listeners
  CHAT.form.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  CHAT.newChatBtn.addEventListener("click", () => {
    const oldThreadId = CHAT.threadId;
    localStorage.removeItem(getHistoryKey(oldThreadId));
    localStorage.removeItem("pendingMessage");
    CHAT.threadId = crypto.randomUUID();
    localStorage.setItem("threadId", CHAT.threadId);
    CHAT.lastUserPrompt = null;
    log("chat", "New chat, threadId:", CHAT.threadId);
    CHAT.log.innerHTML = "";
    greet();
    CHAT.input.focus();
  });

  log("chat", "Chat ready, threadId:", CHAT.threadId);
}

async function startChat() {
  initChat();

  // Wait until authentication status is verified
  await authReady;

  const restored = restoreHistory();
  if (!restored) {
    greet();
  }

  // If user just logged in and had a pending message that required auth, resume it automatically
  const pending = localStorage.getItem("pendingMessage");
  if (AUTH.authenticated && pending) {
    localStorage.removeItem("pendingMessage");
    log("chat", "Resuming pending message after authentication:", pending);
    await sendMessageText(pending);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startChat);
} else {
  startChat();
}
