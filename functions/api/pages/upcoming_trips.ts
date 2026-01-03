import type { Env } from "../../../_worker";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { loadSession, saveSession } from "../../../src/worker/lib/session";
import { ensureAccessToken } from "../../../src/worker/lib/tokens";
import { jsonResponse } from "../../../src/worker/lib/response";
import { UpcomingTripsPageModelSchema, SetMyRsvpRequestSchema } from "../../../src/shared/contracts";

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

function plannerBaseUrl(env: Env): string {
  return env.PLANNER_BASE_URL.replace(/\/+$/, "");
}

async function buildUpcomingTripsPageModel(env: Env, accessToken: string): Promise<unknown> {
  const base = plannerBaseUrl(env);

  const tripsRes = await fetch(`${base}/trips`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!tripsRes.ok) {
    throw new Error(`UPSTREAM_TRIPS_${tripsRes.status}`);
  }

  const tripsJson = (await tripsRes.json()) as {
    trips?: Array<{ tripId: string; name?: string | null; startDate?: string | null; endDate?: string | null; status: string }>;
  };
  const trips = Array.isArray(tripsJson.trips) ? tripsJson.trips : [];

  const enriched = await Promise.all(
    trips.map(async (t) => {
      let myRsvpResponse: "YES" | "NO" | "UNSET" = "UNSET";
      const rsvpRes = await fetch(`${base}/trips/${encodeURIComponent(t.tripId)}/rsvp/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (rsvpRes.status === 200) {
        const json = (await rsvpRes.json()) as { myRsvp?: { response?: "YES" | "NO" | "UNSET" } };
        if (json?.myRsvp?.response) myRsvpResponse = json.myRsvp.response;
      } else if (rsvpRes.status === 404) {
        myRsvpResponse = "UNSET";
      } else if (!rsvpRes.ok) {
        // If RSVP lookup fails, degrade to UNSET rather than failing the whole page model.
        myRsvpResponse = "UNSET";
      }

      return {
        tripId: t.tripId,
        name: t.name ?? null,
        startDate: t.startDate ?? null,
        endDate: t.endDate ?? null,
        status: t.status as "DRAFT" | "PUBLISHED" | "CANCELED",
        myRsvpResponse,
      };
    }),
  );

  return { trips: enriched };
}

export async function handleGetUpcomingTripsPage(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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

  let model: unknown;
  try {
    model = UpcomingTripsPageModelSchema.parse(await buildUpcomingTripsPageModel(env, accessToken));
  } catch {
    return jsonResponse({ error: { code: "UPSTREAM_ERROR", message: "Failed to build upcoming trips page." } }, { status: 502 });
  }

  const headers = new Headers();
  if (setCookieHeader) headers.append("Set-Cookie", setCookieHeader);
  return jsonResponse(model, { status: 200, headers });
}

export async function handlePutUpcomingTripsPageRsvp(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  tripId: string,
): Promise<Response> {
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

  if (!res.ok) {
    // For now, pass upstream status through but still return JSON.
    return jsonResponse({ error: { code: "UPSTREAM_ERROR", message: `Planner error: ${res.status}` } }, { status: res.status });
  }

  // Option A: return the full updated page model after mutation.
  let model: unknown;
  try {
    model = UpcomingTripsPageModelSchema.parse(await buildUpcomingTripsPageModel(env, accessToken));
  } catch {
    return jsonResponse({ error: { code: "UPSTREAM_ERROR", message: "Failed to build upcoming trips page." } }, { status: 502 });
  }

  const headers = new Headers();
  if (setCookieHeader) headers.append("Set-Cookie", setCookieHeader);
  return jsonResponse(model, { status: 200, headers });
}


