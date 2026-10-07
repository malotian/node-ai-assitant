// Authentication state and Auth0Client initialization (Phase 1)
let AUTH = {
  authenticated: false,
  user: null,
  accessToken: null,
  auth0Client: null,
};

// Initialize Auth0Client from CDN
async function initAuth() {
  try {
    // Load Auth0Client from CDN
    if (typeof Auth0Client === "undefined") {
      console.error("Auth0Client not loaded");
      return;
    }

    // Get config from environment (set by server via script tag)
    const domain = window.AUTH0_DOMAIN || "malotian-lab.auth0.com";
    const clientId = window.AUTH0_CLIENT_ID || "pCsLVKSCw8ROrXqZYWA2qGYZwcREoCjJ";
    const audience = window.AUTH0_API_AUDIENCE || "https://node-ai-assistant.example.com";

    // Create Auth0Client instance
    AUTH.auth0Client = await Auth0Client.create({
      domain,
      clientId,
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience, // NEW: Request access tokens for API
        scope: "openid profile email", // Request user info scopes
      },
    });

    // Check if returning from Auth0 callback
    if (window.location.search.includes("code=")) {
      await AUTH.auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check authentication status
    AUTH.authenticated = await AUTH.auth0Client.isAuthenticated();

    if (AUTH.authenticated) {
      // Get user profile
      AUTH.user = await AUTH.auth0Client.getUser();

      // Get access token for API calls (NEW: Phase 1)
      AUTH.accessToken = await AUTH.auth0Client.getTokenSilently({
        audience,
        scope: "openid profile email",
      });
    }
  } catch (error) {
    console.error("Auth initialization failed:", error);
  }

  renderAuthUI();
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
}

// NEW: Get fresh access token (auto-refreshes if needed)
async function getAccessToken() {
  if (!AUTH.auth0Client) return null;

  try {
    const token = await AUTH.auth0Client.getTokenSilently();
    AUTH.accessToken = token;
    return token;
  } catch (error) {
    console.error("Failed to get access token:", error);
    return null;
  }
}

// NEW: Login with Auth0
async function login() {
  if (!AUTH.auth0Client) {
    // Fallback for if Auth0Client failed to initialize
    window.location.href = "https://malotian-lab.auth0.com/authorize?client_id=pCsLVKSCw8ROrXqZYWA2qGYZwcREoCjJ&redirect_uri=" + encodeURIComponent(window.location.origin) + "&response_type=code&scope=openid%20profile%20email";
    return;
  }

  await AUTH.auth0Client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin,
    },
  });
}

// NEW: Logout with Auth0
async function logout() {
  if (!AUTH.auth0Client) return;

  AUTH.auth0Client.logout({
    returnTo: window.location.origin,
  });
}

// Initialize auth immediately if DOM is ready, otherwise wait for DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuth);
} else {
  // DOM already loaded (auth.js loaded after DOMContentLoaded event)
  initAuth();
}
