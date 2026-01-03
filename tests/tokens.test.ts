import { describe, expect, it, vi } from "vitest";

vi.mock("../functions/_lib/authgenie", () => {
  return {
    refreshAccessToken: vi.fn(async () => ({
      access_token: "new_access",
      token_type: "Bearer",
      expires_in: 60,
      refresh_token: "new_refresh",
      sub: "sub",
    })),
  };
});

import { ensureAccessToken } from "../functions/_lib/tokens";

describe("ensureAccessToken", () => {
  it("returns existing token when not expired", async () => {
    const res = await ensureAccessToken({} as any, {
      accessToken: "a",
      accessTokenExpiresAt: Date.now() + 60_000,
    });
    expect(res.accessToken).toBe("a");
    expect(res.updatedSession).toBeUndefined();
  });

  it("refreshes token when expired and refresh token present", async () => {
    const res = await ensureAccessToken({} as any, {
      refreshToken: "r",
      accessToken: "old",
      accessTokenExpiresAt: Date.now() - 1,
      subject: "oldsub",
    });
    expect(res.accessToken).toBe("new_access");
    expect(res.updatedSession?.refreshToken).toBe("new_refresh");
    expect(res.updatedSession?.subject).toBe("sub");
  });

  it("keeps existing refresh token when refresh response omits it", async () => {
    const { refreshAccessToken } = await import("../functions/_lib/authgenie");
    (refreshAccessToken as any).mockImplementationOnce(async () => ({
      access_token: "new_access",
      token_type: "Bearer",
      expires_in: 60,
      refresh_token: null,
      sub: null,
    }));
    const res = await ensureAccessToken({} as any, {
      refreshToken: "r-old",
      accessTokenExpiresAt: Date.now() - 1,
    });
    expect(res.updatedSession?.refreshToken).toBe("r-old");
  });

  it("throws UNAUTHENTICATED when no refresh token", async () => {
    await expect(ensureAccessToken({} as any, {})).rejects.toThrow("UNAUTHENTICATED");
  });
});


