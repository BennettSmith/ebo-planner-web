# Static-Friendly Auth Widget on Cloudflare (Pages + Worker) — Development Plan

## Goal

Enable a **static-site developer** to drop a simple placeholder element into any HTML page and get an **auth status control** that renders:

1. **Signed out** → shows **Sign In** button (redirects to a chooser page you control)
2. **Signed in** → shows **Sign Out** button (logs out, returns to same page)

All on the canonical domain:

- Static site: `https://overlandeastbay.com`
- BFF (Cloudflare Worker): same origin under `https://overlandeastbay.com/api/*`

The widget is a **static asset** served by Cloudflare Pages, while **all auth logic** is handled by the Worker.

---

## Non-Goals (for v1)

- No user profile UX inside the widget (only Sign In / Sign Out)
- No client-side token handling (no JWTs in localStorage)
- No framework requirement for the static site (plain HTML + one `<script>`)

---

## High-Level Architecture

### Cloudflare Pages (static site)
Hosts:
- HTML pages and styling
- The drop-in widget script at:  
  `GET /assets/ebo-auth-widget.js`

### Cloudflare Worker (BFF)
Hosts:
- Session + auth endpoints under `/api/*`
- OAuth login redirects and callbacks for Google and Apple
- Session cookie issuance and refresh (if needed later)

### Browser contract
- The browser only holds an **HTTP-only session cookie**.
- The widget calls `/api/session` to decide which button to render.
- “Sign In” redirects to your chooser page at `/api/auth/signin`.
- “Sign Out” POSTs to `/api/auth/logout`, then reloads the page.

---

## File/Route Layout

### Pages
```
/public
  /assets
    ebo-auth-widget.js
  index.html
  trips.html
  trip.html
```

### Worker routes (recommended)
- `GET  /api/session`
- `GET  /api/auth/signin`
- `GET  /api/auth/login/google?returnTo=...`
- `GET  /api/auth/login/apple?returnTo=...`
- `GET  /api/auth/callback/google`
- `POST /api/auth/callback/apple`  *(Apple commonly uses form_post)*
- `POST /api/auth/logout`

> Keep everything auth/session related under `/api` to avoid collisions with static paths.

---

## Static-Site Integration Spec

### Required HTML snippet
The static dev can place this anywhere:

```html
<span data-ebo-auth-status></span>
<script defer src="/assets/ebo-auth-widget.js"></script>
```

### Widget behavior
- On load, widget requests `GET /api/session` (`credentials: "include"`).
- If `authenticated: false` → render **Sign In** button.
- If `authenticated: true` → render **Sign Out** button.

#### Sign In
Clicking Sign In navigates to:

`/api/auth/signin?returnTo=<current page url>`

- The chooser page is **served by the Worker** and controlled by you.
- The chooser page presents:
  - “Sign in with Google”
  - “Sign in with Apple”

#### Sign Out
Clicking Sign Out:
1. `POST /api/auth/logout`
2. `window.location.reload()`
3. Widget re-renders as signed out

---

## Widget Implementation (Pages asset)

### `GET /assets/ebo-auth-widget.js`
A framework-free script that:
- Finds all `[data-ebo-auth-status]` elements
- Calls `/api/session`
- Renders the appropriate button
- Handles sign-in redirect and sign-out call

Implementation guidelines:
- Support multiple placeholders on one page.
- Use `cache: "no-store"` for the session check.
- Disable Sign Out button while request is in flight.
- Fail safe: if session check fails, treat as signed out.

---

## Worker API Contracts

### `GET /api/session`
Always return 200 with JSON:

```json
{ "authenticated": true }
```

or

```json
{ "authenticated": false }
```

Headers:
- `Cache-Control: no-store`
- `Content-Type: application/json; charset=utf-8`

### `POST /api/auth/logout`
- Clear session cookie with an expired cookie.
- Return 204 No Content (or 200).
- Use POST (not GET) to reduce drive-by logout via simple image tags.

### Session cookie
Recommended cookie attributes:

- `HttpOnly; Secure; SameSite=Lax`
- `Path=/` (simple; works for static pages + `/api/*`)

Cookie name suggestion: `ebo_session`

---

## Auth Chooser Page (Worker)

### `GET /api/auth/signin?returnTo=...`
- Renders an HTML page (simple, accessible, minimal dependencies).
- Extract and validate `returnTo` (see below).
- Buttons link to:
  - `/api/auth/login/google?returnTo=<validated>`
  - `/api/auth/login/apple?returnTo=<validated>`

**Important:** The callback should *not* trust a returnTo query param coming back from the provider. Store it server-side as part of the auth transaction state.

