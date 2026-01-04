# Cloudflare + DNS Setup Plan for overlandeastbay.com

This document is a **step‑by‑step development and operations plan** for setting up Cloudflare correctly for the Overland East Bay site and services.

It assumes:

- Domain: **overlandeastbay.com**
- Static site: Cloudflare Pages
- Backend‑for‑Frontend (BFF): Cloudflare Workers
- Same‑origin architecture:
  - Static pages at `https://overlandeastbay.com`
  - APIs at `https://overlandeastbay.com/api/*`

The goal is to avoid early mistakes around DNS, TLS, routing, and environment separation.

---

## High‑Level Architecture (Target State)

```
Internet
  ↓
Cloudflare DNS
  ↓
Cloudflare Edge
  ├── Pages (static HTML, JS, CSS)
  │     https://overlandeastbay.com/*
  │
  └── Worker (BFF + Auth)
        https://overlandeastbay.com/api/*
```

Key principles:
- **Single canonical origin**
- **No CORS**
- **No client‑side JWT storage**
- **HTTP‑only cookies**
- **Everything TLS‑terminated at Cloudflare**

---

## Phase 0 — Prerequisites

Before touching Cloudflare:

- You own `overlandeastbay.com`
- You can change nameservers at the registrar
- You have a Cloudflare account (free plan is sufficient for v1)
- You have a Git repository (or will create one) for:
  - Static site (Pages)
  - Worker (BFF)

---

## Phase 1 — Add Domain to Cloudflare (DNS Authority)

### Step 1: Add site to Cloudflare
1. Log into Cloudflare
2. Add a new site: `overlandeastbay.com`
3. Select **Free plan**
4. Cloudflare scans existing DNS records

### Step 2: Update nameservers at registrar
- Cloudflare will give you **two nameservers**
- Update your domain registrar to use **Cloudflare’s nameservers**
- Wait for DNS propagation (minutes → hours)

**Acceptance**
- Cloudflare dashboard shows domain as *Active*
- DNS tab is editable in Cloudflare

---

## Phase 2 — DNS Record Strategy (Minimal & Correct)

### Required DNS records (initial)

| Type | Name | Target | Proxy |
|----|----|----|----|
| A | overlandeastbay.com | (Pages auto‑managed) | Proxied |
| CNAME | www | overlandeastbay.com | Proxied |

> For Pages, Cloudflare manages the underlying IPs automatically.

### Recommended defaults
- Enable **orange‑cloud (proxy on)** for all public records
- Avoid exposing raw IP addresses
- Do NOT add separate API subdomains unless you intend to split origins later

**Acceptance**
- `https://overlandeastbay.com` resolves
- `https://www.overlandeastbay.com` redirects or resolves (your choice)

---

## Phase 3 — Cloudflare Pages (Static Site)

### Step 1: Create Pages project
1. Go to **Pages → Create a project**
2. Connect GitHub (or upload manually)
3. Select your static site repository

### Step 2: Build configuration
If pure static HTML:
- Framework preset: **None**
- Build command: *(empty)*
- Output directory: `/` or `/public` (depending on repo)

### Step 3: Custom domain
- Assign `overlandeastbay.com` to this Pages project
- Cloudflare will:
  - Provision TLS automatically
  - Create required DNS records

**Acceptance**
- Visiting `https://overlandeastbay.com` loads static HTML
- `/assets/*.js` served with correct caching headers

---

## Phase 4 — Cloudflare Worker (BFF)

### Step 1: Create Worker
Options:
- `wrangler` CLI (recommended)
- Cloudflare dashboard UI

Worker responsibilities:
- Auth (Google / Apple)
- Session handling
- `/api/*` routes
- Widget aggregation endpoints

### Step 2: Route Worker to `/api/*`
In Cloudflare:
- Create a route:
  ```
  Route: overlandeastbay.com/api/*
  Worker: overland-bff
  ```

This ensures:
- Static pages handle everything else
- Worker only runs for `/api/*`

**Acceptance**
- `GET /api/session` returns JSON
- `GET /` still serves static HTML

---

## Phase 5 — TLS & Security Settings (Important)

### SSL/TLS
Set:
- **SSL mode**: Full (Strict)
- Enable **Always Use HTTPS**
- Enable **Automatic HTTPS Rewrites**

### HSTS (recommended after initial testing)
- Enable HSTS
- Include subdomains
- Short initial max‑age (e.g. 1 day), increase later

### Cookies (Worker responsibility)
Ensure all session cookies:
```
HttpOnly
Secure
SameSite=Lax
Path=/
```

---

## Phase 6 — Environment Strategy (Before You Need It)

Even if you don’t use it immediately, decide this now.

### Recommended environments
| Environment | Domain |
|----|----|
| Production | overlandeastbay.com |
| Staging | staging.overlandeastbay.com |
| Dev | workers.dev / pages.dev |

### Strategy
- Separate **Cloudflare Pages projects** per environment
- Separate **Workers** per environment
- Separate OAuth credentials per environment
- Separate session cookie names per environment (optional)

**Do NOT**
- Share cookies across environments
- Share OAuth redirect URIs across environments

---

## Phase 7 — OAuth Provider Setup (DNS‑Relevant)

### Google OAuth
- Authorized redirect URI:
  ```
  https://overlandeastbay.com/api/auth/callback/google
  ```

### Apple Sign In
- Return URL:
  ```
  https://overlandeastbay.com/api/auth/callback/apple
  ```

Ensure:
- HTTPS only
- Domain exactly matches production hostname

---

## Phase 8 — Caching & Performance Defaults

### Pages assets
- Let Cloudflare cache aggressively
- Version JS files:
  - `ebo-auth-widget.v1.js`
  - `ebo-trips-table-widget.v1.js`

### Worker endpoints
- `/api/session`: `Cache-Control: no-store`
- Widget endpoints: `no-store` (per‑user data)
- Static pages: default caching OK

---

## Phase 9 — Observability & Safety Nets

### Enable early
- Cloudflare Analytics
- Worker request logs
- Error logging in Worker (console.log initially)

### Rate limiting (later)
- Consider rate limits on:
  - `/api/auth/login/*`
  - `/api/auth/callback/*`
  - `/api/widgets/*`

---

## Phase 10 — Validation Checklist

### DNS
- [ ] Cloudflare is authoritative nameserver
- [ ] No stale A records pointing elsewhere

### Pages
- [ ] Custom domain attached
- [ ] TLS works
- [ ] Assets load from `/assets/*`

### Worker
- [ ] Worker only runs for `/api/*`
- [ ] Cookies set correctly
- [ ] Session persists across page reloads

### Auth
- [ ] OAuth callbacks resolve
- [ ] returnTo validation enforced
- [ ] Sign‑in / sign‑out works end‑to‑end

---

## Common Mistakes to Avoid

- ❌ Putting API on a different domain early
- ❌ Using `SameSite=None` without reason
- ❌ Letting Pages and Workers overlap routes
- ❌ Trusting `returnTo` blindly
- ❌ Storing JWTs in browser storage
- ❌ Enabling HSTS before verifying everything works

---

## Deliverables

- Cloudflare account with domain active
- Pages project serving static site
- Worker routed to `/api/*`
- TLS + HTTPS enforced
- Clear path for staging/dev later

---

## Final Recommendation

Set up Cloudflare **once, cleanly**, with:
- One domain
- One Pages site
- One Worker
- Clear routing boundaries

This architecture will scale from:
- simple static club site  
→ to auth‑protected scheduling  
→ to future admin UIs  
without painful rewrites.

