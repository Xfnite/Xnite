import { SignJWT, jwtVerify } from "jose";

// Signs values the server stores in cookies (signup/onboarding state) so a
// client can't forge them. Each value is bound to a purpose so a token minted
// for one cookie can't be replayed as another.

type CookiePurpose = "signup_email" | "onboarding_email" | "pending_signup_payload";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signCookieValue(purpose: CookiePurpose, value: string, maxAgeSeconds: number): Promise<string> {
  return new SignJWT({ p: purpose, v: value })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getSecretKey());
}

export async function verifyCookieValue(purpose: CookiePurpose, token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.p !== purpose || typeof payload.v !== "string") return null;
    return payload.v;
  } catch {
    return null;
  }
}
