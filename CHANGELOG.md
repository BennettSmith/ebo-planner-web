# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

This repository contains the member-facing web application for interacting with the Overland Trip Planning service.
The API contract and behavior are defined in the spec repository; this changelog focuses on user-visible web UX and deployment impact.

The OpenAPI inputs this web app consumes are vendored under `openapi/`; generated TypeScript types live under `functions/_generated/`.

Notes:

- Spec changelog = contract & behavior
- Web changelog = UX, pages, auth/session behavior, and any user-facing changes

## [Unreleased]

### Added
- SPA build pipeline (`src/spa` → `public/app.js`) with hash routing and an Upcoming Trips page (RSVP UI).
- BFF page-model endpoints under `/api/pages/upcoming-trips` that compose Planner API calls and return a single JSON model.
- Shared Zod contract module (`src/shared/contracts`) used by both BFF and SPA to validate/parse page-model JSON.
- Static-friendly widgets (no SPA required):
  - Auth status widget asset at `/assets/ebo-auth-widget.js` (Sign In / Sign Out).
  - Trip RSVP widget asset at `/assets/ebo-trip-rsvp-widget.js` (requires a trip id).
- Widget/BFF endpoints to support static pages:
  - `GET /api/session` for auth status checks (`Cache-Control: no-store`).
  - `GET/PUT /api/widgets/my-rsvp?tripId=...` for reading/updating the current user’s RSVP.
- Auth chooser page at `GET /auth/signin?returnTo=...` to support static pages and safe redirects.

### Changed
- Refactored Worker/BFF code layout (router under `src/worker`, shared Worker libs under `src/worker/lib`).
- OAuth callbacks now redirect to a validated `returnTo` path when provided during login.
- `public/index.html` now demonstrates the static-friendly auth + RSVP widgets (uses a placeholder trip id).

### Deprecated

### Removed

### Fixed

### Security


