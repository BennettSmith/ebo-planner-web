import { describe, expect, it, vi } from "vitest";

vi.mock("../src/worker/lib/session", () => ({
  loadSession: vi.fn(async () => ({
    sessionId: "sid",
    session: {},
    setCookieHeader: "bff_session=sid; Path=/; HttpOnly; Secure; SameSite=Lax",
  })),
  saveSession: vi.fn(async () => {}),
}));

vi.mock("../src/worker/lib/tokens", () => ({
  ensureAccessToken: vi.fn(async () => ({ accessToken: "AT", updatedSession: { accessToken: "AT" } })),
}));

import { handleGetUpcomingTripsPage, handlePutUpcomingTripsPageRsvp } from "../functions/api/pages/upcoming_trips";
import { ensureAccessToken } from "../src/worker/lib/tokens";

describe("/api/pages/upcoming-trips handlers", () => {
  it("GET composes /trips + /rsvp/me into a page model and forwards Set-Cookie", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://planner.example/trips") {
        expect((init?.headers as any).Authorization).toBe("Bearer AT");
        return new Response(
          JSON.stringify({
            trips: [{ tripId: "t1", name: "Trip 1", startDate: "2026-01-01", endDate: null, status: "PUBLISHED" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "https://planner.example/trips/t1/rsvp/me") {
        expect((init?.headers as any).Authorization).toBe("Bearer AT");
        return new Response(JSON.stringify({ myRsvp: { response: "YES" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = { PLANNER_BASE_URL: "https://planner.example/" } as any;
    const res = await handleGetUpcomingTripsPage(new Request("https://x/api/pages/upcoming-trips"), env, {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")!).toContain("bff_session=sid");
    expect(await res.json()).toEqual({
      trips: [
        {
          tripId: "t1",
          name: "Trip 1",
          startDate: "2026-01-01",
          endDate: null,
          status: "PUBLISHED",
          myRsvpResponse: "YES",
        },
      ],
    });
  });

  it("GET returns 401 when unauthenticated", async () => {
    (ensureAccessToken as any).mockImplementationOnce(async () => {
      throw new Error("UNAUTHENTICATED");
    });

    const env = { PLANNER_BASE_URL: "https://planner.example" } as any;
    const res = await handleGetUpcomingTripsPage(new Request("https://x/api/pages/upcoming-trips"), env, {} as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("PUT sets RSVP upstream then returns updated page model (Option A)", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://planner.example/trips/t1/rsvp") {
        expect(init?.method).toBe("PUT");
        expect((init?.headers as any).Authorization).toBe("Bearer AT");
        expect((init?.headers as any)["Idempotency-Key"]).toBe("idem123456");
        expect(init?.body).toBe(JSON.stringify({ response: "NO" }));
        return new Response(JSON.stringify({ myRsvp: { response: "NO" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "https://planner.example/trips") {
        return new Response(JSON.stringify({ trips: [{ tripId: "t1", name: "Trip 1", startDate: null, endDate: null, status: "PUBLISHED" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://planner.example/trips/t1/rsvp/me") {
        return new Response(JSON.stringify({ myRsvp: { response: "NO" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = { PLANNER_BASE_URL: "https://planner.example/" } as any;
    const req = new Request("https://x/api/pages/upcoming-trips/t1/rsvp", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "idem123456" },
      body: JSON.stringify({ response: "NO" }),
    });
    const res = await handlePutUpcomingTripsPageRsvp(req, env, {} as any, "t1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      trips: [{ tripId: "t1", myRsvpResponse: "NO" }],
    });
  });

  it("GET returns 502 on upstream trips error", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://planner.example/trips") {
        return new Response("nope", { status: 500 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = { PLANNER_BASE_URL: "https://planner.example/" } as any;
    const res = await handleGetUpcomingTripsPage(new Request("https://x/api/pages/upcoming-trips"), env, {} as any);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: "UPSTREAM_ERROR" } });
  });
});


