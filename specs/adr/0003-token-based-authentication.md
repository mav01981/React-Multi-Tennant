# ADR-0003: JWT Access Tokens and Rotating Refresh Tokens

- Status: Accepted
- Date: 2026-08-25

## Context

The SPA and API need stateless request authorization, silent re-authentication, logout revocation, and refresh-token reuse detection. Tokens must be body-only rather than transported in cookies.

## Decision

Issue RS256-signed JWT access tokens with a 15-minute lifetime and opaque refresh tokens with a 30-day lifetime. Persist only a hash of each refresh token, group tokens into families, rotate on refresh, and revoke the family when a revoked token is reused. Store the pair in the client localStorage session managed by the auth store.

## Consequences

API requests can be authorized without a per-request session lookup, while refresh families provide server-side revocation and reuse detection. LocalStorage increases the impact of an XSS vulnerability, so CSP and short access-token lifetimes remain required. The development signing key is ephemeral and must be replaced by managed key material in production.

## Alternatives considered

- Cookie sessions: rejected for this API contract because tokens are explicitly body-only.
- Long-lived JWTs without refresh rotation: rejected because revocation and reuse detection would be weaker.
- Opaque access tokens: deferred; JWTs provide the required stateless authorization claims.
