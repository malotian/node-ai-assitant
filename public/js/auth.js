// Authentication state and initialization
let AUTH = {
  authenticated: false,
  user: null,
};

async function initAuth() {
  try {
    const response = await fetch("/api/auth/status");
    const status = await response.json();
    AUTH.authenticated = status.authenticated;

    if (AUTH.authenticated) {
      const userResponse = await fetch("/api/me");
      AUTH.user = await userResponse.json();
    }
  } catch (error) {
    console.error("Auth check failed:", error);
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

// Initialize auth on page load
initAuth();
