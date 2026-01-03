import { describe, expect, it } from "vitest";
import { parseCookieHeader, serializeCookie } from "../src/worker/lib/cookies";

describe("cookies", () => {
  it("parses Cookie header into a map", () => {
    const m = parseCookieHeader("a=1; b=hello%20world; c=%7B%22x%22%3A1%7D");
    expect(m).toEqual({ a: "1", b: "hello world", c: '{"x":1}' });
  });

  it("serializes Set-Cookie with common flags", () => {
    const s = serializeCookie("sid", "abc", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAgeSeconds: 10 });
    expect(s).toContain("sid=abc");
    expect(s).toContain("Path=/");
    expect(s).toContain("Max-Age=10");
    expect(s).toContain("HttpOnly");
    expect(s).toContain("Secure");
    expect(s).toContain("SameSite=Lax");
  });
});


