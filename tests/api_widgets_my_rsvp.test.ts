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

import { handleGetMyRsvpWidget, handlePutMyRsvpWidget } from "../functions/api/widgets/my_rsvp";
import { ensureAccessToken } from "../src/worker/lib/tokens";

describe("/api/widgets/my-rsvp handlers", () => {
  it("GET returns 400 when tripId missing", async () => {
    const res = await handleGetMyRsvpWidget(new Request("https://x/api/widgets/my-rsvp"), { PLANNER_BASE_URL: "https://planner.example" } as any, {} as any);
    expect(res.status).toBe(400);
  });

  it("GET returns 401 when unauthenticated", async () => {
    (ensureAccessToken as any).mockImplementationOnce(async () => {
      throw new Error("UNAUTHENTICATED");
    });
    const res = await handleGetMyRsvpWidget(
      new Request("https://x/api/widgets/my-rsvp?tripId=t1"),
      { PLANNER_BASE_URL: "https://planner.example" } as any,
      {} as any,
    );
    expect(res.status).toBe(401);
  });

  it("GET returns myRsvp from upstream", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://planner.example/trips/t1/rsvp/me") {
        return new Response(JSON.stringify({ myRsvp: { response: "NO" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleGetMyRsvpWidget(
      new Request("https://x/api/widgets/my-rsvp?tripId=t1"),
      { PLANNER_BASE_URL: "https://planner.example" } as any,
      {} as any,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ tripId: "t1", myRsvp: "NO" });
  });

  it("GET treats 404 as UNSET", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    const res = await handleGetMyRsvpWidget(
      new Request("https://x/api/widgets/my-rsvp?tripId=t1"),
      { PLANNER_BASE_URL: "https://planner.example/" } as any,
      {} as any,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tripId: "t1", myRsvp: "UNSET" });
  });

  it("GET returns 401 when upstream returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const res = await handleGetMyRsvpWidget(
      new Request("https://x/api/widgets/my-rsvp?tripId=t1"),
      { PLANNER_BASE_URL: "https://planner.example/" } as any,
      {} as any,
    );
    expect(res.status).toBe(401);
  });

  it("GET returns 502 when upstream returns non-OK non-404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const res = await handleGetMyRsvpWidget(
      new Request("https://x/api/widgets/my-rsvp?tripId=t1"),
      { PLANNER_BASE_URL: "https://planner.example/" } as any,
      {} as any,
    );
    expect(res.status).toBe(502);
  });

  it("PUT forwards RSVP upstream and returns updated widget state", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://planner.example/trips/t1/rsvp") {
        expect(init?.method).toBe("PUT");
        expect((init?.headers as any).Authorization).toBe("Bearer AT");
        expect((init?.headers as any)["Idempotency-Key"]).toBe("idem123");
        expect(init?.body).toBe(JSON.stringify({ response: "YES" }));
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://x/api/widgets/my-rsvp?tripId=t1", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "idem123" },
      body: JSON.stringify({ response: "YES" }),
    });
    const res = await handlePutMyRsvpWidget(req, { PLANNER_BASE_URL: "https://planner.example/" } as any, {} as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tripId: "t1", myRsvp: "YES" });
  });

  it("PUT maps upstream 400 to BAD_REQUEST", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 400 })));
    const req = new Request("https://x/api/widgets/my-rsvp?tripId=t1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "YES" }),
    });
    const res = await handlePutMyRsvpWidget(req, { PLANNER_BASE_URL: "https://planner.example/" } as any, {} as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });

  it("PUT maps upstream 409 to CONFLICT", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 409 })));
    const req = new Request("https://x/api/widgets/my-rsvp?tripId=t1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "YES" }),
    });
    const res = await handlePutMyRsvpWidget(req, { PLANNER_BASE_URL: "https://planner.example/" } as any, {} as any);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "CONFLICT" } });
  });
});


