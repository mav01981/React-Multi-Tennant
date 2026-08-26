# Backend: Security Headers & Transport Hardening

> **Scope:** Backend-only — HTTP header hardening applied to every API response.
> **Source of truth:** `contracts/api-contract.md` (headers §2).

---

## 1. Mandatory Response Headers

| Header | Value template | Notes |
|--------|----------------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS-only |
| `X-Content-Type-Options` | `nosniff` | block MIME sniffing |
| `X-Frame-Options` | `DENY` | block clickjacking |
| `Referrer-Policy` | `no-referrer` | no referrer leak out of app |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | minimal |

## 2. Content Security Policy (CSP)

Applied via the **`Content-Security-Policy`** response header; configured guardrails for a React SPA:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self'
```

**Why CSP matters for auth:** localStorage holds the access token (see `auth-flow.md` §7). CSP is a primary mitigation against XSS exfiltrating that token.

### Development vs production
- **Dev:** allow relaxed `script-src 'self' 'unsafe-eval'` for hot-reload / dev toasts, disabled only locally.
- **Production:** strict policy above — no `'unsafe-eval'`, no external script origins.

## 3. CORS Policy

| Rule | Value |
|------|-------|
| `Access-Control-Allow-Origin` | reflect configured origin(s), **never** `*` on authenticated routes |
| `Access-Control-Allow-Credentials` | not required (tokens are body, not cookies) |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Authorization, Content-Type, X-Request-Id` |
| `Access-Control-Max-Age` | `86400` (preflight cache) |

## 4. Other Hardening

- **Request size cap** + body validator (400 `VALIDATION_FAILED` on overflow).
- **Rate limiting** on auth endpoints (see `be-identity-config.md` §5) — via `429` + `Retry-After`.
- **`X-Request-Id`** correlation on every response (echoed), aiding traceability in logs.
- **Disable server-banner disclosure** — strip `Server` / framework fingerprint headers.

## 5. Middleware Wiring (placement)

Apply as a global middleware chain so every response passes through:

```
TLS/HSTS → SecurityHeaders → CSP → CORS → RequestId → compression → routing
```

---

## 6. Related Specs
- `contracts/api-contract.md` — headers §2 + error envelope.
- `contracts/auth-flow.md` — CSP rationale re: localStorage tokens.
- `backend/be-identity-config.md` — rate-limit + lockout interplay.