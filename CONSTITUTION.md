# Constitution — Overland Trip Planning Web App

## 1. Purpose

This repository contains the **member-facing web application** for the
Overland Trip Planning system.

It exists to:

- Allow members to discover visible trips
- View trip details and logistics
- Submit and manage RSVPs
- Provide a simple, accessible UI for non-organizer workflows

This web app is not the primary planning tool.

## 2. Source of Truth

- API contract, domain language, and behavior are defined in the **spec repo**.
- This repo consumes a pinned spec version via `spec.lock`.

The web app must not rely on undocumented or unspecified service behavior.

**We practice spec-first development.** All requirements changes — new features, changes to behavior defined by a use case, and API contract changes — **must originate in the spec repo**. This repo may only implement/consume those changes after updating `spec.lock`.

## 3. Scope

### 3.1 Allowed content

- UI components and pages
- Client-side routing and state management
- API client code generated from OpenAPI
- Authentication and session management
- Accessibility, performance, and UX concerns

### 3.2 Disallowed content

- Service implementation logic
- API contract definitions
- Organizer-only workflows (trip drafting, publishing, canceling)
- Business rules not defined in the spec

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
  - API interactions are generated from OpenAPI
- **Read-optimized**
  - Emphasize fast rendering and caching
- **Minimal client-side business logic**
  - The service enforces truth
  - The UI reflects state, not invents it
- **Accessible by default**
  - Keyboard navigation
  - Screen reader compatibility
  - Mobile-friendly layouts

## 6. Contract compliance

### 6.1 Spec pinning

- `spec.lock` defines the exact spec version this web app targets.
- Generated client code must be derived from that version only.

### 6.2 Error handling

- API errors must be surfaced faithfully
- Authorization failures must be explicit and user-friendly
- The UI must not assume success paths

## 7. Change workflow

1) Spec repo change (if behavior/contract changes)
2) Tag spec
3) Update `spec.lock`
4) Regenerate client
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

- Cursor agents SHOULD use the GitHub CLI (`gh`) to create PRs, set titles/descriptions, and enable auto-merge once checks pass.

## 8. Versioning & deployment

- Web app versioning is independent of spec and service.
- Each deployed version must declare which spec version it targets.
- Rollbacks must be supported without requiring API changes.

## 9. Testing philosophy

- **Component tests** for UI behavior
- **Integration tests** for API interactions
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
