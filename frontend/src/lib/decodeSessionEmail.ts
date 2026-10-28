/**
 * Client-safe, unverified extraction of the `email` claim from a session JWT.
 * Do not use this for authorization — it does not check the signature.
 * Server code must go through `verifySessionToken` in `@/lib/jwt` instead.
 */
export function decodeSessionEmailUnsafe(token: string): string | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json);
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
