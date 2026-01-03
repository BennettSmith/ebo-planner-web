# Releasing (web app)

## Updating the changelog in PRs

- Add an entry to `CHANGELOG.md` under **`## [Unreleased]`**.
- Put it under the most appropriate section:
  - `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`
- Changelog entries are required when PRs change:
  - Pages/routes/navigation
  - API calls, request/response handling, client generation, fetch wrappers
  - Auth/session behavior (login/logout, token refresh, cookie/session handling)
  - RSVP flows and related UI states
  - Default filters/sorting/visibility rules
  - Accessibility/performance changes worth noting

## How this differs from spec/service/cli changelogs

- **Spec repo changelog**: contract & behavior (API + use-case requirements).
- **Service repo changelog**: runtime/deploy/migrations + which spec version is implemented.
- **CLI repo changelog**: end-user commands/flags/output/scripting impact.
- **Web app changelog (this repo)**: member-facing UX, pages/routes, auth/session behavior, and user-visible changes.

Reminder: externally visible behavior changes should be specified in the **spec repo first**.

## OpenAPI inputs & generated types

This repo vendors the published OpenAPI inputs under `openapi/`.

- If you update `openapi/*.yaml`, you **must** run `npm run gen` and commit the resulting changes under `functions/_generated/`.
- CI enforces that `functions/_generated/` is up to date with `openapi/`.

## Cutting a web release

1. Ensure `CHANGELOG.md` has entries under `## [Unreleased]`.
2. Ensure generated types are up to date (if `openapi/` changed):

```bash
npm run gen
```

3. Cut the release section (moves Unreleased entries into a dated version section):

```bash
make changelog-release VERSION=x.y.z
```

4. Commit the changelog update:

```bash
git add CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
```

5. Tag and push the release:

```bash
git tag vX.Y.Z
git push --tags
```

6. Deploy (per your environment’s deploy procedure).

## SemVer (very short)

- **MAJOR**: breaking UX changes or significant behavior changes
- **MINOR**: backwards-compatible features
- **PATCH**: backwards-compatible fixes


