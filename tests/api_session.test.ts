import { describe, expect, it, vi } from "vitest";

vi.mock("../src/worker/lib/session", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/worker/lib/session")>();
  return {
    ...mod,
    loadSessionIfExists: vi.fn(async () => null),
  };
});

import { handleGetSession } from "../functions/api/session";
import { loadSessionIfExists } from "../src/worker/lib/session";

describe("/api/session handler", () => {
  it("returns authenticated:false without creating a session when no cookie", async () => {
    const env = {} as any;
    const res = await handleGetSession(new Request("https://x/api/session"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ authenticated: false });
    expect(loadSessionIfExists).not.toHaveBeenCalled();
  });

  it("returns authenticated:true when existing session has tokens", async () => {
    (loadSessionIfExists as any).mockImplementationOnce(async () => ({ accessToken: "AT" }));
    const env = { SESSION_COOKIE_NAME: "bff_session" } as any;
    const res = await handleGetSession(new Request("https://x/api/session", { headers: { Cookie: "bff_session=sid" } }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true });
  });

  it("returns authenticated:false when cookie present but session missing", async () => {
    (loadSessionIfExists as any).mockImplementationOnce(async () => null);
    const env = { SESSION_COOKIE_NAME: "bff_session" } as any;
    const res = await handleGetSession(new Request("https://x/api/session", { headers: { Cookie: "bff_session=sid" } }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it("returns authenticated:true when session has refreshToken (even if accessToken missing)", async () => {
    (loadSessionIfExists as any).mockImplementationOnce(async () => ({ refreshToken: "RT" }));
    const env = { SESSION_COOKIE_NAME: "bff_session" } as any;
    const res = await handleGetSession(new Request("https://x/api/session", { headers: { Cookie: "bff_session=sid" } }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true });
  });

  it("fails closed when session load throws", async () => {
    (loadSessionIfExists as any).mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const env = { SESSION_COOKIE_NAME: "bff_session" } as any;
    const res = await handleGetSession(new Request("https://x/api/session", { headers: { Cookie: "bff_session=sid" } }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });
});


