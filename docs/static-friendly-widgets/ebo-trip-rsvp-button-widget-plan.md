# Trip RSVP Button Widget (My RSVP for a Specific Trip) (Cloudflare Pages + Worker) — Development Plan

## Goal

Provide a **static-friendly widget** that renders a single **RSVP button** for a specific trip. The button reflects the **currently authenticated user’s** RSVP state and allows the user to change it.

States:

- RSVP = YES → label **“Going”**
- RSVP = NO → label **“Not Going”**
- RSVP = NONE/UNSET → label **“RSVP”** (or “RSVP (not set)”)

On click, the widget lets the user change their response (YES/NO/UNSET).

Requirements:

- Renders inside a `<div>` or `<span>` placeholder using a single JS asset.
- Trip is identified by:
  - `data-trip-id="..."` OR
  - query-string param (e.g. `?tripId=...`)
- Only works for **authenticated** users:
  - If signed out: render a “Sign In to RSVP” control (or disabled button) linking to sign-in chooser.
- Uses BFF Worker under `/api/*` to fetch and mutate RSVP.
- Adds stable **CSS classes** for styling.
- Handles disabled states (e.g. RSVP disabled for drafts/cancelled trips).
- No client-side JWT/token storage; uses HttpOnly session cookie.

Canonical deployment:

- Static site on Cloudflare Pages: `https://overlandeastbay.com`
- BFF (Cloudflare Worker): same origin, under `/api/*`
- Widget JS served by Pages: `/assets/ebo-trip-rsvp-widget.js`

---

## Non-Goals (v1)

- No modal framework dependency
- No realtime updates across tabs
- No complex capacity handling UX (server may reject; widget shows message)

---

## Static-Site Integration Spec

### Minimal drop-in snippet (tripId from query string)

```html
<div
  data-ebo-trip-rsvp
  data-trip-id-from="query"
  data-trip-id-param="tripId"
></div>

<script defer src="/assets/ebo-trip-rsvp-widget.js"></script>
```

### Alternative: explicit tripId attribute

```html
<div
  data-ebo-trip-rsvp
  data-trip-id="t_123"
></div>

<script defer src="/assets/ebo-trip-rsvp-widget.js"></script>
```

Optional attributes:

- `data-signin-href="/api/auth/signin?returnTo={currentUrl}"`
  - if omitted, widget constructs this automatically
- `data-label-going="Going"`
- `data-label-not-going="Not Going"`
- `data-label-unset="RSVP"`
- `data-label-signin="Sign In to RSVP"`

---

## Rendered DOM Contract (CSS Classes)

The widget renders a single button and (optionally) a tiny chooser panel.

### Container
- `.ebo-rsvp`
- `.ebo-rsvp--loading`
- `.ebo-rsvp--signed-out`
- `.ebo-rsvp--signed-in`
- `.ebo-rsvp--disabled`
- `.ebo-rsvp--error`

### Main button
- `.ebo-rsvp-button`
- State modifiers (applied to button and/or container):
  - `.ebo-rsvp-button--going`
  - `.ebo-rsvp-button--not-going`
  - `.ebo-rsvp-button--unset`
  - `.ebo-rsvp-button--signin`

### Chooser panel (inline, no dependencies)
- `.ebo-rsvp-chooser`
- `.ebo-rsvp-chooser--open`
- `.ebo-rsvp-choice`
- `.ebo-rsvp-choice--yes`
- `.ebo-rsvp-choice--no`
- `.ebo-rsvp-choice--unset`

### Status message (optional)
- `.ebo-rsvp-message`
- `.ebo-rsvp-message--error`
- `.ebo-rsvp-message--info`

---

## Worker API Contracts

### Session check
- `GET /api/session` → `{ "authenticated": true|false }`
- `Cache-Control: no-store`

### Fetch “my RSVP” (preferred)
Expose a widget-friendly endpoint in the Worker:

- `GET /api/widgets/my-rsvp?tripId=<id>`

Response:

```json
{
  "tripId": "t_123",
  "myRsvp": "YES",        // YES | NO | UNSET
  "rsvpEnabled": true,    // false for drafts, cancelled, etc.
  "reasonDisabled": null  // optional string
}
```

Notes:
- Worker can source from scheduler:
  - `GET /trips/{tripId}/rsvp/me`
  - and/or trip details fields like `rsvpActionsEnabled`
- Return `401` if not authenticated

### Set “my RSVP”
Prefer a Worker endpoint that forwards to scheduler and normalizes errors:

- `PUT /api/widgets/my-rsvp?tripId=<id>`
- Body:

```json
{ "myRsvp": "YES" }
```

Valid values: `YES`, `NO`, `UNSET`

Responses:
- `204 No Content` on success, OR `200` with updated state
- `409 Conflict` if capacity / business rule prevents RSVP YES (optional)
- `400` invalid input
- `401` not authenticated

