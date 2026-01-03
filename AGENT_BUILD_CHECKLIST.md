# Agent Build Checklist

An implementation is complete when:

- [x] Cloudflare Pages project builds without warnings
- [x] SPA loads at /
- [x] Google login works end-to-end
- [x] Apple login works end-to-end (form_post)
- [x] AuthGenie token exchange occurs after provider login
- [x] Access token is refreshed automatically when expired
- [x] /api/members/me calls Planner API /members/me with AuthGenie token
- [x] No OAuth or access tokens are exposed to browser JS
