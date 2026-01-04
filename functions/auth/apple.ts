import type { Env } from "../../_worker";
import { importPKCS8, SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { loadSession, saveSession } from "../../src/worker/lib/session";
import { clearOAuthCookie, makeNonce, makeState, readOAuthCookie, requireBaseUrl, setOAuthCookie } from "../../src/worker/lib/oidc";
import { tokenExchangeWithIdToken } from "../../src/worker/lib/authgenie";
import { sanitizeReturnToPath } from "../../src/worker/lib/return_to";
import { redirectResponse } from "../../src/worker/lib/response";

type AppleTokenResponse = {
  id_token?: string;
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  refresh_token?: string;
};

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function appleRedirectUri(env: Env): string {
  return `${requireBaseUrl(env)}/auth/apple/callback`;
}

async function appleClientSecret(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY_P8, "ES256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .setIssuer(env.APPLE_TEAM_ID)
    .setAudience("https://appleid.apple.com")
    .setSubject(env.APPLE_CLIENT_ID)
    .sign(key);
}

export async function handleAppleLogin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const returnToPath = sanitizeReturnToPath(env, url.searchParams.get("returnTo"));

  const state = makeState();
  const nonce = makeNonce();

  const authUrl = new URL("https://appleid.apple.com/auth/authorize");
  authUrl.searchParams.set("client_id", env.APPLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", appleRedirectUri(env));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("response_mode", "form_post");
  authUrl.searchParams.set("scope", "openid email name");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);

  return redirectResponse(authUrl.toString(), [setOAuthCookie(env, "apple", state, nonce, returnToPath)]);
}

export async function handleAppleCallback(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const code = form.get("code")?.toString() ?? "";
  const state = form.get("state")?.toString() ?? "";
  const error = form.get("error")?.toString() ?? "";
  const user = form.get("user")?.toString(); // optional; typically present only on first sign-in

  const oauth = readOAuthCookie(request);
  if (!oauth || oauth.provider !== "apple") return new Response("Missing OAuth state", { status: 400 });
  if (!state || state !== oauth.state) return new Response("Invalid OAuth state", { status: 400 });
  if (error) return new Response(`OAuth error: ${error}`, { status: 400 });
  if (!code) return new Response("Missing code", { status: 400 });

  const clientSecret = await appleClientSecret(env);
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: appleRedirectUri(env),
    }),
  });
  if (!tokenRes.ok) return new Response(`Apple token exchange failed: ${tokenRes.status}`, { status: 502 });
  const tokenJson = (await tokenRes.json()) as AppleTokenResponse;
  const idToken = tokenJson.id_token;
  if (!idToken) return new Response("Apple did not return id_token", { status: 502 });

  let payload: { nonce?: unknown };
  try {
    ({ payload } = await jwtVerify(idToken, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience: env.APPLE_CLIENT_ID,
    }));
  } catch {
    return new Response("Invalid ID token", { status: 400 });
  }
  if (payload.nonce !== oauth.nonce) return new Response("Invalid nonce", { status: 400 });

  // Per AuthGenie OpenAPI: authgenie_oidc_metadata is only supported for Apple exchange in v0.1.
  const oidcMetadataJson = user ? user : undefined;
  const exchanged = await tokenExchangeWithIdToken(env, idToken, { oidcMetadataJson });

  const { sessionId, session, setCookieHeader } = await loadSession(request, env);
  session.provider = "apple";
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


