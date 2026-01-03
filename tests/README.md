# Testing in `ebo-planner-web`

This repo is a **Cloudflare Pages** app with:

- **SPA** static assets in `public/`
- **BFF** implemented as a single advanced-mode worker router (`_worker.ts` → bundled to `public/_worker.js`)
- **No tokens in the browser** (auth is HttpOnly-cookie + server-side session via Durable Objects)

## Testing pyramid (recommended)

### 1) Unit tests (default, fast, TDD-friendly)

**Goal**: cover *branching logic* and edge cases in pure TypeScript modules without needing real network calls.

- **What to test**
  - `src/worker/lib/*` helpers (cookie parsing/serialization, env validation, request/response helpers)
  - session behavior (DO wrapper logic) using **in-memory stubs**
  - token refresh logic (`ensureAccessToken`) using **mocked AuthGenie client**
  - router behavior in `_worker.ts` (route/method → handler selection)
  - BFF endpoints (e.g. `/api/members/me`) using mocked `fetch` + mocked `ensureAccessToken`

- **What to mock**
  - `fetch` for upstream calls (Google/Apple/AuthGenie/Planner)
  - `jose` verification/signing for provider tokens (unit tests should validate our *control flow*, not cryptography)
  - Durable Object stubs/state (in-memory)

- **Commands**

```bash
npm test
```

```bash
npm run test:watch
```

- **Coverage gate**
  - Global threshold is **85%** (lines/statements/functions/branches).
  - This is enforced in `make ci` via `npm test`.

### 2) Local integration tests (next step as the repo grows)

**Goal**: validate multiple modules wired together under a Worker-like runtime without talking to real external services.

Typical additions (not required yet, but recommended soon):

- Start `wrangler pages dev` (or Miniflare) and run HTTP-level tests against:
  - `/auth/*` routes (using a fake provider response)
  - `/api/*` routes with mocked upstreams
- Use a local HTTP stub server for:
  - AuthGenie `/v1/oauth/token`
  - Planner `/members/me`

This gives higher confidence that headers/cookies/status codes are correct end-to-end.

### 3) E2E / smoke tests (small number)

**Goal**: validate the “happy path” for real systems when you have real credentials/config.

Because Google/Apple login is interactive and often requires HTTPS redirect URIs, fully automated E2E can be expensive.
Pragmatic approach:

- Keep **unit tests** comprehensive and strict.
- Run a **small manual smoke checklist** on real environments when changing auth/session behavior.

Suggested manual smoke sequence:
1) `npm run dev` (or deploy preview)
2) Login with Google → redirected to `/` → call `GET /api/members/me` and confirm 200
3) Login with Apple (form_post) → same verification
4) Expire access token in session storage (or wait) → confirm refresh happens on `/api/members/me`
5) `POST /auth/logout` → confirm session cleared and cookie removed

## TDD tips for this repo

- Add tests **before** changing handler logic; mock `fetch` and verify:
  - correct upstream URL
  - correct method + headers (`Authorization: Bearer ...`, content types)
  - correct cookie behavior (`Set-Cookie` present when session is created/rotated)
- Prefer testing the handler function (`functions/...`) directly over bundling `_worker.ts` unless you specifically want routing coverage.


