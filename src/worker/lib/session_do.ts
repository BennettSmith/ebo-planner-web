import type { Session } from "./session_types";

type Stored = { session: Session };

export class SessionsDO implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/session" && request.method === "GET") {
      const stored = (await this.state.storage.get<Stored>("v1")) ?? null;
      if (!stored) return new Response("Not found", { status: 404 });
      return Response.json(stored.session);
    }

    if (url.pathname === "/session" && request.method === "PUT") {
      const session = (await request.json()) as Session;
      await this.state.storage.put("v1", { session } satisfies Stored);
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/session" && request.method === "DELETE") {
      await this.state.storage.deleteAll();
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  }
}


