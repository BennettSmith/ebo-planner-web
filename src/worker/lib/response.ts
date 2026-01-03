export function jsonResponse(body: unknown, init: ResponseInit & { headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function redirectResponse(location: string, setCookies: string[] = []): Response {
  const headers = new Headers({ Location: location });
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}


