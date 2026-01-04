import type { Env } from "../../_worker";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { loadSession, saveSession } from "../../src/worker/lib/session";
import { clearOAuthCookie, makeNonce, makeState, readOAuthCookie, requireBaseUrl, setOAuthCookie } from "../../src/worker/lib/oidc";
import { tokenExchangeWithIdToken } from "../../src/worker/lib/authgenie";
import { sanitizeReturnToPath } from "../../src/worker/lib/return_to";
import { redirectResponse } from "../../src/worker/lib/response";

type GoogleTokenResponse = {
  id_token?: string;
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function googleRedirectUri(env: Env): string {
  return `${requireBaseUrl(env)}/auth/google/callback`;
}

export async function handleGoogleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const returnToPath = sanitizeReturnToPath(env, url.searchParams.get("returnTo"));

  const state = makeState();
  const nonce = makeNonce();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", googleRedirectUri(env));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);

  return redirectResponse(authUrl.toString(), [setOAuthCookie(env, "google", state, nonce, returnToPath)]);
}

export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const oauth = readOAuthCookie(request);
  if (!oauth || oauth.provider !== "google") {
    return new Response("Missing OAuth state", { status: 400 });
  }
  if (!state || state !== oauth.state) {
    return new Response("Invalid OAuth state", { status: 400 });
  }
  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400 });
  }
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return new Response(`Google token exchange failed: ${tokenRes.status}`, { status: 502 });
  }
  const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
  const idToken = tokenJson.id_token;
  if (!idToken) return new Response("Google did not return id_token", { status: 502 });

  let payload: { nonce?: unknown };
  try {
    ({ payload } = await jwtVerify(idToken, googleJwks, {
      issuer: GOOGLE_ISSUERS,
      audience: env.GOOGLE_CLIENT_ID,
    }));
  } catch {
    return new Response("Invalid ID token", { status: 400 });
  }
  if (payload.nonce !== oauth.nonce) {
    return new Response("Invalid nonce", { status: 400 });
  }

  const exchanged = await tokenExchangeWithIdToken(env, idToken);

  const { sessionId, session, setCookieHeader } = await loadSession(request, env);
  session.provider = "google";
  session.idToken = undefined; // do not persist by default
  session.accessToken = exchanged.access_token;
  session.refreshToken = exchanged.refresh_token ?? undefined;
  session.accessTokenExpiresAt = Date.now() + exchanged.expires_in * 1000;
  session.subject = exchanged.sub ?? session.subject;

  await saveSession(env, sessionId, session);

  const setCookies = [clearOAuthCookie()];
  if (setCookieHeader) setCookies.push(setCookieHeader);
  return redirectResponse(oauth.returnToPath || "/", setCookies);
}


