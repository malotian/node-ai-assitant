// Chat UI and logic
// Persist threadId across page loads/logins to maintain conversation history
const getThreadId = () => {
  let threadId = localStorage.getItem("threadId");
  if (!threadId) {
    threadId = crypto.randomUUID();
    localStorage.setItem("threadId", threadId);
  }
  return threadId;
};

const CHAT = {
  threadId: getThreadId(),
  log: document.getElementById("chat-log"),
  form: document.getElementById("chat-form"),
  input: document.getElementById("chat-input"),
  sendBtn: document.getElementById("send-btn"),
  newChatBtn: document.getElementById("new-chat"),
  messagesReceived: false,
};

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = text;
  CHAT.log.appendChild(el);
  CHAT.log.scrollTop = CHAT.log.scrollHeight;
  return el;
}

function greet() {
  const name = AUTH.user?.name || AUTH.user?.email || "there";
  const greeting = AUTH.authenticated
    ? `Hello ${name}, I'm your personal assistant. How can I help you today?`
    : `Hello ${name}! I'm your assistant. (Some features require login.)`;
  addMessage("bot", greeting);
}

function showLoginButton(targetMsg) {
  if (targetMsg.querySelector(".login-action-btn")) return;
  const btnWrapper = document.createElement("div");
  btnWrapper.className = "auth-action-wrapper";
  btnWrapper.style.marginTop = "10px";

  const loginLink = document.createElement("button");
  loginLink.className = "btn small login-action-btn";
  loginLink.textContent = "🔐 Log in";
  loginLink.onclick = (e) => {
    e.preventDefault();
    login(); // NEW (Phase 1): Call Auth0Client login
  };

  btnWrapper.appendChild(loginLink);
  targetMsg.appendChild(btnWrapper);
}

async function sendMessage() {
  const text = CHAT.input.value.trim();
  if (!text) return;

  CHAT.input.value = "";
  addMessage("user", text);
  CHAT.sendBtn.disabled = true;

  const botMsg = addMessage("bot", "…");
  let received = false;

  try {
    // NEW (Phase 1): Get access token if authenticated
    const accessToken = AUTH.authenticated ? await getAccessToken() : null;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: text,
        threadId: CHAT.threadId,
        accessToken, // NEW (Phase 1): Send access token to backend
      }),
    });

    if (response.status === 401) {
      botMsg.textContent = "⚠️ This feature requires login. Please log in to continue.";
      showLoginButton(botMsg);
      return;
    }

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Something went wrong");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let authRequired = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
    if (authRequired && !AUTH.authenticated) {
      showLoginButton(botMsg);
      CHAT.log.scrollTop = CHAT.log.scrollHeight;
    }
  } catch (error) {
    botMsg.textContent = "⚠️ " + error.message;
  } finally {
    CHAT.sendBtn.disabled = false;
    CHAT.input.focus();
  }
}

CHAT.form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});

CHAT.newChatBtn.addEventListener("click", () => {
  // Create new conversation and update localStorage
  CHAT.threadId = crypto.randomUUID();
  localStorage.setItem("threadId", CHAT.threadId);
  CHAT.log.innerHTML = "";
  greet();
  CHAT.input.focus();
});

// Greet on chat screen show
greet();
