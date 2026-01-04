# Trip Roster Widget (Going / Not Going Tables) (Cloudflare Pages + Worker) — Development Plan

## Goal

Provide a **static-friendly widget** that a static-site developer can drop into any HTML page to render **two tables** for a *specific* trip:

1. **Going** — members who RSVP’d “YES”
2. **Not Going** — members who RSVP’d “NO”

Requirements:

- Renders into a `<div>` placeholder element.
- The trip is specified by:
  - a `tripId` HTML attribute, OR
  - a query-string parameter (e.g. `?tripId=...`)
- Only renders roster data if the user is **signed in**.
  - If not signed in, show a one-row message: “Sign In to see roster” (in both tables or a single combined message—see below).
- Emits **stable CSS classes** on elements so the static-site developer can style via CSS.
- Uses the BFF (Cloudflare Worker) at same origin under `/api/*`.
- Shows only relevant membership lists for the target trip and remains consistent with server authorization rules.

Canonical deployment:

- Static site on Cloudflare Pages: `https://overlandeastbay.com`
- BFF (Cloudflare Worker): same origin under `/api/*`
- Widget script served by Pages: `/assets/ebo-trip-roster-widget.js`

---

## Non-Goals (for v1)

- No editing capability (view-only roster)
- No unauthenticated visibility (members-only site)
- No exporting or printing features
- No real-time updates (refresh on load; optional refresh button can be added later)

---

## High-Level Architecture

### Cloudflare Pages (static)
- Hosts the JS widget file and the static HTML pages.

### Cloudflare Worker (BFF)
- Hosts session endpoint `/api/session`
- Proxies/aggregates calls to the scheduling service
- Enforces authentication and uses server-side access token(s)

### Browser
- Holds only an **HTTP-only session cookie**.
- Makes `fetch()` calls to `/api/*` with `credentials: "include"`.

---

## Static-Site Integration Spec

### Minimal drop-in snippet (tripId comes from query string)

```html
<div
  data-ebo-trip-roster
  data-trip-id-from="query"
  data-trip-id-param="tripId"
></div>

<script defer src="/assets/ebo-trip-roster-widget.js"></script>
```

### Alternative: explicit tripId in markup

```html
<div
  data-ebo-trip-roster
  data-trip-id="t_123"
></div>

<script defer src="/assets/ebo-trip-roster-widget.js"></script>
```

Optional attributes:

- `data-going-title="Going"` — heading text override
- `data-not-going-title="Not Going"` — heading text override
- `data-empty-going="No one has RSVP’d Going yet"` — empty-state message
- `data-empty-not-going="No one has RSVP’d Not Going yet"` — empty-state message

---

## Rendered DOM Contract (CSS Classes)

The widget renders a container with two sections, each containing a table.

### Container
- `.ebo-roster`
- `.ebo-roster-section`
- `.ebo-roster-title`

### Tables
- `.ebo-roster-table`
- `.ebo-roster-head`
- `.ebo-roster-body`
- `.ebo-roster-row`
- `.ebo-roster-cell`

### “Going” / “Not Going” modifiers
- `.ebo-roster-section--going`
- `.ebo-roster-section--not-going`
- `.ebo-roster-table--going`
- `.ebo-roster-table--not-going`

### Message / empty states
- `.ebo-roster-row--message`
- `.ebo-roster-cell--message`
- `.ebo-roster-row--empty`
- `.ebo-roster-cell--empty`

### Suggested columns
Keep columns simple and stable. For v1, recommend:

1. Member name (required)
2. Vehicle / rig name (optional if available)
3. Notes (optional)

Because you may not have vehicle details in the member profile yet, the widget should tolerate missing values and render only columns you support.

**Recommended v1 columns**
- Member (display name)
- (Optional) Home area / region (if in profile)
- (Optional) “Last updated” (not necessary)

If only the member display name is guaranteed, make it a 1-column table and keep class hooks for future expansion.

---

## Data & API Design

### Preferred source: Scheduling API RSVP Summary
Your scheduling service already has a use case and endpoint concept for an RSVP summary (attending + not attending).

**Worker should expose (recommended)**:
- `GET /api/widgets/trip-roster?tripId=<id>`

Response:

```json
{
  "tripId": "t_123",
  "going": [
    { "memberId": "m1", "displayName": "Alice", "avatarUrl": null }
  ],
  "notGoing": [
    { "memberId": "m2", "displayName": "Bob", "avatarUrl": null }
  ]
}
```

Notes:
- The Worker can source this from the scheduling API’s RSVP summary endpoint if available:
  - e.g. `GET /trips/{tripId}/rsvps` (summary)