> You can also directly proxy the scheduler endpoint (`PUT /api/trips/{tripId}/rsvp`) but keeping a widget-specific route is nice for stable client contracts.

---

## Widget Behavior

### Load sequence
1. Resolve `tripId` (attribute or query string).
   - If missing: render error message “Trip not specified”.
2. Call `GET /api/session`.
   - If not authenticated:
     - Render Sign In to RSVP button (links to `/api/auth/signin?returnTo=<currentUrl>`).
     - Exit.
3. Call `GET /api/widgets/my-rsvp?tripId=...`.
4. Render main button label based on `myRsvp`:
   - YES → “Going”
   - NO → “Not Going”
   - UNSET → “RSVP”
5. If `rsvpEnabled == false`:
   - Render disabled button and (optional) info message.

### Click behavior (signed in, enabled)
Clicking the main button toggles open an inline chooser panel with three options:

- Going
- Not Going
- Clear RSVP

Selecting an option:
1. `PUT /api/widgets/my-rsvp?tripId=...` with `{ myRsvp: <value> }`
2. On success:
   - update UI state immediately (optimistic update optional)
   - close chooser
3. On failure:
   - show error message
   - keep chooser open (optional)

### UX details (recommended)
- Close chooser when clicking outside (document click listener).
- Disable controls while network request is in flight.
- Provide `aria-expanded` and `aria-controls` for accessibility.

---

## Capacity / Business Rule Handling

Server may reject changes, especially YES when capacity is full.

Recommended handling:
- If Worker returns `409 Conflict` with a message like “Trip is full”:
  - show `.ebo-rsvp-message--error` with that text
  - do not change state

---

## Implementation Plan

### Phase 0 — Worker route wiring
1. Ensure Worker handles `/api/*` routes.
2. Confirm `/api/session` exists (from auth widget).

**Acceptance**
- `/api/session` responds correctly signed in/out.

### Phase 1 — Worker RSVP endpoints
1. Add `GET /api/widgets/my-rsvp?tripId=...`
   - validate tripId
   - require auth
   - call scheduler for “my RSVP” and “rsvp enabled” info
   - normalize into stable response shape
2. Add `PUT /api/widgets/my-rsvp?tripId=...`
   - validate input
   - require auth
   - forward to scheduler RSVP endpoint
   - normalize errors (400/401/409)

**Acceptance**
- Signed out: 401
- Signed in: returns correct RSVP state
- Updates persist and are reflected on subsequent GET

### Phase 2 — Pages widget JS
1. Add `/public/assets/ebo-trip-rsvp-widget.js` to Pages.
2. Implement DOM rendering:
   - button + chooser panel
   - CSS classes
   - disabled/loading states
   - error message line
3. Implement fetch calls:
   - `/api/session`
   - `/api/widgets/my-rsvp`
4. Implement click handling + outside click close.

**Acceptance**
- Drop-in snippet works on any static page with tripId present.
- Changing RSVP updates label.

### Phase 3 — Styling contract stabilization
1. Document class names for the static dev.
2. Keep markup stable and minimal.
3. Provide example CSS snippet (optional, in docs only).

**Acceptance**
- Static dev can style without JS changes.

### Phase 4 — Enhancements (optional)
- Add small status dot or icon next to label
- Add “Last updated” tooltip
- Add keyboard navigation for chooser
- Add auto-refresh when page regains focus

---

## Testing Scenarios

### Signed out
- Widget renders “Sign In to RSVP” button.
- Clicking it navigates to `/api/auth/signin?returnTo=<currentUrl>`.

### Signed in, unset RSVP
- Button shows “RSVP”.
- Clicking opens chooser.
- Selecting “Going” updates to “Going”.

### Signed in, going/not going
- Button reflects current state.
- Selecting another choice updates state.

### Disabled RSVP
- If trip is draft/cancelled or RSVP disabled, button is disabled and shows optional reason.

### Error handling
- Simulate 409 conflict (trip full):
  - user sees message, state unchanged.

### Missing tripId
- Widget renders “Trip not specified” error state.

---

## Deliverables

### Cloudflare Pages
- `/public/assets/ebo-trip-rsvp-widget.js`
- Example snippets for tripId source modes
- CSS class contract (this document)

### Cloudflare Worker
- `GET /api/widgets/my-rsvp?tripId=...`
- `PUT /api/widgets/my-rsvp?tripId=...`
- Auth required; uses session cookie
- Normalized error responses

---

## Recommended Defaults (v1)

- Script URL: `/assets/ebo-trip-rsvp-widget.js`
- tripId source: query string param `tripId`
- Signed-out rendering: “Sign In to RSVP” button linking to chooser
- Chooser UX: inline panel (no external dependencies)
- Response values: `YES`, `NO`, `UNSET`
- Cache: `no-store`

