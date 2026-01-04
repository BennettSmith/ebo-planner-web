# Upcoming Trips Table Widget (Cloudflare Pages + Worker) — Development Plan

## Goal

Provide a **static-friendly widget** that the static-site developer can drop into any HTML page to render a **table of upcoming, published trips**, in chronological order.

Requirements:

- Renders inside a `<div>` placeholder.
- Shows **only PUBLISHED** trips.
- Sorts trips **chronologically** (by `startDate`, then `endDate`, then `name`).
- **Requires sign-in**:
  - If **not signed in**, render a single table row: “Sign In to see schedule of upcoming events”.
- Each trip row shows the user’s RSVP state:
  - If RSVP is YES → show **“Going”**
  - If RSVP is NO → show **“Not Going”**
  - If no RSVP → show an **“RSVP”** button (which links to the trip details page or triggers RSVP flow—see below)
- Table must emit **CSS classes** so the static-site developer can style it.
- Paging is desired (nice-to-have).

Canonical deployment:

- Static site on Cloudflare Pages: `https://overlandeastbay.com`
- BFF (Cloudflare Worker): same origin, under `/api/*`
- Widget script served by Pages: `/assets/ebo-trips-table-widget.js`

---

## Static-Site Integration Spec

### Required HTML snippet

```html
<div
  data-ebo-upcoming-trips-table
  data-trip-details-href="/trip.html?tripId={tripId}"
  data-page-size="10"
></div>

<script defer src="/assets/ebo-trips-table-widget.js"></script>
```

Attributes:

- `data-ebo-upcoming-trips-table` — marker for the widget
- `data-trip-details-href` — template for the trip details link (optional)
  - `{tripId}` will be replaced with the trip id
- `data-page-size` — optional page size (defaults to 10)

---

## Rendered DOM Contract (with CSS classes)

The widget renders a `<table>` inside the target div.

### Signed out
Renders a one-row table message:

- `.ebo-trips-table`
- `.ebo-trips-row--message`
- `.ebo-trips-cell--message`

Example structure:

```html
<table class="ebo-trips-table">
  <tbody class="ebo-trips-body">
    <tr class="ebo-trips-row ebo-trips-row--message">
      <td class="ebo-trips-cell ebo-trips-cell--message" colspan="6">
        Sign In to see schedule of upcoming events
      </td>
    </tr>
  </tbody>
</table>
```

### Signed in
Renders:

- Table:
  - `.ebo-trips-table`
- Header:
  - `.ebo-trips-head`, `.ebo-trips-header-row`, `.ebo-trips-header-cell`
- Rows:
  - `.ebo-trips-body`, `.ebo-trips-row`
  - Optional state classes:
    - `.ebo-trips-row--going`
    - `.ebo-trips-row--not-going`
    - `.ebo-trips-row--needs-rsvp`
- Cells:
  - `.ebo-trips-cell`
  - Optional cell classes:
    - `.ebo-trips-cell--name`
    - `.ebo-trips-cell--dates`
    - `.ebo-trips-cell--capacity`
    - `.ebo-trips-cell--status`
    - `.ebo-trips-cell--actions`
- Action elements:
  - `.ebo-trips-link` (trip details link)
  - `.ebo-trips-rsvp-label` (“Going” / “Not Going”)
  - `.ebo-trips-rsvp-button` (“RSVP” button)
- Paging (if enabled):
  - `.ebo-trips-pager`
  - `.ebo-trips-pager-button`
  - `.ebo-trips-pager-label`

Example header columns (suggested):
1. Trip
2. Dates
3. Capacity (optional)
4. RSVP
5. Action (optional “View” link)

---

## Data & API Design

### Existing scheduler API capabilities

From the current OpenAPI spec:

- `GET /trips` returns a list of `TripSummary` objects.
  - `TripSummary` includes: `tripId`, `name`, `startDate`, `endDate`, `status`, plus capacity/attending fields.
- RSVP per trip is available via:
  - `GET /trips/{tripId}/rsvp/me` (my RSVP)

Since `TripSummary` does **not** include “my RSVP”, doing this purely client-side would require **N+1** requests (one per trip).

### Recommendation (best UX + fewer requests): add a BFF aggregation endpoint

Add a Worker endpoint that returns upcoming published trips *already decorated* with the current user’s RSVP status:

- `GET /api/widgets/upcoming-trips`

Response shape (example):

```json
{
  "items": [
    {
      "tripId": "t_123",
      "name": "Pinecrest Weekend",
      "startDate": "2026-06-12",
      "endDate": "2026-06-14",
      "capacityRigs": 10,
      "attendingRigs": 6,
      "myRsvp": "YES"  // YES | NO | NONE
    }
  ]
}
```

