// Authentication state and initialization
// Login/logout and tokens are handled server-side (express-openid-connect);
// the browser only asks the server whether the user is logged in.
let AUTH = {
  authenticated: false,
  user: null,
};

// Debug logging to the browser console; turn off with localStorage.setItem("debug", "off")
const DEBUG = (() => {
  try {
    return localStorage.getItem("debug") !== "off";
  } catch {
    return true;
  }
})();
function log(scope, ...args) {
  if (DEBUG) console.log(`%c[${scope}]`, "color:#7c3aed;font-weight:bold", ...args);
}
// One collapsed console group; each item is [label, value] and objects stay expandable
function logGroup(scope, title, items) {
  if (!DEBUG) return;
  console.groupCollapsed(`%c[${scope}]%c ${title}`, "color:#7c3aed;font-weight:bold", "");
  for (const [label, value] of items) value === undefined ? console.log(label) : console.log(label, value);
  console.groupEnd();
}

// Surface errors that would otherwise only show as a red line
window.addEventListener("error", (e) => console.error("[page] Uncaught error:", e.message, `${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => console.error("[page] Unhandled promise rejection:", e.reason));

async function initAuth() {
  log("page", "Loaded", { url: location.href, referrer: document.referrer || "(none)" });
  if (document.referrer.includes(window.location.host + "/auth/callback") || document.referrer.includes(".auth0.com")) {
    log("auth", "Returned from Auth0 login");
  }
  try {
    log("auth", "Checking login status: GET /api/auth/status");
    const response = await fetch("/api/auth/status");
    const status = await response.json();
    log("auth", `/api/auth/status -> ${response.status}, headers:`, Object.fromEntries(response.headers), "body:", status);
    AUTH.authenticated = status.authenticated;
    log("auth", "Logged in:", AUTH.authenticated);

    if (AUTH.authenticated) {
      const userResponse = await fetch("/api/me");
      AUTH.user = await userResponse.json();
      log("auth", `/api/me -> ${userResponse.status}`, AUTH.user);
    } else {
      log("auth", "Guest mode. Login via /auth/login (server redirects to Auth0)");
    }
  } catch (error) {
    console.error("Auth check failed:", error);
  }

  renderAuthUI();
  log("auth", "Auth ready", { authenticated: AUTH.authenticated, user: AUTH.user?.email || AUTH.user?.name || null });
}

function renderAuthUI() {
  const userName = document.getElementById("user-name");
  const authLink = document.getElementById("auth-link");
  const logoutLink = document.getElementById("logout-link");

  if (AUTH.authenticated && AUTH.user) {
    // Show logged-in user info
    userName.textContent = AUTH.user.name || AUTH.user.email || "User";
    authLink.style.display = "none";
    logoutLink.style.display = "inline";
  } else {
    // Show guest/login
    userName.textContent = "Guest";
    authLink.style.display = "inline";
    logoutLink.style.display = "none";
  }

  authLink.addEventListener("click", () => log("auth", "Log in clicked -> /auth/login"));
  // chat.js starts a new thread when the user changes, so nothing to clear here
  logoutLink.addEventListener("click", () => log("auth", "Log out clicked -> /auth/logout"));
}

// Resolves once auth state is known, so chat.js can greet the user by name
const authReady = initAuth();
