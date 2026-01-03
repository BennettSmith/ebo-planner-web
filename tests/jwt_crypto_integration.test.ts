import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function cookieFor(provider: "google" | "apple", state: string, nonce: string): string {
  const payload = JSON.stringify({ v: 1, provider, state, nonce, createdAt: Date.now() });
  return `__Host-ebo_oauth=${encodeURIComponent(payload)}`;
}

async function makeRsaJwk(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  return {
    privateKey,
    jwks: { keys: [{ ...jwk, kid, use: "sig", alg: "RS256", key_ops: ["verify"] }] },
  };
}

async function signIdToken(args: {
  kid: string;
  privateKey: any;
  issuer: string;
  audience: string;
  nonce: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ nonce: args.nonce })
    .setProtectedHeader({ alg: "RS256", kid: args.kid })
    .setIssuer(args.issuer)
    .setAudience(args.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(args.privateKey);
}

describe("JWT crypto integration (real signatures, hermetic)", () => {
  it("Google callback accepts a valid RS256 id_token (real jwtVerify)", async () => {
    vi.resetModules();

    const kid = "k1";
    const { privateKey, jwks } = await makeRsaJwk(kid);
    const idToken = await signIdToken({
      kid,
      privateKey,
      issuer: "https://accounts.google.com",
      audience: "google-client-id",
      nonce: "NONCE",
    });

    // Make handler use a local JWKSet for createRemoteJWKSet, but keep jwtVerify real.
    vi.doMock("jose", async () => {
      const actual: any = await vi.importActual("jose");
      return {
        ...actual,
        createRemoteJWKSet: (_url: URL) => actual.createLocalJWKSet(jwks),
      };
    });

    vi.doMock("../src/worker/lib/session", () => ({
      loadSession: vi.fn(async () => ({ sessionId: "sid", session: {}, setCookieHeader: undefined })),
      saveSession: vi.fn(async () => {}),
    }));
    vi.doMock("../src/worker/lib/authgenie", () => ({
      tokenExchangeWithIdToken: vi.fn(async () => ({ access_token: "AG_AT", token_type: "Bearer", expires_in: 60 })),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        throw new Error(`Unexpected fetch in test: ${url}`);
      }),
    );

    const { handleGoogleCallback } = await import("../functions/auth/google");
    const req = new Request("https://example.com/auth/google/callback?state=STATE&code=CODE", {
      headers: { Cookie: cookieFor("google", "STATE", "NONCE") },
    });
    const env = { BASE_URL: "https://example.com", GOOGLE_CLIENT_ID: "google-client-id", GOOGLE_CLIENT_SECRET: "sec" } as any;

    const res = await handleGoogleCallback(req, env);
    expect(res.status).toBe(302);
  });

  it("Google callback rejects invalid signature (real jwtVerify)", async () => {
    vi.resetModules();

    const kid = "k1";
    const { privateKey, jwks } = await makeRsaJwk(kid);
    // Sign with a different kid than the served key; no matching key => jwtVerify fails => 400.
    const idToken = await signIdToken({
      kid: "different-kid",
      privateKey,
      issuer: "https://accounts.google.com",
      audience: "google-client-id",
      nonce: "NONCE",
    });

    vi.doMock("jose", async () => {
      const actual: any = await vi.importActual("jose");
      return {
        ...actual,
        createRemoteJWKSet: (_url: URL) => actual.createLocalJWKSet(jwks),
      };
    });

    vi.doMock("../src/worker/lib/session", () => ({
      loadSession: vi.fn(async () => ({ sessionId: "sid", session: {}, setCookieHeader: undefined })),
      saveSession: vi.fn(async () => {}),
    }));
    vi.doMock("../src/worker/lib/authgenie", () => ({
      tokenExchangeWithIdToken: vi.fn(async () => ({ access_token: "AG_AT", token_type: "Bearer", expires_in: 60 })),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          return new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        throw new Error(`Unexpected fetch in test: ${url}`);
      }),
    );

    const { handleGoogleCallback } = await import("../functions/auth/google");
    const req = new Request("https://example.com/auth/google/callback?state=STATE&code=CODE", {
      headers: { Cookie: cookieFor("google", "STATE", "NONCE") },
    });
    const env = { BASE_URL: "https://example.com", GOOGLE_CLIENT_ID: "google-client-id", GOOGLE_CLIENT_SECRET: "sec" } as any;

    const res = await handleGoogleCallback(req, env);
    expect(res.status).toBe(400);
  });

  it("Apple callback accepts a valid RS256 id_token (real jwtVerify)", async () => {
    vi.resetModules();

    const kid = "k1";
    const { privateKey, jwks } = await makeRsaJwk(kid);
    const idToken = await signIdToken({
      kid,
      privateKey,
      issuer: "https://appleid.apple.com",
      audience: "apple-client-id",
      nonce: "NONCE",
    });

    vi.doMock("jose", async () => {
      const actual: any = await vi.importActual("jose");
      return {
        ...actual,
        createRemoteJWKSet: (_url: URL) => actual.createLocalJWKSet(jwks),
      };
    });

    vi.doMock("../src/worker/lib/session", () => ({
      loadSession: vi.fn(async () => ({ sessionId: "sid", session: {}, setCookieHeader: undefined })),
      saveSession: vi.fn(async () => {}),
    }));
    vi.doMock("../src/worker/lib/authgenie", () => ({
      tokenExchangeWithIdToken: vi.fn(async () => ({ access_token: "AG_AT", token_type: "Bearer", expires_in: 60 })),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("https://appleid.apple.com/auth/token")) {
          return new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        throw new Error(`Unexpected fetch in test: ${url}`);
      }),
    );

    // We still need a valid ES256 key in env because the handler signs a client_secret JWT.
    const { exportPKCS8 } = await import("jose");
    const { privateKey: appleClientSecretKey } = await generateKeyPair("ES256");
    const applePkcs8 = await exportPKCS8(appleClientSecretKey);

    const { handleAppleCallback } = await import("../functions/auth/apple");
    const body = new URLSearchParams({ state: "STATE", code: "CODE" });
    const req = new Request("https://example.com/auth/apple/callback", {
      method: "POST",
      headers: { Cookie: cookieFor("apple", "STATE", "NONCE"), "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const env = {
      BASE_URL: "https://example.com",
      APPLE_CLIENT_ID: "apple-client-id",
      APPLE_TEAM_ID: "team",
      APPLE_KEY_ID: "keyid",
      APPLE_PRIVATE_KEY_P8: applePkcs8,
    } as any;

    const res = await handleAppleCallback(req, env);
    expect(res.status).toBe(302);
  });
});


