// Cloudflare Pages (Advanced Mode) entrypoint.
//
// This file intentionally stays at the repo root to match:
// - `wrangler.toml` (`main = "_worker.ts"`)
// - `ARCHITECTURE_SPA_BFF.md` (single entrypoint router)
//
// The implementation lives under `src/worker/` to keep the repo structure clean.
export { SessionsDO } from "./src/worker/lib/session_do";
export type { Env } from "./src/worker/worker";
export { default } from "./src/worker/worker";


