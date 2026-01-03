import { describe, expect, it, vi } from "vitest";
import { refreshAccessToken, tokenExchangeWithIdToken } from "../src/worker/lib/authgenie";

describe("authgenie", () => {
  it("tokenExchangeWithIdToken posts form-encoded request with basic auth", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      expect(init.method).toBe("POST");
      expect((init.headers as any).Authorization).toMatch(/^Basic /);
      expect((init.headers as any)["Content-Type"]).toContain("application/x-www-form-urlencoded");
      expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
      expect(body.get("subject_token_type")).toBe("urn:ietf:params:oauth:token-type:id_token");
      expect(body.get("subject_token")).toBe("idtok");
      expect(body.getAll("audiences")).toContain("aud");
      return new Response(JSON.stringify({ access_token: "a", token_type: "Bearer", expires_in: 60, refresh_token: "r" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      AUTHGENIE_BASE_URL: "https://authgenie.example/",
      AUTHGENIE_CLIENT_ID: "cid",
      AUTHGENIE_CLIENT_SECRET: "sec",
      AUTHGENIE_AUDIENCE: "aud",
    } as any;

    const res = await tokenExchangeWithIdToken(env, "idtok");
    expect(res.access_token).toBe("a");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refreshAccessToken posts refresh_token grant", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("rrr");
      return new Response(JSON.stringify({ access_token: "a2", token_type: "Bearer", expires_in: 60 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      AUTHGENIE_BASE_URL: "https://authgenie.example",
      AUTHGENIE_CLIENT_ID: "cid",
      AUTHGENIE_CLIENT_SECRET: "sec",
      AUTHGENIE_AUDIENCE: "aud",
    } as any;

    const res = await refreshAccessToken(env, "rrr");
    expect(res.access_token).toBe("a2");
  });

  it("throws on non-2xx responses with error payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_request", error_description: "bad" }), { status: 400 })),
    );

    const env = {
      AUTHGENIE_BASE_URL: "https://authgenie.example",
      AUTHGENIE_CLIENT_ID: "cid",
      AUTHGENIE_CLIENT_SECRET: "sec",
      AUTHGENIE_AUDIENCE: "aud",
    } as any;

    await expect(tokenExchangeWithIdToken(env, "idtok")).rejects.toThrow(/AuthGenie token exchange failed: 400/i);
  });

  it("throws with unknown_error when error response is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 400 })));
    const env = {
      AUTHGENIE_BASE_URL: "https://authgenie.example",
      AUTHGENIE_CLIENT_ID: "cid",
      AUTHGENIE_CLIENT_SECRET: "sec",
      AUTHGENIE_AUDIENCE: "aud",
    } as any;
    await expect(refreshAccessToken(env, "r")).rejects.toThrow(/unknown_error/i);
  });
});


