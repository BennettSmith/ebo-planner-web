# ebo-planner-web

Member-facing web app for East Bay Overland. This repo is a **same-origin SPA + BFF** deployed on **Cloudflare Pages**.

- **SPA**: static assets under `public/`
- **BFF**: advanced-mode router at `_worker.ts` (bundled to `public/_worker.js`)
- **No tokens in the browser**: auth state is **HttpOnly cookies** only (tokens stay server-side in Durable Object sessions)

## Source layout (recommended)

- **SPA source**: `src/spa/` → bundled to `public/app.js`
- **Shared contracts**: `src/shared/contracts/`
  - Zod schemas + inferred TypeScript types
  - Imported by both BFF and SPA to share the JSON contract safely
- **BFF source (router shim)**:
  - Root `_worker.ts` is a tiny shim required by `wrangler.toml` and the Pages Advanced Mode contract
  - Implementation lives at `src/worker/worker.ts` (router implementation)

## Local development (Wrangler)

### Dev quickstart

```bash
cd /Users/bsmith/Developer/eastbay-overland/ebo-planner-web
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Then open: `http://localhost:8788`

### Prerequisites

- Node + npm

### Setup

1. Install deps:

```bash
cd /Users/bsmith/Developer/eastbay-overland/ebo-planner-web
npm install
```

