import type { Env } from "../../../_worker";
import { parseCookieHeader, serializeCookie } from "./cookies";

type Provider = "google" | "apple";

type OAuthCookieV1 = { v: 1; provider: Provider; state: string; nonce: string; createdAt: number };
type OAuthCookieV2 = { v: 2; provider: Provider; state: string; nonce: string; createdAt: number; returnToPath: string };

export type OAuthCookie = {
  provider: Provider;
  state: string;
  nonce: string;
  createdAt: number;
  returnToPath: string;
};

const OAUTH_COOKIE = "__Host-ebo_oauth";
const OAUTH_TTL_SECONDS = 10 * 60;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function makeState(): string {
  return randomToken();
}

export function makeNonce(): string {
  return randomToken();
}

export function setOAuthCookie(env: Env, provider: Provider, state: string, nonce: string, returnToPath: string): string {
  const payload: OAuthCookieV2 = { v: 2, provider, state, nonce, createdAt: Date.now(), returnToPath };
  return serializeCookie(OAUTH_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAgeSeconds: OAUTH_TTL_SECONDS,
  });
}

export function clearOAuthCookie(): string {
  return serializeCookie(OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAgeSeconds: 0,
  });
}

export function readOAuthCookie(request: Request): OAuthCookie | null {
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const raw = cookies[OAUTH_COOKIE];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OAuthCookieV1 | OAuthCookieV2;
    if (parsed?.v !== 1 && parsed?.v !== 2) return null;
    if (parsed.provider !== "google" && parsed.provider !== "apple") return null;
    if (typeof parsed.state !== "string" || typeof parsed.nonce !== "string") return null;
    if (typeof parsed.createdAt !== "number") return null;

    const returnToPath =
      parsed.v === 2 && typeof (parsed as OAuthCookieV2).returnToPath === "string" ? (parsed as OAuthCookieV2).returnToPath : "/";

    return {
      provider: parsed.provider,
      state: parsed.state,
      nonce: parsed.nonce,
      createdAt: parsed.createdAt,
      returnToPath: returnToPath.startsWith("/") ? returnToPath : "/",
    };
  } catch {
    return null;
  }
}

export function requireBaseUrl(env: Env): string {
  const base = (env.BASE_URL || "").trim();
  if (!base) throw new Error("Missing required env var: BASE_URL");
  return base.endsWith("/") ? base.slice(0, -1) : base;
}


