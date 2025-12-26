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

## Spec pinning policy (`spec.lock`)

This repo must pin the spec version the web app targets in `spec.lock` (a spec git tag like `v1.2.3`).

- Update `spec.lock` when adopting a new spec version.
- Each web release must include a changelog line: `- Targets spec \`vX.Y.Z\`` (the release script will ensure this).

## Cutting a web release

1. Update `spec.lock` to the spec tag targeted (for example: `v1.2.3`).
2. Ensure `CHANGELOG.md` has entries under `## [Unreleased]`.
3. Cut the release section (moves Unreleased entries into a dated version section and ensures it includes the pinned spec version):

```bash
make changelog-release VERSION=x.y.z
```

4. Commit the changelog update (and `spec.lock` if it changed):

```bash
git add CHANGELOG.md spec.lock
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


