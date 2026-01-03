export type Session = {
  provider?: "google" | "apple";
  idToken?: string; // optional; debug only
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  subject?: string;
  createdAt?: number;

  // OIDC transient fields
  oauth?: {
    google?: { state: string; nonce: string; createdAt: number };
    apple?: { state: string; nonce: string; createdAt: number };
  };
};


