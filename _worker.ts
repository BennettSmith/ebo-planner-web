import { handleAppleCallback, handleAppleLogin } from "./functions/auth/apple";
import { handleGoogleCallback, handleGoogleLogin } from "./functions/auth/google";
import { handleLogout } from "./functions/auth/logout";
import { handleGetMembersMe } from "./functions/api/members/me";
import { SessionsDO } from "./functions/_lib/session_do";

export { SessionsDO };

export interface Env {
  // Static asset binding provided by Cloudflare Pages (Advanced Mode).
  // This is how the worker serves files from the Pages build output directory (e.g. public/).
  ASSETS: Fetcher;

  // Durable Objects
  SESSIONS: DurableObjectNamespace;

  // Common
  BASE_URL: string;
  SESSION_COOKIE_NAME: string;

  // Google
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // Apple
  APPLE_CLIENT_ID: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY_P8: string;

  // AuthGenie
  AUTHGENIE_BASE_URL: string;
  AUTHGENIE_CLIENT_ID: string;
  AUTHGENIE_CLIENT_SECRET: string;
  AUTHGENIE_AUDIENCE: string;

  // Planner API
  PLANNER_BASE_URL: string;
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Auth routes (exact contract, per ARCHITECTURE_SPA_BFF.md)
    if (url.pathname === "/auth/google/login" && request.method === "GET") {
      return handleGoogleLogin(request, env);
    }
    if (url.pathname === "/auth/google/callback" && request.method === "GET") {
      return handleGoogleCallback(request, env);
    }
    if (url.pathname === "/auth/apple/login" && request.method === "GET") {
      return handleAppleLogin(request, env);
    }
    if (url.pathname === "/auth/apple/callback" && request.method === "POST") {
      return handleAppleCallback(request, env);
    }
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }

    // API routes (initial surface)
    if (url.pathname === "/api/members/me" && request.method === "GET") {
      return handleGetMembersMe(request, env, ctx);
    }

    // Everything else is the SPA/static assets (e.g. "/" -> public/index.html).
    // In Pages Advanced Mode, we must explicitly forward to the ASSETS binding.
    return env.ASSETS.fetch(request.url, request);
  },
};