---

## Return URL Validation (Open Redirect Protection)

Because `returnTo` may be a full URL, validate that it points back to your canonical origin.

Rules:
- Parse as URL
- Only allow:
  - `origin === "https://overlandeastbay.com"`
- Else replace with safe default: `/` or `/trips.html`

Store only the **sanitized return path** (e.g. `/trip.html?tripId=abc`) in auth transaction state.

---

## OAuth Flow Responsibilities (Worker)

Yes: the Worker should handle **all provider callbacks**.

### Why callbacks must be Worker-owned
- Requires secrets (Apple private key / client secret)
- Must verify `state` (CSRF mitigation)
- Must exchange authorization code for tokens (server-to-server)
- Must validate ID token claims
- Must set an HttpOnly session cookie

---

## OAuth Transaction State Storage (Cloudflare Options)

During login you must store short-lived transaction state, typically:

- `returnTo` (sanitized)
- `state` (random)
- `pkce_verifier` (random)
- `nonce` (optional, recommended for ID token validation)
- timestamp / expiry

You have three viable Cloudflare storage patterns. Choose based on complexity and consistency needs.

### Option A (Recommended for v1): HttpOnly Transaction Cookie (Stateless-ish)
**Approach**
- On `/api/auth/login/{provider}` create an auth transaction object `{ returnTo, state, pkce_verifier, nonce, exp }`.
- Store it in a **short-lived HttpOnly cookie** (e.g. `ebo_oauth_txn`) that is:
  - signed (HMAC) to prevent tampering
  - optionally encrypted if you want to hide values from the client (not strictly required if HttpOnly)
- Redirect to provider with `state` and `code_challenge`.
- On callback, read cookie, verify signature, confirm `state` matches, and continue.

**Pros**
- No external state store
- No KV consistency concerns
- Very simple deployment footprint
- Scales fine for a small club site

**Cons**
- Cookie size constraints (but this payload is small)
- Requires careful signing/encryption implementation
- Must handle multiple concurrent login attempts (see note below)

**Concurrency note**
- If user starts two login flows in parallel, a single cookie can be overwritten.
  - Mitigation: store a *list* of transactions in the cookie (bounded), or
  - Store per-provider cookie, or
  - Include `state` as a key and keep only latest (acceptable for v1)

### Option B: Durable Object (Strong Consistency)
**Approach**
- Create a Durable Object that stores transactions keyed by `state` with TTL.
- `/login` stores the transaction in the DO, then redirects.
- `/callback` reads and deletes the transaction by `state`.

**Pros**
- Strong consistency (no read-after-write surprises)
- Clean “store then delete” transaction semantics
- Handles concurrency naturally

**Cons**
- More moving parts than Option A
- Slightly more ops/config and code

### Option C: Cloudflare KV (Eventual Consistency — Use with Caution)
**Approach**
- Store transactions in KV keyed by `state` with TTL.
- Read on callback.

**Pros**
- Simple API, globally distributed

**Cons**
- KV is eventually consistent; read-after-write may intermittently fail
- Not ideal for auth transactions where immediate read is required

**Recommendation**
- Prefer **Option A** for v1 simplicity.
- If you want the cleanest “server-side truth” with strong semantics, use **Option B (Durable Object)**.
- Avoid KV for the transaction state unless you accept rare failures and add retry/fallback logic.

---

## Provider-Specific Notes

### Google
Recommended flow:
- Authorization Code + PKCE
- Callback: `GET /api/auth/callback/google`

You must configure Google OAuth redirect URI:
- `https://overlandeastbay.com/api/auth/callback/google`

### Apple
Apple often uses `response_mode=form_post`.
- Callback: `POST /api/auth/callback/apple`

You must configure Apple redirect/callback:
- `https://overlandeastbay.com/api/auth/callback/apple`

Apple also typically requires a client secret generated as a JWT signed with your Apple private key.

---

## Security Checklist (v1)

- **Session cookie**: `HttpOnly; Secure; SameSite=Lax`
- **State verification** on every callback
- **PKCE** for Google (and Apple if applicable)
- **ReturnTo allowlist** (only `https://overlandeastbay.com`)
- **No-store** caching on `/api/session`
- **POST logout** endpoint
- **Token handling** stays server-side (no JWTs in browser storage)
- Validate ID token claims:
  - issuer (`iss`), audience (`aud`), expiry (`exp`), nonce if used
- Keep secrets in Worker environment variables / secrets (not in Pages)

---

## Development Plan (Phased)

