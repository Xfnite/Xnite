import { SignJWT, jwtVerify } from "jose";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  email: string;
  hasCompletedPreCourse?: boolean;
}

export async function signSessionToken(
  email: string,
  hasCompletedPreCourse: boolean = true
): Promise<string> {
  return new SignJWT({ email, hasCompletedPreCourse })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function verifySessionPayload(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.email === "string") {
      return {
        email: payload.email,
        hasCompletedPreCourse:
          typeof payload.hasCompletedPreCourse === "boolean"
            ? payload.hasCompletedPreCourse
            : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