1. Create local env vars file:

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` with real values (Google/Apple/AuthGenie/Planner).

1. Generate OpenAPI-derived TypeScript types (from `openapi/`):

```bash
npm run gen
```

#### Keeping generated types up to date (required)

If you update either OpenAPI file under `openapi/`, you **must** regenerate and commit the generated TypeScript types:

```bash
npm run gen
```

CI enforces this: `make ci` will fail if `functions/_generated/*` is out of date with `openapi/*.yaml`.

### Run locally

```bash
npm run dev
```

- **App URL**: `http://localhost:8788`
- This runs `wrangler pages dev ./public` and serves the worker from `public/_worker.js`.

### Development workflow (what updates in the browser)

#### Editing SPA/static assets (`public/`)

- **Files**: `public/index.html`, images, CSS, etc.
- **How to see changes**: refresh the browser page.
- Wrangler may live-reload some assets depending on settings, but a manual refresh is always enough.

#### Editing SPA source (`src/spa/**` and `src/shared/**`)

- **Files**: `src/spa/**`, `src/shared/**`
- **Build output**: bundled to `public/app.js`
- **How to see changes**:
  - Re-run `npm run build:spa` (quick) while `npm run dev` is running, then refresh; or
  - Stop/restart `npm run dev` (it always rebuilds worker + SPA on startup).

#### Editing BFF code (`_worker.ts` and `functions/**`)

- **Files**: `_worker.ts`, `functions/**` (auth, api handlers, session logic).
- `_worker.ts` is bundled into `public/_worker.js` by `npm run build:worker`.
- **How to see changes**:
  - Either re-run `npm run build:worker` (quick) while `npm run dev` is running, then refresh the browser; or
  - Stop/restart `npm run dev` (it always rebuilds the worker on startup).

#### Editing OpenAPI inputs (`openapi/*.yaml`)

- **Files**: `openapi/authgenie-openapi.yaml`, `openapi/planner-openapi.yaml`
- **After updating YAMLs**: run `npm run gen` and commit `functions/_generated/*` (CI enforces this).

#### Tight TDD loop

- Run tests in watch mode:

```bash
npm run test:watch
```

### Notes on provider login locally

- OAuth redirect URIs must match what you configure in Google/Apple.
- Apple commonly requires HTTPS redirect URIs; local testing may require a tunnel and setting `BASE_URL` accordingly.

## Build

```bash
npm run build
```

This typechecks and bundles `_worker.ts` → `public/_worker.js` (Pages advanced-mode requirement).

## Cloudflare Pages settings (recommended)

- **Build command**: `npm run build`
- **Build output directory**: `public`

## Deployment & provider setup (Cloudflare + Google + Apple)

This repo is a **same-origin SPA + BFF**. The browser only talks to this site’s origin, and the BFF owns all token handling.

### Cloudflare Pages

#### Create the Pages project

- **Connect repo**: `ebo-planner-web`
- **Build command**: `npm run build`
- **Build output directory**: `public`
- **Functions**: advanced mode via `public/_worker.js` (built from `_worker.ts`)

#### Bindings

- **Durable Objects**: ensure the DO binding exists (defined in `wrangler.toml`)
  - Binding name: `SESSIONS`
  - Class name: `SessionsDO`

#### Environment variables / secrets

Set these in Cloudflare Pages project settings (use Secrets where appropriate):

- **Common**
  - `BASE_URL`
    - Production example: `https://eastbayoverland.com`
    - Preview example: `https://preview.eastbayoverland.com`
  - `SESSION_COOKIE_NAME` (e.g. `bff_session`)
- **Google**
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- **Apple**
  - `APPLE_CLIENT_ID`
  - `APPLE_TEAM_ID`
  - `APPLE_KEY_ID`
  - `APPLE_PRIVATE_KEY_P8`
- **AuthGenie**
  - `AUTHGENIE_BASE_URL`
  - `AUTHGENIE_CLIENT_ID`
  - `AUTHGENIE_CLIENT_SECRET`
  - `AUTHGENIE_AUDIENCE` (default: `eastbayoverland:scheduling`)
- **Planner API**
  - `PLANNER_BASE_URL`

#### Domains

- **Apex**: serve the app from `https://eastbayoverland.com`
- **Redirect**: configure `www.eastbayoverland.com` to 301 redirect to the apex at the Cloudflare edge (per `ARCHITECTURE_SPA_BFF.md`)
- **Preview hostname (recommended)**:
  - Create a stable preview hostname: `https://preview.eastbayoverland.com` and point it at the Pages project preview environment.
  - This lets you register OAuth redirect URIs once and keep preview login working consistently.

### Google (OIDC)

Create an OAuth 2.0 / OIDC client in Google Cloud Console:

- **Application type**: Web application
- **Authorized JavaScript origins**:
  - `https://eastbayoverland.com`
  - `https://preview.eastbayoverland.com`
- **Authorized redirect URIs**:
  - `https://eastbayoverland.com/auth/google/callback`
  - `https://preview.eastbayoverland.com/auth/google/callback`

Then set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Apple (Sign in with Apple, OIDC `form_post`)

In Apple Developer:

1) Create an **App ID / Services ID** for Sign in with Apple.
2) Enable **Sign in with Apple**.
3) Configure **Return URLs** to include:
   - `https://eastbayoverland.com/auth/apple/callback`
   - `https://preview.eastbayoverland.com/auth/apple/callback`
4) Create a key for Sign in with Apple and download the `.p8` private key.

Then set:

- `APPLE_CLIENT_ID` (Services ID)
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY_P8` (full PEM contents of the `.p8` key)

Note: Apple uses `response_mode=form_post`, so the callback is `POST /auth/apple/callback` (per `ARCHITECTURE_SPA_BFF.md`).

### AuthGenie + Planner API

You’ll need:

- An AuthGenie OAuth client (client id/secret) authorized for the configured audience.
- A reachable Planner API base URL and authorization configured so AuthGenie-issued access tokens are accepted.

This BFF exchanges provider ID tokens via AuthGenie `POST /v1/oauth/token` (token-exchange grant) and refreshes via the refresh_token grant.

#### Recommended environment split (Preview vs Production)

- **Production**
  - `AUTHGENIE_BASE_URL` → production AuthGenie
  - `PLANNER_BASE_URL` → production Planner API
  - `AUTHGENIE_CLIENT_ID`/`AUTHGENIE_CLIENT_SECRET` → production client
- **Preview**
  - `AUTHGENIE_BASE_URL` → preview/staging AuthGenie
  - `PLANNER_BASE_URL` → preview/staging Planner API
  - `AUTHGENIE_CLIENT_ID`/`AUTHGENIE_CLIENT_SECRET` → preview/staging client

This keeps preview sign-ins and API calls isolated from production while still exercising the full login/session/token-refresh behavior end-to-end.

## CI

```bash
make ci
```

## Testing

- Unit tests + coverage gate: `npm test`
- Watch mode for TDD: `npm run test:watch`

More detail: `tests/README.md`

## Changelog & releases

- **For PRs**: update `CHANGELOG.md` under **`## [Unreleased]`** with a short note for user-visible web changes (pages/routes/auth/session/RSVP flows/API UX).
- **OpenAPI inputs**: if you update `openapi/*.yaml`, run `npm run gen` and commit `functions/_generated/*` (CI enforces this).
- **To cut a release**: run `make changelog-release VERSION=x.y.z`, commit `CHANGELOG.md`, tag `vX.Y.Z`, and push the tag.

More details: `docs/releasing.md`