- If the scheduler summary returns IDs only, the Worker may need to enrich names from the member service (if separate) or include the names directly in the scheduler response.
- For v1 simplicity, include `displayName` in the summary response so the widget does not need additional lookups.

### Authentication behavior
- If not authenticated:
  - `/api/session` returns `{ authenticated: false }`
  - `/api/widgets/trip-roster` returns `401`

Widget should:
- call `/api/session` first
- if signed out: render message state without calling roster endpoint
- if signed in: call roster endpoint

### Caching
Because roster is per trip and membership changes occasionally:
- `Cache-Control: no-store` is safest for v1.
- You can add `ETag` later if needed.

---

## Widget Behavior

### Load sequence
1. Determine `tripId`:
   - If `data-trip-id` provided → use it
   - Else if `data-trip-id-from="query"` → read from URLSearchParams using `data-trip-id-param` (default `tripId`)
   - If missing → render error message (see below)
2. `GET /api/session`
   - If not authenticated → render message state
3. `GET /api/widgets/trip-roster?tripId=...`
4. Render two tables:
   - Going table
   - Not Going table

### Error / missing tripId behavior
If tripId cannot be resolved:
- Render a simple message block within the widget container:
  - “Trip not specified”
- CSS classes:
  - `.ebo-roster-error`
  - `.ebo-roster-error-message`

### Empty roster behavior
If a list is empty, render a 1-row “empty” message inside that table’s body.

Example:
- Going list empty → “No one has RSVP’d Going yet”
- Not Going list empty → “No one has RSVP’d Not Going yet”

---

## Implementation Plan

### Phase 0 — Worker route wiring
1. Ensure Worker handles `/api/*` routes.
2. Confirm `/api/session` exists and is used by other widgets.

**Acceptance**
- `/api/session` returns `{ authenticated: false }` when signed out.

### Phase 1 — Worker roster endpoint
1. Add `GET /api/widgets/trip-roster?tripId=...`
2. Require authentication; return `401` if no session.
3. Validate `tripId`:
   - required, non-empty, reasonable charset
4. Fetch RSVP summary from scheduling API:
   - `GET /trips/{tripId}/rsvps` (or equivalent)
5. Shape response to include:
   - `going[]`, `notGoing[]` with `memberId` + `displayName` at minimum

**Acceptance**
- Signed in returns roster JSON
- Signed out returns 401
- Invalid tripId returns 400

### Phase 2 — Pages widget JS
1. Add `/public/assets/ebo-trip-roster-widget.js`
2. Implement:
   - query selector for `[data-ebo-trip-roster]`
   - tripId resolution logic (attribute vs query string)
   - `fetch("/api/session")`
   - signed-out rendering
   - `fetch("/api/widgets/trip-roster?tripId=...")`
   - DOM rendering for two tables with CSS classes
   - empty/error states

**Acceptance**
- Drop-in snippet renders both tables for a known trip.

### Phase 3 — Styling contract stabilization
1. Document CSS classes (this doc) for your teammate.
2. Add semantic structure without hardcoded styling.
3. Optional: add `data-*` hooks for custom labels/messages.

**Acceptance**
- Static-site dev can style tables without touching JS.

### Phase 4 — Enhancements (optional)
- Add a “Refresh” button
- Add counts in headings:
  - “Going (12)”
  - “Not Going (3)”
- Add optional avatar rendering if you later support `avatarUrl`
- Add collapsible sections for mobile

---

## Testing Scenarios

### Signed out
- Place widget on a page with a valid tripId in query string.
- Verify it renders message state:
  - “Sign In to see roster”
- Ensure it does not call roster endpoint (optional instrumentation).

### Signed in
- Verify both tables render.
- Verify member names show correctly.
- Verify empty states when one list is empty.
- Verify it’s stable across refresh.

### Missing tripId
- Visit page without tripId param and without `data-trip-id`.
- Verify “Trip not specified” message.

### Authorization failures
- Force session expiration.
- Widget should fall back to signed-out message (after session check).

---

## Deliverables

### Cloudflare Pages
- `/public/assets/ebo-trip-roster-widget.js`
- Example snippets for:
  - tripId from query string
  - explicit tripId attribute
- This CSS class contract

### Cloudflare Worker
- `GET /api/widgets/trip-roster?tripId=...`
- Uses scheduling API RSVP summary data
- Requires authentication
- Returns roster lists with display names

---

## Recommended Defaults (v1)

- Widget script URL: `/assets/ebo-trip-roster-widget.js`
- tripId source: query string param `tripId`
- Signed-out UI: one-row message per table *or* a single combined message block
  - **Recommendation:** render a single message block (simpler)
- Data source: Worker aggregation endpoint `/api/widgets/trip-roster`
- Cache: `Cache-Control: no-store`
- Member fields: `memberId`, `displayName` (minimum)

