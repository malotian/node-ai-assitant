# Phase 1: Call First-Party APIs on the User's Behalf

**Status:** Code complete. Tested up to the Auth0 login page; logged-in flow still to be verified.
**Reference:** https://auth0.com/ai/docs/get-started/call-first-party-apis-on-users-behalf

## Approach

Follows the doc's server-side pattern. The app is a **Regular Web App**: the Express server
logs the user in with its client secret, keeps the access token in the session, and hands it to the agent.
The browser never sees a token.

```
Browser ──cookie──▶ Express (express-openid-connect)
                      │  req.oidc.accessToken  (refreshed if expired)
                      ▼
                    LangGraph agent  configurable: { thread_id, user, authenticated, accessToken }
                      │
                      ▼
                    get_user_profile tool ──Authorization: Bearer <token>──▶ https://AUTH0_DOMAIN/userinfo
```

## Changes

| File | Change |
|------|--------|
| `src/server.js` | `authorizationParams` adds `offline_access` (and `audience` only when `AUTH0_API_AUDIENCE` is set); `getAccessToken(req)` refreshes an expired token; `/api/chat` passes `accessToken` to the agent |
| `src/tools.js` | `get_user_profile` calls the first-party API (`/userinfo`) with the user's access token; a 401 returns the auth-required signal |
| `public/js/auth.js` | Server-driven auth status (`/api/auth/status`, `/api/me`); exposes `authReady` |
| `public/js/chat.js` | Greets after `authReady`; login button links to `/auth/login` |
| `.env` | `AUTH0_SECRET` (session cookie); `AUTH0_API_AUDIENCE` optional, commented out |

## Auth0 setup

**Application** (unchanged from before Phase 1): Regular Web App
- Allowed Callback URLs: `http://localhost:3000/auth/callback`
- Allowed Logout URLs: `http://localhost:3000`

### Audience (optional)
Without `AUTH0_API_AUDIENCE`, Auth0 issues an access token that is valid for its own `/userinfo`,
which is all `get_user_profile` needs. Set it when the agent should call **your own** API:
1. Applications → APIs → Create API. Identifier = `AUTH0_API_AUDIENCE`, RS256, Allow Offline Access on.
   If the API doesn't exist, login fails with `Service not found: <audience>`.
2. Uncomment `AUTH0_API_AUDIENCE` in `.env`; the access token becomes a JWT for that API
   (it still works for `/userinfo`, since `openid` is in the scope).

## Testing checklist

- [x] Server starts; `/api/auth/status` → `{"authenticated":false}`; `/api/me` → 401 when anonymous
- [x] Anonymous chat works (`get_current_time`)
- [x] Anonymous "show my profile" → auth-required signal → Log in button
- [x] `/auth/login` redirects to Auth0 with `offline_access` (no audience) and shows the login page
- [ ] Login completes and returns to the app
- [ ] Logged in: "show my profile" returns data from `/userinfo`
- [ ] Token refresh after expiry
