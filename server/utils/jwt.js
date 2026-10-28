import crypto from "crypto";
 
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-xnite-1234567890";
 
export function verifyJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
 
  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
 
  if (signature !== expectedSignature) return null;
 
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
    return payload;
  } catch {
    return null;
  }
}
