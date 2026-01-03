// Minimal polyfills for running Cloudflare-Workers-ish code in Node during unit tests.
// Keep this small; prefer mocking at module boundaries.

if (!globalThis.btoa) {
  globalThis.btoa = (data: string) => Buffer.from(data, "binary").toString("base64");
}

if (!globalThis.atob) {
  globalThis.atob = (data: string) => Buffer.from(data, "base64").toString("binary");
}


