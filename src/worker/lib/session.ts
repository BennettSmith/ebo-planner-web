import type { Env } from "../../../_worker";
import { parseCookieHeader, serializeCookie } from "./cookies";
import type { Session } from "./session_types";

const SESSION_PATH = "/session";

export type SessionLoadResult = {
  sessionId: string;
  session: Session;
  setCookieHeader?: string;
};

function newSessionId(): string {
  // Cloudflare Workers runtime supports crypto.randomUUID()
  return crypto.randomUUID();
}

export function getSessionCookieName(env: Env): string {
  return env.SESSION_COOKIE_NAME || "bff_session";
}

export function clearSessionCookie(env: Env): string {
  return serializeCookie(getSessionCookieName(env), "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAgeSeconds: 0,
  });
}

export function buildSessionCookie(env: Env, sessionId: string): string {
  // Host-only cookie: omit Domain attribute by default.
  return serializeCookie(getSessionCookieName(env), sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    // Session cookie (no Max-Age) is acceptable; DO owns the actual session lifetime.
  });
}

function stubFor(env: Env, sessionId: string): DurableObjectStub {
  const id = env.SESSIONS.idFromName(sessionId);
  return env.SESSIONS.get(id);
}

export async function loadSession(request: Request, env: Env): Promise<SessionLoadResult> {
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const cookieName = getSessionCookieName(env);
  let sessionId = cookies[cookieName];
  let setCookieHeader: string | undefined;

  if (!sessionId) {
    sessionId = newSessionId();
    setCookieHeader = buildSessionCookie(env, sessionId);
  }

  const stub = stubFor(env, sessionId);
  const res = await stub.fetch(new Request(`https://do${SESSION_PATH}`, { method: "GET" }));
  if (res.status === 404) {
    const empty: Session = { createdAt: Date.now() };
    await stub.fetch(
      new Request(`https://do${SESSION_PATH}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(empty),
      }),
    );
    return { sessionId, session: empty, setCookieHeader };
  }
  if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
  const session = (await res.json()) as Session;
  return { sessionId, session, setCookieHeader };
}

export async function saveSession(env: Env, sessionId: string, session: Session): Promise<void> {
  const stub = stubFor(env, sessionId);
  const res = await stub.fetch(
    new Request(`https://do${SESSION_PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    }),
  );
  if (!res.ok) throw new Error(`Failed to save session: ${res.status}`);
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  const stub = stubFor(env, sessionId);
  const res = await stub.fetch(new Request(`https://do${SESSION_PATH}`, { method: "DELETE" }));
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
}


