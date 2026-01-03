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

### Changed
- Refactored Worker/BFF code layout (router under `src/worker`, shared Worker libs under `src/worker/lib`).

### Deprecated

### Removed
- Removed multi-page HTML approach in favor of single-entry SPA shell (`index.html` + hash routing).

### Fixed

### Security


