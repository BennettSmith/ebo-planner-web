import { describe, expect, it } from "vitest";
import { loadSession, saveSession, deleteSession } from "../src/worker/lib/session";
import type { Env } from "../_worker";

function makeEnv(): Env {
  const storageByName = new Map<string, { session?: unknown }>();
  const stubsByName = new Map<string, DurableObjectStub>();

  const namespace = {
    idFromName: (name: string) => ({ name } as unknown as DurableObjectId),
    get: (id: DurableObjectId) => {
      const name = (id as unknown as { name: string }).name;
      let stub = stubsByName.get(name);
      if (!stub) {
        stub = {
          fetch: async (req: Request) => {
            const url = new URL(req.url);
            if (url.pathname !== "/session") return new Response("Not found", { status: 404 });
            const record = storageByName.get(name) ?? {};
            if (req.method === "GET") {
              if (!record.session) return new Response("Not found", { status: 404 });
              return Response.json(record.session);
            }
            if (req.method === "PUT") {
              const json = await req.json();
              storageByName.set(name, { session: json });
              return new Response(null, { status: 204 });
            }
            if (req.method === "DELETE") {
              storageByName.delete(name);
              return new Response(null, { status: 204 });
            }
            return new Response("Not found", { status: 404 });
          },
        } as unknown as DurableObjectStub;
        stubsByName.set(name, stub);
      }
      return stub;
    },
  } as unknown as DurableObjectNamespace;

  return {
    SESSIONS: namespace,
    BASE_URL: "http://localhost:8788",
    SESSION_COOKIE_NAME: "bff_session",
    GOOGLE_CLIENT_ID: "x",
    GOOGLE_CLIENT_SECRET: "y",
    APPLE_CLIENT_ID: "x",
    APPLE_TEAM_ID: "x",
    APPLE_KEY_ID: "x",
    APPLE_PRIVATE_KEY_P8: "x",
    AUTHGENIE_BASE_URL: "https://authgenie.example",
    AUTHGENIE_CLIENT_ID: "cid",
    AUTHGENIE_CLIENT_SECRET: "sec",
    AUTHGENIE_AUDIENCE: "aud",
    PLANNER_BASE_URL: "https://planner.example",
  };
}

function extractCookieNV(setCookie: string): string {
  return setCookie.split(";")[0];
}

describe("session", () => {
  it("creates a new session and sets cookie when missing", async () => {
    const env = makeEnv();
    const req = new Request("https://example.com/api/members/me");
    const res = await loadSession(req, env);
    expect(res.sessionId).toBeTruthy();
    expect(res.setCookieHeader).toBeTruthy();
    expect(res.setCookieHeader).toContain("HttpOnly");
    expect(res.setCookieHeader).toContain("Secure");
    expect(res.setCookieHeader).toContain("SameSite=Lax");
    expect(res.session.createdAt).toBeTypeOf("number");
  });

  it("loads existing session based on cookie", async () => {
    const env = makeEnv();
    const first = await loadSession(new Request("https://example.com/x"), env);
    await saveSession(env, first.sessionId, { createdAt: 123 });

    const cookieHeader = extractCookieNV(first.setCookieHeader!);
    const second = await loadSession(new Request("https://example.com/x", { headers: { Cookie: cookieHeader } }), env);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.session).toEqual({ createdAt: 123 });
  });

  it("does not set cookie header when session cookie already present", async () => {
    const env = makeEnv();
    const first = await loadSession(new Request("https://example.com/x"), env);
    const cookieHeader = extractCookieNV(first.setCookieHeader!);

    const second = await loadSession(new Request("https://example.com/x", { headers: { Cookie: cookieHeader } }), env);
    expect(second.setCookieHeader).toBeUndefined();
  });

  it("throws when DO GET returns non-OK non-404", async () => {
    const env = makeEnv();
    // Patch namespace to return a stub that always 500s on GET.
    const broken = {
      idFromName: (_: string) => ({ name: "broken" } as any),
      get: (_id: any) =>
        ({
          fetch: async (req: Request) => {
            if (new URL(req.url).pathname === "/session" && req.method === "GET") {
              return new Response("nope", { status: 500 });
            }
            return new Response("nope", { status: 500 });
          },
        }) as any,
    } as DurableObjectNamespace;
    (env as any).SESSIONS = broken;

    await expect(loadSession(new Request("https://example.com/x"), env)).rejects.toThrow(/Failed to load session: 500/);
  });

  it("throws when saveSession gets non-OK response", async () => {
    const env = makeEnv();
    const bad = {
      idFromName: (_: string) => ({ name: "bad" } as any),
      get: (_id: any) =>
        ({
          fetch: async (_req: Request) => new Response("nope", { status: 500 }),
        }) as any,
    } as DurableObjectNamespace;
    (env as any).SESSIONS = bad;

    await expect(saveSession(env, "sid", { createdAt: 1 })).rejects.toThrow(/Failed to save session: 500/);
  });

  it("throws when deleteSession gets non-OK response", async () => {
    const env = makeEnv();
    const bad = {
      idFromName: (_: string) => ({ name: "bad" } as any),
      get: (_id: any) =>
        ({
          fetch: async (_req: Request) => new Response("nope", { status: 500 }),
        }) as any,
    } as DurableObjectNamespace;
    (env as any).SESSIONS = bad;

    await expect(deleteSession(env, "sid")).rejects.toThrow(/Failed to delete session: 500/);
  });
});


