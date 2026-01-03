# eastbayoverland.com — SPA + BFF Architecture & Build Specification

## Purpose of this Document

This document is a **complete specification and build directive** for an AI agent (or human) to generate a production-ready repository implementing a **Single Page Application (SPA)** and **Backend-for-Frontend (BFF)** on **Cloudflare Pages**.

It is intended to be used as a **mega‑prompt**: if there is ambiguity, **this document is authoritative**.

---

## Canonical Domain & Hosting Model

### Canonical Host
- **Apex domain only**  
  ```
  https://eastbayoverland.com
  ```
- `www.eastbayoverland.com` **must 301 redirect** to the apex domain at the Cloudflare edge.

### Hosting
- Platform: **Cloudflare Pages**
- Static SPA served from `/`
- BFF implemented using **Cloudflare Pages Functions (Advanced Mode)**
- **Single entrypoint router**
  - All BFF routing is handled in `_worker.ts` (project root)
  - Route handlers are organized in modules under `functions/auth/*` and `functions/api/*`
  - Build output requirement (Pages):
    - The deployed artifact must be named `_worker.js` and live in the Pages build output directory (e.g. `public/_worker.js`)
    - `_worker.ts` is the source entrypoint and should be bundled during `npm run build`
- **Same-origin SPA + BFF**
  - No CORS
  - No tokens exposed to browser JavaScript
  - Authentication state via HttpOnly cookies only

---

## High-Level Architecture

Browser → Cloudflare Pages (SPA + BFF) → AuthGenie → Planner API

Key ideas:
- The browser only interacts with the BFF
- The BFF owns authentication and token handling
- All downstream calls use first‑party access tokens

---

## Core Architectural Principles

1. **BFF owns authentication**
   - OAuth never runs in the SPA
   - The SPA never sees tokens

2. **External identity is exchanged**
   - Google/Apple ID tokens are never used directly
   - All identity is exchanged via **AuthGenie**

3. **Server-side sessions**
   - Session ID stored in HttpOnly cookie
   - Session data stored in **Durable Objects**

4. **Refresh-on-demand**
   - Access tokens are refreshed automatically when needed
   - API endpoints never deal with refresh logic directly

5. **Clear separation of concerns**
   - Auth logic in one place
   - API endpoints in small, focused files
   - Shared infrastructure in reusable modules

---

## Authentication Flows

### Providers
- Google (OIDC)
- Apple (OIDC, `form_post` callback)

### BFF Auth Routes (exact contract)

The BFF must implement the following same-origin routes:

- `GET /auth/google/login`
- `GET /auth/google/callback`
- `GET /auth/apple/login`
- `POST /auth/apple/callback` (Apple uses `form_post`)
- `POST /auth/logout`

### Login Flow

1. SPA redirects to `/auth/google/login` or `/auth/apple/login`
2. BFF:
   - Generates `state` and `nonce`
   - Stores them in a short‑lived ephemeral cookie
   - Redirects to the provider
3. Provider redirects back to callback endpoint
4. BFF callback:
   - Validates `state`
   - Verifies ID token (issuer, audience, exp, signature, nonce)
   - Exchanges ID token with **AuthGenie**
   - Stores AuthGenie access + refresh tokens in session
   - Redirects to `/`

### Logout Flow
- `POST /auth/logout`
- Session cleared from Durable Object
- Session cookie deleted

---

## AuthGenie Integration

### Purpose
AuthGenie is the **system of record** for first‑party identity and authorization.

### Token Exchange
- Endpoint: `POST /v1/oauth/token`
- Grant:
  ```
  urn:ietf:params:oauth:grant-type:token-exchange
  ```
- Encoding: `application/x-www-form-urlencoded`
- Client auth: HTTP Basic

### Refresh
- Same endpoint
- Grant type: `refresh_token`

---

## Session Model

```ts
type Session = {
  provider?: "google" | "apple";
  idToken?: string; // optional, debug only
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  subject?: string;
  createdAt?: number;
};
```

---

