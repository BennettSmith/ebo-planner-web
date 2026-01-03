import type { Env } from "../../../_worker";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { loadSession, saveSession } from "../../../src/worker/lib/session";
import { ensureAccessToken } from "../../../src/worker/lib/tokens";
import { jsonResponse } from "../../../src/worker/lib/response";

function unauthorized(): Response {
  return jsonResponse(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Not authenticated.",
      },
    },
    { status: 401 },
  );
}

export async function handleGetMembersMe(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const { sessionId, session, setCookieHeader } = await loadSession(request, env);

  let accessToken: string;
  try {
    const ensured = await ensureAccessToken(env, session);
    accessToken = ensured.accessToken;
    if (ensured.updatedSession) {
      await saveSession(env, sessionId, ensured.updatedSession);
    }
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") return unauthorized();
    return new Response("Internal error", { status: 500 });
  }

  const upstream = `${env.PLANNER_BASE_URL.replace(/\/+$/, "")}/members/me`;
  const res = await fetch(upstream, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const headers = new Headers(res.headers);
  // Ensure we never forward hop-by-hop headers.
  headers.delete("Connection");
  headers.delete("Transfer-Encoding");

  if (setCookieHeader) headers.append("Set-Cookie", setCookieHeader);
  return new Response(res.body, { status: res.status, headers });
}