### Phase 0 — Routing and deployment scaffolding
1. Configure Cloudflare Pages project for `overlandeastbay.com`.
2. Configure Worker (or Pages Functions if you prefer) routed to `/api/*`.
3. Verify requests to `/api/session` hit Worker while `/assets/*` hits Pages.

**Acceptance**
- `GET /assets/ebo-auth-widget.js` served by Pages
- `GET /api/session` served by Worker

### Phase 1 — Session + logout API
1. Implement `GET /api/session` returning `{ authenticated: false }` by default.
2. Implement `POST /api/auth/logout` clearing cookie.
3. Add cookie parsing utilities and response helpers.

**Acceptance**
- Widget renders Sign In (always signed out).
- Sign Out is harmless (still ends signed out).

### Phase 2 — Widget asset
1. Add `/public/assets/ebo-auth-widget.js` to Pages.
2. Implement DOM rendering + click handlers.
3. Document the one-line integration snippet for the static dev.

**Acceptance**
- Dropping `<span data-ebo-auth-status></span>` shows Sign In.
- Clicking Sign In goes to `/api/auth/signin?returnTo=...`

### Phase 3 — Auth chooser page
1. Implement `GET /api/auth/signin` to render HTML.
2. Implement returnTo validation and safe default behavior.
3. Add buttons linking to provider login endpoints.

**Acceptance**
- Chooser page renders correctly.
- Clicking Google/Apple buttons routes to `/api/auth/login/...`

### Phase 4 — OAuth transaction storage (choose A or B)
**Option A (cookie-based) implementation tasks**
1. Implement signed (and optionally encrypted) auth transaction cookie `ebo_oauth_txn`.
2. Implement transaction creation in `/api/auth/login/*`.
3. Implement transaction validation in callbacks.
4. Implement transaction cleanup (expire cookie) on success/failure.

**Option B (Durable Object) implementation tasks**
1. Define DO class to store `{ state -> txn }` with TTL.
2. Store txn on `/login`, read+delete on `/callback`.

**Acceptance**
- Callback can retrieve returnTo + pkce verifier + nonce reliably.

### Phase 5 — Provider implementations
1. Google:
   - build authorize URL (PKCE challenge, state)
   - code exchange
   - ID token validation
2. Apple:
   - build authorize URL
   - handle POST callback (`form_post`)
   - generate Apple client secret JWT
   - code exchange
   - ID token validation (if returned)

**Acceptance**
- Successful login sets `ebo_session` and redirects to original page.

### Phase 6 — End-to-end UX polish
1. Widget shows Sign Out when authenticated.
2. Clicking Sign Out clears session and reloads same page.
3. Add basic loading/disabled states and failure fallbacks.
4. Add minimal styling hooks (CSS classes on buttons) so static dev can style.

**Acceptance**
- On any static page:
  - signed out → Sign In
  - signed in → Sign Out
  - logout returns to same URL

---

## Testing & Acceptance Scenarios

### Manual smoke tests
- Visit `https://overlandeastbay.com/trips.html`
  - see Sign In
- Click Sign In
  - land on `/api/auth/signin`
- Choose Google or Apple
  - complete provider flow
  - return to `trips.html`
  - see Sign Out
- Click Sign Out
  - stay on `trips.html`
  - see Sign In

### Negative tests
- Tamper with `returnTo` to an external domain → should redirect to safe default.
- Replay callback `state` → should fail gracefully (no session created).
- Expired transaction (older than TTL) → show an error and offer “try again” link to chooser.

---

## Implementation Notes (Cloudflare)

- Prefer Worker Secrets for provider credentials:
  - Google client id/secret (as applicable), Apple key id/team id/private key, etc.
- Consider HSTS / Always Use HTTPS:
  - normalize returnTo to https
- Keep auth pages lightweight:
  - no external JS dependencies needed
- Keep widget file stable:
  - version it to avoid caching surprises (e.g. `ebo-auth-widget.v1.js`)

---

## Deliverables

1. **Pages**
   - `/public/assets/ebo-auth-widget.js`
   - Documentation snippet for static dev

2. **Worker**
   - `/api/session`
   - `/api/auth/signin`
   - `/api/auth/login/google`, `/api/auth/login/apple`
   - `/api/auth/callback/google`, `/api/auth/callback/apple`
   - `/api/auth/logout`
   - Transaction storage implementation (Option A or B)
   - Session cookie issuance

---

## Recommended Defaults

- Transaction storage: **Option A (HttpOnly signed cookie)** for v1 simplicity
- Session cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`
- returnTo allowlist: **only** `https://overlandeastbay.com`
- Widget served by Pages at `/assets/ebo-auth-widget.js`
- Worker owns all `/api/auth/*` endpoints including callbacks

