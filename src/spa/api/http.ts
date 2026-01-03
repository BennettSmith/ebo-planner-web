export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, opts: { status: number; code?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

export async function fetchJson(input: RequestInfo | URL, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through; json stays null
  }

  if (!res.ok) {
    const maybe = json as any;
    const message = (maybe?.error?.message as string | undefined) ?? `HTTP ${res.status}`;
    const code = maybe?.error?.code as string | undefined;
    throw new ApiError(message, { status: res.status, code });
  }

  return json;
}


