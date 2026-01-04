import type { Env } from "../../../_worker";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { loadSession, saveSession } from "../../../src/worker/lib/session";
import { ensureAccessToken } from "../../../src/worker/lib/tokens";
import { jsonResponse } from "../../../src/worker/lib/response";
import { RSVPResponseSchema, SetMyRsvpRequestSchema } from "../../../src/shared/contracts";

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

function badRequest(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "BAD_REQUEST",
        message,
      },
    },
    { status: 400 },
  );
}

function plannerBaseUrl(env: Env): string {
  return env.PLANNER_BASE_URL.replace(/\/+$/, "");
}

function parseTripId(url: URL): string | null {
  const tripId = (url.searchParams.get("tripId") ?? "").trim();
  if (!tripId) return null;
  return tripId;
}

export async function handleGetMyRsvpWidget(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const tripId = parseTripId(url);
  if (!tripId) return badRequest("Missing required query param: tripId");

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

  const base = plannerBaseUrl(env);
  const res = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/rsvp/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  let myRsvp: "YES" | "NO" | "UNSET" = "UNSET";
  if (res.status === 200) {
    const json = (await res.json()) as { myRsvp?: { response?: unknown } };
    const parsed = RSVPResponseSchema.safeParse(json?.myRsvp?.response);
    if (parsed.success) myRsvp = parsed.data;
  } else if (res.status === 404) {
    myRsvp = "UNSET";
  } else if (res.status === 401) {
    // Upstream says unauthorized; treat as signed out.
    return unauthorized();
  } else if (!res.ok) {
    return jsonResponse({ error: { code: "UPSTREAM_ERROR", message: `Planner error: ${res.status}` } }, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  if (setCookieHeader) headers.append("Set-Cookie", setCookieHeader);
  return jsonResponse({ tripId, myRsvp }, { status: 200, headers });
}

export async function handlePutMyRsvpWidget(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const tripId = parseTripId(url);
  if (!tripId) return badRequest("Missing required query param: tripId");

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

  const body = SetMyRsvpRequestSchema.parse(await request.json());
  const base = plannerBaseUrl(env);
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();

  const res = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/rsvp`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  if (setCookieHeader) headers.append("Set-Cookie", setCookieHeader);

  if (!res.ok) {
    // Pass through common statuses, but normalize response to JSON.
    const status = res.status;
    if (status === 401) return unauthorized();
    if (status === 400) return jsonResponse({ error: { code: "BAD_REQUEST", message: "Invalid RSVP request." } }, { status, headers });
    if (status === 409) return jsonResponse({ error: { code: "CONFLICT", message: "RSVP not allowed." } }, { status, headers });
    return jsonResponse({ error: { code: "UPSTREAM_ERROR", message: `Planner error: ${status}` } }, { status: 502, headers });
  }

  // Return the updated state in widget-friendly shape.
  return jsonResponse({ tripId, myRsvp: body.response }, { status: 200, headers });
}


