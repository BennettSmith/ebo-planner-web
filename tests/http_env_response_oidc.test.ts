import { describe, expect, it } from "vitest";

import { requireEnv } from "../functions/_lib/env";
import { basicAuthHeader, readJson } from "../functions/_lib/http";
import { jsonResponse, redirectResponse } from "../functions/_lib/response";
import { clearOAuthCookie, readOAuthCookie, requireBaseUrl, setOAuthCookie } from "../functions/_lib/oidc";

describe("env", () => {
  it("requireEnv returns value or throws", () => {
    expect(requireEnv({ FOO: "bar" } as any, "FOO" as any)).toBe("bar");
    expect(() => requireEnv({ FOO: "" } as any, "FOO" as any)).toThrow(/Missing required env var/i);
  });
});

describe("http", () => {
  it("basicAuthHeader returns Basic base64(clientId:secret)", () => {
    expect(basicAuthHeader("cid", "sec")).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
  });

  it("readJson parses JSON and throws on non-JSON", async () => {
    await expect(readJson(new Response(JSON.stringify({ ok: 1 })))).resolves.toEqual({ ok: 1 });
    await expect(readJson(new Response("not-json"))).rejects.toThrow(/Expected JSON/);
  });
});

describe("response", () => {
  it("jsonResponse sets content type and stringifies", async () => {
    const res = jsonResponse({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("redirectResponse sets Location and Set-Cookie headers", () => {
    const res = redirectResponse("/x", ["a=1; Path=/", "b=2; Path=/"]);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/x");
    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("Set-Cookie")!];
    expect(setCookies.join("\n")).toContain("a=1");
    expect(setCookies.join("\n")).toContain("b=2");
  });
});

describe("oidc cookie helpers", () => {
  const env = { BASE_URL: "https://example.com/" } as any;

  it("requireBaseUrl trims and validates", () => {
    expect(requireBaseUrl(env)).toBe("https://example.com");
    expect(() => requireBaseUrl({ BASE_URL: "   " } as any)).toThrow(/BASE_URL/);
  });

  it("setOAuthCookie + readOAuthCookie roundtrip", () => {
    const setCookie = setOAuthCookie(env, "google", "s1", "n1");
    // Cookie header needs just name=value.
    const cookieNV = setCookie.split(";")[0];
    const req = new Request("https://x", { headers: { Cookie: cookieNV } });
    const parsed = readOAuthCookie(req);
    expect(parsed?.provider).toBe("google");
    expect(parsed?.state).toBe("s1");
    expect(parsed?.nonce).toBe("n1");
  });

  it("makeState/makeNonce return url-safe tokens", async () => {
    const mod = await import("../functions/_lib/oidc");
    const s = mod.makeState();
    const n = mod.makeNonce();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("readOAuthCookie returns null for invalid cookie payloads", async () => {
    // invalid JSON
    expect(readOAuthCookie(new Request("https://x", { headers: { Cookie: "__Host-ebo_oauth=notjson" } }))).toBeNull();
    // wrong version
    expect(
      readOAuthCookie(new Request("https://x", { headers: { Cookie: `__Host-ebo_oauth=${encodeURIComponent('{"v":2}')}` } })),
    ).toBeNull();
    // bad provider
    expect(
      readOAuthCookie(
        new Request("https://x", {
          headers: { Cookie: `__Host-ebo_oauth=${encodeURIComponent('{"v":1,"provider":"x","state":"s","nonce":"n","createdAt":1}')}` },
        }),
      ),
    ).toBeNull();
    // missing fields
    expect(
      readOAuthCookie(new Request("https://x", { headers: { Cookie: `__Host-ebo_oauth=${encodeURIComponent('{"v":1}')}` } })),
    ).toBeNull();
  });

  it("clearOAuthCookie expires cookie", () => {
    const s = clearOAuthCookie();
    expect(s).toContain("__Host-ebo_oauth=");
    expect(s).toContain("Max-Age=0");
  });
});


