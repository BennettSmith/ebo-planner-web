import type { Env } from "../../_worker";
import { sanitizeReturnToPath } from "../../src/worker/lib/return_to";

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function handleSignin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const returnToPath = sanitizeReturnToPath(env, url.searchParams.get("returnTo"));
  const encoded = encodeURIComponent(returnToPath);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; }
      .card { max-width: 28rem; padding: 1.25rem; border: 1px solid #ddd; border-radius: 12px; }
      .btn { display: inline-block; padding: 0.6rem 0.9rem; border-radius: 10px; border: 1px solid #333; text-decoration: none; color: #111; }
      .btn + .btn { margin-left: 0.5rem; }
      .muted { color: #555; margin-top: 0.75rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 style="margin:0 0 0.75rem 0;">Sign in</h1>
      <div>
        <a class="btn" href="/auth/google/login?returnTo=${encoded}">Continue with Google</a>
        <a class="btn" href="/auth/apple/login?returnTo=${encoded}">Continue with Apple</a>
      </div>
      <p class="muted">You’ll be returned to: <code>${escapeHtml(returnToPath)}</code></p>
    </div>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}


