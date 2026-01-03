# Constitution — Overland Trip Planning Web App

## 1. Purpose

This repository contains the **member-facing web application** for the
Overland Trip Planning system.

It is built as a **Single Page Application (SPA)** with a **Backend-for-Frontend (BFF)**:

- The **SPA** runs in the browser and renders the UI.
- The **BFF** runs on **Cloudflare Pages Functions (Advanced Mode)** and is the browser’s only backend.

It exists to:

- Allow members to discover visible trips
- View trip details and logistics
- Submit and manage RSVPs
- Provide a simple, accessible UI for non-organizer workflows

This web app is not the primary planning tool.

## 2. Source of Truth

- **Product behavior, domain language, and API contracts** are defined in the **spec repo**.
- **Web hosting + SPA/BFF architecture decisions** are defined in `ARCHITECTURE_SPA_BFF.md`.

The web app must not rely on undocumented or unspecified service behavior.

**We practice spec-first development.** All requirements changes — new features, changes to behavior defined by a use case, and API contract changes — **must originate in the spec repo**. This repo consumes vendored OpenAPI inputs under `openapi/` and generated types under `functions/_generated/`.

## 3. Scope

### 3.1 Allowed content

- UI components and pages
- Client-side routing and state management
- BFF routes and handlers (`/auth/*`, `/api/*`) implemented as Cloudflare Pages Functions
  - Routing is owned by `_worker.ts` (single entrypoint)
  - Route handlers live in modules (e.g. `functions/auth/*`, `functions/api/*`)
- Authentication and session management **in the BFF**
- OpenAPI-derived TypeScript **types** used for request/response validation and safety
- Accessibility, performance, and UX concerns

### 3.2 Disallowed content

- Planner service implementation logic
- API contract definitions or behavior changes outside the spec repo
- Organizer-only workflows (trip drafting, publishing, canceling)
- Business rules not defined in the spec
- OAuth flows, token storage, or refresh logic in the SPA
- Exposing access/refresh tokens to browser JavaScript (no localStorage/sessionStorage tokens)
- Direct browser-to-Planner-API or browser-to-AuthGenie calls (the browser talks to the BFF only)

## 4. Product boundaries

### 4.1 Supported member workflows

- List visible trips (published + public drafts)
- View trip details
- View organizers and attendees
- Submit, update, or clear RSVP
- View RSVP summary when permitted by the spec

### 4.2 Explicitly out of scope

- Trip creation or editing
- Organizer management
- Trip publishing or cancellation
- Administrative/member-management tooling

If a feature begins to resemble “planning,” it likely belongs in the CLI.

## 5. Architectural principles

- **Spec-first client**
  - API shapes are derived from OpenAPI (via pinned spec)
- **Read-optimized**
  - Emphasize fast rendering and caching
- **Same-origin SPA + BFF**
  - No CORS (browser talks to same-origin BFF endpoints)
- **Minimal client-side business logic**
  - The service enforces truth
  - The UI reflects state, not invents it
- **BFF owns authentication**
  - OAuth never runs in the SPA
  - The SPA never sees tokens
  - Auth state is represented via **HttpOnly cookies** only
- **Server-side sessions**
  - Session ID stored in an HttpOnly cookie
  - Session data stored server-side (per `ARCHITECTURE_SPA_BFF.md`)
- **Accessible by default**
  - Keyboard navigation
  - Screen reader compatibility
  - Mobile-friendly layouts

## 6. Contract compliance

### 6.1 Spec pinning

- OpenAPI inputs are vendored under `openapi/`.
- Generated types under `functions/_generated/` must be kept in sync with the vendored OpenAPI inputs.

### 6.2 Error handling

- API errors must be surfaced faithfully
- Authorization failures must be explicit and user-friendly
- The UI must not assume success paths
- The SPA must treat authentication as an opaque state (logged-in vs logged-out), not as token possession.

## 7. Change workflow

1) Spec repo change (if behavior/contract changes)
2) Tag spec
3) Update vendored OpenAPI files under `openapi/`
4) Regenerate OpenAPI-derived types (when applicable)
5) Update UI

UI-only improvements (layout, styling, copy) may skip step (1).

If a UI feature would require a new endpoint, a changed request/response shape, new validation rules, or any new/changed use-case behavior, step (1) is mandatory.

## 7.1 Development workflow (mandatory)

### 7.1.1 Branches only

- All work MUST happen on a branch (no direct commits to `main`).
- Branch names MUST be: `{type}/{slug}`
  - `{type}` MUST be one of: `chore`, `bug`, `refactor`, `feature`
  - `{slug}` MUST be a short, lowercase, hyphenated description
  - Examples:
    - `feature/trip-list-page`
    - `bug/rsvp-form-validation`
    - `refactor/api-client-hooks`
    - `chore/ci-target-wiring`

### 7.1.2 Pre-flight before PR

- Before creating or updating a PR, you MUST run `make ci` locally and it MUST pass.

### 7.1.3 Pull requests required

- Every change MUST be delivered via a pull request.
- CI must be green before merge (required checks).

### 7.1.4 Automation via `gh`

- Cursor agents SHOULD use the GitHub CLI (`gh`) to create PRs and set titles/descriptions.
- Cursor agents MUST enable auto-merge using **squash** for routine changes (so PRs merge automatically once required checks/reviews are satisfied).

Example:

```bash
gh pr create --fill
gh pr merge --auto --squash
```

## 8. Versioning & deployment

- Web app versioning is independent of spec and service.
- Each deployed version must declare which spec version it targets.
- Rollbacks must be supported without requiring API changes.
- Deployment target is **Cloudflare Pages** (SPA) + **Pages Functions** (BFF).

## 9. Testing philosophy

- **Component tests** for UI behavior
- **Integration tests** for BFF `/api/*` behavior and error mapping
- **Accessibility tests** for critical flows
- **End-to-end tests** for:
  - Trip listing
  - Trip detail viewing
  - RSVP submission

Acceptance scenarios from the spec repo are encouraged as test inputs.

## 10. UX guarantees

- Read-only access must work even under partial service degradation
- RSVP actions must provide immediate feedback
- The UI must remain usable on low-bandwidth connections

## 11. Non-goals

- This repo is not a planning tool.
- This repo does not define product behavior.
- This repo is not a replacement for the CLI.
- This repo does not implement OAuth in the browser.