Notes:
- Filter to `status == PUBLISHED`
- Filter to “upcoming”:
  - preferred: `startDate >= today` (local time), OR `endDate >= today` if you want trips currently in-progress
- Sort: `startDate`, `endDate`, `name`
- Add `Cache-Control: no-store` since “myRsvp” is per user and may change quickly.

#### Paging support (optional)
Support query params:

- `GET /api/widgets/upcoming-trips?page=1&pageSize=10`

Return:

```json
{
  "items": [ ... ],
  "page": 1,
  "pageSize": 10,
  "total": 42
}
```

If you don’t want server paging initially, return all items and paginate in JS.

---

## Widget Behavior

### Load sequence
1. `GET /api/session`
   - If `authenticated: false` → render signed-out message row and exit
2. `GET /api/widgets/upcoming-trips` (or `page/pageSize` variant)
3. Render the table
4. If paging enabled:
   - render pager UI
   - re-render table on page changes

### RSVP rendering rules
For each trip:
- If `myRsvp == "YES"`:
  - show “Going” with `.ebo-trips-rsvp-label`
  - add `.ebo-trips-row--going`
- If `myRsvp == "NO"`:
  - show “Not Going”
  - add `.ebo-trips-row--not-going`
- If `myRsvp == "NONE"`:
  - show “RSVP” button with `.ebo-trips-rsvp-button`
  - add `.ebo-trips-row--needs-rsvp`

#### What the “RSVP” button does (choose one for v1)
**Option A (simplest):** link to trip details page
- `href` is derived from `data-trip-details-href` template
- Button can be an `<a>` styled as a button, or a `<button>` that navigates

**Option B (more dynamic):** inline RSVP action
- Clicking “RSVP” opens a small inline menu (Going / Not Going)
- Calls `PUT /api/trips/{tripId}/rsvp`
- Updates the row label in-place

Recommendation: **Option A for v1** (keeps widget simple; RSVP action lives on details page).

---

## Implementation Plan

### Phase 0 — Worker endpoint scaffold
1. Add `GET /api/widgets/upcoming-trips` to the Worker.
2. Require authentication (based on session cookie); return `401` if not signed in.

**Acceptance**
- Signed in request returns JSON list.
- Signed out request returns 401.

### Phase 1 — Aggregation logic in Worker
1. Call scheduler `GET /trips` using the user’s access token (server-side).
2. Filter `TripSummary.status == PUBLISHED`.
3. Filter to upcoming (decide `startDate` vs `endDate` rule).
4. Sort chronologically.
5. Decorate each trip with `myRsvp`:
   - Preferred: add a scheduler endpoint later that returns “my rsvp” in bulk.
   - For v1: Worker can call `GET /trips/{tripId}/rsvp/me` for each trip (OK if list is small).
   - Add a hard cap (e.g. first 50 upcoming trips) to avoid runaway N+1.

**Acceptance**
- Endpoint returns items with `myRsvp` populated.

### Phase 2 — Widget asset (Pages)
1. Add `/public/assets/ebo-trips-table-widget.js`
2. Implement:
   - query selector for `[data-ebo-upcoming-trips-table]`
   - fetch `/api/session`
   - fetch `/api/widgets/upcoming-trips`
   - render table with CSS classes
   - render “signed out” message row if needed
3. Provide stable class names (as above) and don’t change them without coordination.

**Acceptance**
- Drop-in snippet renders expected table.
- Styling can be applied purely via CSS classes.

### Phase 3 — Paging (optional)
**Client-side paging (fastest)**
- fetch all items once
- render only the page slice
- render pager controls

**Server-side paging (better for large lists)**
- Worker accepts `page/pageSize`
- Widget requests pages on demand

**Acceptance**
- Can navigate pages without full refresh.

### Phase 4 — RSVP button behavior (choose)
- **Option A (link to details)**: implement now
- **Option B (inline RSVP)**: defer until after the trip details page exists

---

## Testing Scenarios

### Signed out
- Visit page containing widget.
- Verify one-row message: “Sign In to see schedule of upcoming events”.

### Signed in
- Verify only PUBLISHED trips appear.
- Verify chronological ordering.
- Verify RSVP states render correctly:
  - YES → Going
  - NO → Not Going
  - NONE → RSVP button
- Click trip name/details link opens trip page.

### Paging (if enabled)
- Verify next/prev works.
- Verify correct number of rows per page.

---

## Deliverables

### Pages
- `/public/assets/ebo-trips-table-widget.js`
- Example snippet for static-site dev
- CSS class contract (this document section)

### Worker
- `GET /api/widgets/upcoming-trips` (plus paging params if implemented)
- Authentication required
- Aggregation logic to include `myRsvp`

