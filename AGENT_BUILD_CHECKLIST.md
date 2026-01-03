# Agent Build Checklist

An implementation is complete when:

- [ ] Cloudflare Pages project builds without warnings
- [ ] SPA loads at /
- [ ] Google login works end-to-end
- [ ] Apple login works end-to-end (form_post)
- [ ] AuthGenie token exchange occurs after provider login
- [ ] Access token is refreshed automatically when expired
- [ ] /api/me calls Planner API with AuthGenie token
- [ ] No OAuth or access tokens are exposed to browser JS
