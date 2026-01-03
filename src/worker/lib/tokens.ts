import type { Env } from "../../../_worker";
import type { Session } from "./session_types";
import { refreshAccessToken } from "./authgenie";

const EXP_SKEW_MS = 30_000;

export type EnsureAccessTokenResult = {
  accessToken: string;
  updatedSession?: Session;
};

export async function ensureAccessToken(env: Env, session: Session): Promise<EnsureAccessTokenResult> {
  const now = Date.now();

  if (session.accessToken && session.accessTokenExpiresAt && session.accessTokenExpiresAt > now + EXP_SKEW_MS) {
    return { accessToken: session.accessToken };
  }

  if (!session.refreshToken) {
    throw new Error("UNAUTHENTICATED");
  }

  const refreshed = await refreshAccessToken(env, session.refreshToken);
  const updated: Session = {
    ...session,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? session.refreshToken,
    accessTokenExpiresAt: now + refreshed.expires_in * 1000,
    subject: refreshed.sub ?? session.subject,
  };

  return { accessToken: updated.accessToken!, updatedSession: updated };
}