## BFF API Behavior

### Initial BFF API Surface (v1)

Until additional endpoints are explicitly added, the BFF exposes only:

- `GET /api/members/me` → proxies to Planner API `GET /members/me`

### Mandatory Rule
Every `/api/*` endpoint **must**:
1. Load the session
2. Call `ensureAccessToken()`
3. Use returned access token
4. Forward request to Planner API
5. Attach refreshed cookie if rotation occurred

No endpoint may bypass this rule.

---

## Required Repository Structure

```
/
├── public/
│   └── index.html
├── functions/
│   ├── auth/
│   │   ├── google.ts
│   │   ├── apple.ts
│   │   └── logout.ts
│   ├── api/
│   │   ├── me.ts
│   │   └── ...
│   ├── _lib/
│   │   ├── env.ts
│   │   ├── session.ts
│   │   ├── cookies.ts
│   │   ├── authgenie.ts
│   │   ├── tokens.ts
│   │   ├── oidc.ts
│   │   ├── planner.ts
│   │   └── http.ts
│   └── _generated/
│       ├── authgenie.ts
│       └── planner.ts
├── openapi/
│   ├── authgenie-openapi.yaml
│   └── planner-openapi.yaml
├── _routes.json
├── _worker.ts
├── wrangler.toml
├── package.json
├── .dev.vars.example
└── README.md
```

---

## Routing Rules

### `_routes.json`
```json
{
  "version": 1,
  "include": ["/auth/*", "/api/*"],
  "exclude": ["/*"]
}
```

### Advanced Mode Router

- `functions/_worker.ts` is the **single entrypoint** and owns all routing for:
  - `/auth/*`
  - `/api/*`
- `functions/auth/*` and `functions/api/*` are **handler modules** imported by the router.
  - They are not file-based routes; routing decisions happen in `_worker.ts`.

### Invariants
- The SPA triggers login by redirecting to `/auth/google/login` or `/auth/apple/login`.
- The SPA never receives access/refresh tokens and never stores tokens.
- All authentication/session/token handling is BFF-only.
- `/api/*` routes must enforce the “Mandatory Rule” above (session + `ensureAccessToken()` + proxy).

---

## OpenAPI Code Generation

- Tool: `openapi-typescript`
- Output: **types only**
- Runtime calls must use `fetch`
- `servers` section is ignored

### Scripts
```json
{
  "gen:authgenie": "openapi-typescript ./openapi/authgenie-openapi.yaml -o ./functions/_generated/authgenie.ts",
  "gen:planner": "openapi-typescript ./openapi/planner-openapi.yaml -o ./functions/_generated/planner.ts",
  "gen": "npm run gen:authgenie && npm run gen:planner"
}
```

---

## Environment Variables

### Common
```
BASE_URL=https://eastbayoverland.com
SESSION_COOKIE_NAME=bff_session
```

### Google
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

### Apple
```
APPLE_CLIENT_ID
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY_P8
```

### AuthGenie
```
AUTHGENIE_BASE_URL
AUTHGENIE_CLIENT_ID
AUTHGENIE_CLIENT_SECRET
AUTHGENIE_AUDIENCE=eastbayoverland:scheduling
```

### Planner API
```
PLANNER_BASE_URL
```

---

## Security Requirements

- Cookies:
  - HttpOnly
  - Secure
  - SameSite=Lax
  - Host-only
- OAuth:
  - Validate state and nonce
  - Verify JWTs via JWKS
- Tokens:
  - Never exposed to browser JavaScript
  - Never stored outside Durable Object session

---

## Non-Goals

- No OAuth logic in SPA
- No tokens in localStorage
- No multi-tenant support
- No direct coupling to Google or Apple in downstream APIs

---

## Success Criteria

An implementation is correct if:
- It deploys cleanly to Cloudflare Pages
- Login works with Google and Apple
- AuthGenie issues and refreshes tokens
- Planner API calls succeed using first‑party tokens
- The SPA remains completely auth‑agnostic

---

**End of specification.**
