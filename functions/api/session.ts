import type { Env } from "../../_worker";
import { getSessionIdFromRequest, loadSessionIfExists } from "../../src/worker/lib/session";
import { jsonResponse } from "../../src/worker/lib/response";

export async function handleGetSession(request: Request, env: Env): Promise<Response> {
  const sessionId = getSessionIdFromRequest(request, env);
  if (!sessionId) {
    return jsonResponse(
      { authenticated: false },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  let authenticated = false;
  try {
    const session = await loadSessionIfExists(env, sessionId);
    authenticated = !!(session && (session.accessToken || session.refreshToken));
  } catch {
    // Fail closed: treat errors as signed-out.
    authenticated = false;
  }

  return jsonResponse(
    { authenticated },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}


