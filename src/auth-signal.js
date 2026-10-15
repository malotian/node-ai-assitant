// Definitive auth-required signal: the contract between tools, the agent and the chat route.
// A tool that needs login returns createAuthRequiredPayload(); the chat route checks the
// tool messages of the current turn with isAuthRequiredSignal() and tells the browser to log in.

const AUTH_REQUIRED_CODE = "AUTH_REQUIRED";
const REQUIRES_AUTH_CODE = "REQUIRES_AUTH";
const AUTH_REQUIRED_MARKER = "[AUTH_REQUIRED]";
const LOGIN_REQUIRED_MESSAGE = "You need to log in to access this feature";

function createAuthRequiredPayload(message = "Authentication required") {
  return JSON.stringify({
    requiresAuth: true,
    error: AUTH_REQUIRED_CODE,
    code: REQUIRES_AUTH_CODE,
    message: `${AUTH_REQUIRED_MARKER} ${message}`,
  });
}

// Event sent to the browser over SSE when the user must log in
function requireAuthEvent() {
  return { requireAuth: true, error: LOGIN_REQUIRED_MESSAGE };
}

// Errors thrown (rather than returned) by the agent run that mean "login needed"
function isAuthRequiredError(err) {
  return (
    err?.code === REQUIRES_AUTH_CODE ||
    err?.message?.includes("requires authentication") ||
    err?.message?.includes(AUTH_REQUIRED_MARKER)
  );
}

function isHumanMessage(m) {
  return (
    m._getType?.() === "human" ||
    m.role === "user" ||
    m.role === "human" ||
    m.constructor?.name === "HumanMessage"
  );
}

function isToolMessage(m) {
  return (
    m._getType?.() === "tool" ||
    m.role === "tool" ||
    m.name === "tool" ||
    m.constructor?.name === "ToolMessage"
  );
}

// True when an object carries the structured auth-required fields
function hasAuthFields(obj) {
  return (
    obj.requiresAuth === true ||
    obj.error === AUTH_REQUIRED_CODE ||
    obj.code === REQUIRES_AUTH_CODE
  );
}

function toolMessageSignalsAuth(msg) {
  const { content } = msg;

  if (typeof content === "string") {
    if (
      content.includes(AUTH_REQUIRED_MARKER) ||
      content.includes(AUTH_REQUIRED_CODE) ||
      content.includes(REQUIRES_AUTH_CODE)
    ) {
      return true;
    }
    try {
      const parsed = JSON.parse(content);
      if (parsed && hasAuthFields(parsed)) return true;
    } catch {
      // Not JSON
    }
  } else if (content && typeof content === "object" && hasAuthFields(content)) {
    return true;
  }

  return Boolean(
    msg.artifact &&
      (msg.artifact.requiresAuth === true || msg.artifact.error === AUTH_REQUIRED_CODE)
  );
}

// Only the current turn counts: start at the last human message so earlier turns cannot trigger login
function isAuthRequiredSignal(messages) {
  if (!Array.isArray(messages)) return false;

  let startIndex = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHumanMessage(messages[i])) {
      startIndex = i;
      break;
    }
  }

  return messages.slice(startIndex).some((msg) => isToolMessage(msg) && toolMessageSignalsAuth(msg));
}

module.exports = {
  AUTH_REQUIRED_CODE,
  AUTH_REQUIRED_MARKER,
  LOGIN_REQUIRED_MESSAGE,
  createAuthRequiredPayload,
  requireAuthEvent,
  isAuthRequiredError,
  isAuthRequiredSignal,
};
