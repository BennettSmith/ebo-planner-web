import type { Env } from "../../_worker";

export function requireEnv(env: Env, key: keyof Env): string {
  const v = env[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing required env var: ${String(key)}`);
  }
  return v;
}


