import { describe, expect, it } from "vitest";
import { SessionsDO } from "../src/worker/lib/session_do";

function makeState() {
  const store = new Map<string, unknown>();
  return {
    storage: {
      get: async (k: string) => store.get(k),
      put: async (k: string, v: unknown) => void store.set(k, v),
      deleteAll: async () => void store.clear(),
    },
  } as unknown as DurableObjectState;
}

describe("SessionsDO", () => {
  it("returns 404 when no session stored", async () => {
    const d = new SessionsDO(makeState());
    const res = await d.fetch(new Request("https://do/session", { method: "GET" }));
    expect(res.status).toBe(404);
  });

  it("stores and retrieves session", async () => {
    const d = new SessionsDO(makeState());
    const put = await d.fetch(
      new Request("https://do/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdAt: 1 }),
      }),
    );
    expect(put.status).toBe(204);
    const get = await d.fetch(new Request("https://do/session", { method: "GET" }));
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ createdAt: 1 });
  });

  it("deletes session", async () => {
    const d = new SessionsDO(makeState());
    await d.fetch(
      new Request("https://do/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdAt: 1 }),
      }),
    );
    const del = await d.fetch(new Request("https://do/session", { method: "DELETE" }));
    expect(del.status).toBe(204);
    const get = await d.fetch(new Request("https://do/session", { method: "GET" }));
    expect(get.status).toBe(404);
  });
});


