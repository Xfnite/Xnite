import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// Short referral link: /r/<referralSlug> (e.g. /r/cedrickr, also reached from
// join.xfnite.cloud/cedrickr via a Cloudflare redirect), /r/<username>, or
// /r/<first 8 chars of the user id> for older links. Sets the same signup_ref cookie as
// /login?ref=<email>, then goes to REFERRAL_LANDING_URL (the public site that
// explains Xfnite) if set, else /login. The cookie is set on this app's host, so
// it's still there when the landing page's signup button brings them back.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Behind the proxy request.url is the internal localhost:3000, so build the public origin.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const origin = process.env.NEXT_PUBLIC_APP_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin);
  const response = NextResponse.redirect(process.env.REFERRAL_LANDING_URL || `${origin}/login`);

  try {
    const value = decodeURIComponent(code).trim();
    if (!value) return response;

    let refEmail: string | null = null;

    const bySlugOrUsername =
      (await prisma.user.findUnique({
        where: { referralSlug: value.toLowerCase() },
        select: { email: true },
      })) ??
      (await prisma.user.findFirst({
        where: { username: { equals: value, mode: "insensitive" } },
        select: { email: true },
      }));
    if (bySlugOrUsername) {
      refEmail = bySlugOrUsername.email;
    } else if (/^[0-9a-f]{8}$/i.test(value)) {
      const users = await prisma.user.findMany({
        where: { id: { startsWith: value.toLowerCase() } },
        select: { email: true },
        take: 2,
      });
      // Ignore the code if it doesn't match exactly one user.
      if (users.length === 1) refEmail = users[0].email;
    }

    if (refEmail) {
      response.cookies.set("signup_ref", refEmail, {
        path: "/",
        maxAge: 604800,
        sameSite: "lax",
      });
    }
  } catch (err) {
    console.error("Referral short link lookup failed:", err);
  }

  return response;
}
