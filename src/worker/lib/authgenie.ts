import type { Env } from "../../../_worker";
import { basicAuthHeader, readJson } from "./http";

export type AuthGenieTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string | null;
  scope?: string | null;
  sub?: string | null;
  tenant_id?: string | null;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
};

type AuthGenieErrorResponse = {
  error: string;
  error_description?: string;
  request_id?: string;
};

function tokenUrl(env: Env): string {
  const base = env.AUTHGENIE_BASE_URL?.trim();
  if (!base) throw new Error("Missing required env var: AUTHGENIE_BASE_URL");
  return `${base.replace(/\/+$/, "")}/v1/oauth/token`;
}

function authHeader(env: Env): string {
  return basicAuthHeader(env.AUTHGENIE_CLIENT_ID, env.AUTHGENIE_CLIENT_SECRET);
}

export async function tokenExchangeWithIdToken(
  env: Env,
  providerIdToken: string,
  opts: { oidcMetadataJson?: string } = {},
): Promise<AuthGenieTokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange");
  body.set("subject_token_type", "urn:ietf:params:oauth:token-type:id_token");
  body.set("subject_token", providerIdToken);
  if (env.AUTHGENIE_AUDIENCE) body.append("audiences", env.AUTHGENIE_AUDIENCE);
  if (opts.oidcMetadataJson) body.set("authgenie_oidc_metadata", opts.oidcMetadataJson);

  const res = await fetch(tokenUrl(env), {
    method: "POST",
    headers: {
      Authorization: authHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const err: AuthGenieErrorResponse = await readJson<AuthGenieErrorResponse>(res).catch(() => ({ error: "unknown_error" }));
    throw new Error(`AuthGenie token exchange failed: ${res.status} ${err.error} ${err.error_description ?? ""}`.trim());
  }

  return await readJson<AuthGenieTokenResponse>(res);
}

export async function refreshAccessToken(env: Env, refreshToken: string): Promise<AuthGenieTokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  if (env.AUTHGENIE_AUDIENCE) body.append("audiences", env.AUTHGENIE_AUDIENCE);

  const res = await fetch(tokenUrl(env), {
    method: "POST",
    headers: {
      Authorization: authHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const err: AuthGenieErrorResponse = await readJson<AuthGenieErrorResponse>(res).catch(() => ({ error: "unknown_error" }));
    throw new Error(`AuthGenie refresh failed: ${res.status} ${err.error} ${err.error_description ?? ""}`.trim());
  }

  return await readJson<AuthGenieTokenResponse>(res);
}


