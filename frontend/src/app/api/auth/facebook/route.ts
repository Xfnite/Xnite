import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { withRateLimit } from "@/lib/rateLimit";
import { signCookieValue } from "@/lib/signedCookie";
import { splitFullName } from "@/lib/nameUtils";

export const GET = withRateLimit(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  
  const clientId = process.env.FACEBOOK_CLIENT_ID;
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
  
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = process.env.NEXT_PUBLIC_APP_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin);
  
  const redirectUri = `${origin}/api/auth/facebook`;

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    try {
      if (!clientId || !clientSecret) {
        console.error("Missing Facebook Client ID or Secret in environment variables");
        return NextResponse.redirect(`${origin}/login?error=ServerConfigurationError`);
      }

      const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${redirectUri}&code=${code}`);

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("Token exchange failed:", tokenData);
        throw new Error("Failed to get token");
      }

      const userRes = await fetch(`https://graph.facebook.com/me?fields=id,name,first_name,last_name,email&access_token=${tokenData.access_token}`);
      const userData = await userRes.json();

      const name = userData.name || userData.email?.split('@')[0] || "Unknown";
      const email = userData.email ? userData.email.toLowerCase() : "Unknown";

      let firstName = (userData.first_name || "").trim();
      let lastName = (userData.last_name || "").trim();
      if ((!firstName || !lastName) && name) {
        const split = splitFullName(name);
        if (!firstName) firstName = split.firstName;
        if (!lastName) lastName = split.lastName;
      }

      const state = searchParams.get("state");

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser && existingUser.status === "Deactivated") {
        return NextResponse.redirect(`${origin}/login?error=AccountDoesNotExist`);
      }

      if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true" && !existingUser) {
        return NextResponse.redirect(`${origin}/login?error=Registration%20is%20currently%20disabled.`);
      }

      if (state === "signup") {
        const response = NextResponse.redirect(`${origin}/register?step=complete-profile`);
        response.cookies.set("signup_name", name, { path: "/", maxAge: 3600 });
        if (firstName) response.cookies.set("signup_first_name", firstName, { path: "/", maxAge: 3600 });
        if (lastName) response.cookies.set("signup_last_name", lastName, { path: "/", maxAge: 3600 });
        response.cookies.set("signup_email", await signCookieValue("signup_email", email, 3600), { path: "/", maxAge: 3600 });
        return response;
      }

      if (!existingUser) {
        const response = NextResponse.redirect(`${origin}/register?step=complete-profile`);
        response.cookies.set("signup_name", name, { path: "/", maxAge: 3600 });
        if (firstName) response.cookies.set("signup_first_name", firstName, { path: "/", maxAge: 3600 });
        if (lastName) response.cookies.set("signup_last_name", lastName, { path: "/", maxAge: 3600 });
        response.cookies.set("signup_email", await signCookieValue("signup_email", email, 3600), { path: "/", maxAge: 3600 });
        return response;
      }

      return NextResponse.redirect(`${origin}/login`);

    } catch (err) {
      console.error("Facebook Auth error:", err);
      return NextResponse.redirect(`${origin}/login?error=FacebookAuthFailed`);
    }
  }

  if (!clientId) {
    return NextResponse.json({ error: 'Missing FACEBOOK_CLIENT_ID in environment variables' }, { status: 500 });
  }

  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'email,public_profile');
  
  const action = searchParams.get("action");
  if (action) {
    authUrl.searchParams.set('state', action);
  }

  return NextResponse.redirect(authUrl.toString());
});
