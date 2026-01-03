import type { Env } from "../../_worker";
import { deleteSession, loadSession, clearSessionCookie } from "../_lib/session";
import { clearOAuthCookie } from "../_lib/oidc";

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const { sessionId } = await loadSession(request, env);
  await deleteSession(env, sessionId);
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(env));
  headers.append("Set-Cookie", clearOAuthCookie());
  return new Response(null, { status: 204, headers });
}


