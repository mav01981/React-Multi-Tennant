# ADR-0003: JWT Access Tokens and Rotating Refresh Tokens

- Status: Accepted
- Date: 2026-01-25
- Revised: 2026-09-05 (storage/transport model superseded — see Decision)

## Context

The SPA and API need stateless request authorization, silent re-authentication, logout revocation, and refresh-token reuse detection. Requests must be authorizable without a per-request session lookup, the client must silently re-authenticate across reloads, and the long-lived refresh credential must stay out of reach of XSS.

## Decision

Issue RS256-signed JWT access tokens with a 15-minute lifetime and opaque refresh tokens with a 30-day lifetime. Persist only a hash of each refresh token, group tokens into families, rotate on refresh, and revoke the family when a revoked token is reused.

**Transport and storage:**

- The **access token** is body-only (`LoginResponse.accessToken`) and, on the client, lives **in memory only** (the `auth` Zustand store) — never in localStorage.
- The **refresh token** is delivered to browsers **exclusively as an `HttpOnly` cookie** named `refreshToken` (`SameSite=Strict`, `Secure` except in development, `Path=/api/v1/auth`) via `Identity.API.Common.RefreshTokenCookie`. It never appears in a JSON body a script can read.
- `/auth/refresh` authenticates via that cookie: the browser sends an **empty body** with `credentials: 'include'`. A JSON body (`{ accessToken, refreshToken }`) remains a fallback for **non-browser clients**; the cookie wins when present.
- localStorage holds only **non-secret** data: `tenantSlug` and a `hasSession` boolean hint.

This supersedes the original body-only/localStorage pair decision in this ADR: both tokens were originally to live in localStorage, which put the long-lived refresh credential within reach of XSS.

## Consequences

API requests remain statelessly authorized while refresh families provide server-side revocation and reuse detection. The refresh credential is invisible to JavaScript, so XSS can no longer exfiltrate it; the access token is readable in memory and module state, so **CSP + a short 15-min access TTL remain required**. `SameSite=Strict` plus scoping to `/auth` prevent cross-site use of the refresh cookie. Logout revokes the family server-side and deletes the cookie. The development signing key is ephemeral and must be replaced by managed key material in production.

## Alternatives considered

- Full server-side cookie sessions: rejected for stateless authorization — valid requests would require a session lookup. Only the opaque **refresh credential** is cookie-delivered; the access token stays a stateless body-only JWT.
- Original body-only/localStorage pair (earlier draft of this ADR): rejected — it placed the long-lived refresh token within reach of XSS. Superseded by the `HttpOnly` cookie arrangement.
- Long-lived JWTs without refresh rotation: rejected because revocation and reuse detection would be weaker.
- Opaque access tokens: deferred; JWTs provide the required stateless authorization claims.