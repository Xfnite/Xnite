import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { signSessionToken } from "@/lib/jwt";
import { signCookieValue } from "@/lib/signedCookie";
import { withRateLimit } from "@/lib/rateLimit";

export const GET = withRateLimit(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = process.env.NEXT_PUBLIC_APP_URL || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin);

  // This route acts as both the initiator and the callback.
  // Using the exact URL the user has configured in Google Cloud Console.
  const redirectUri = `${origin}/api/auth/google`;

  // 1. Handle error from Google
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  // 2. Handle callback if code is present
  if (code) {
    try {
      if (!clientId || !clientSecret) {
        console.error("Missing Google Client ID or Secret in environment variables");
        return NextResponse.redirect(`${origin}/login?error=ServerConfigurationError`);
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("Token exchange failed:", tokenData);
        throw new Error("Failed to get token");
      }

      // Fetch user data from the standard userinfo endpoint
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();

      const name = userData.name || userData.email?.split('@')[0] || "Unknown";
      const email = userData.email ? userData.email.toLowerCase() : "Unknown";

      const state = searchParams.get("state");

      // If they are logging in but don't have an account, check GingerGX first
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser && (existingUser.status === "Deactivated" || existingUser.status?.toLowerCase() === "inactive")) {
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Your account has been blacklisted due to inactivity. Please contact your Recruiter, Judger, Checker, or Admin for assistance.")}`);
      }

      // An applicant with payout history is a former labeler given a new Ginger account
      // on reactivation (see isGingerResetApplicant in actions/auth.ts); let them in.
      if (
        process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true" && existingUser && existingUser.role === "applicant" &&
        !(await prisma.incomeHistory.findFirst({ where: { email: existingUser.email }, select: { id: true } }))
      ) {
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Hiring was closed, you can continue again on November 2026 once we open more slots")}`);
      }

      if (process.env.NEXT_PUBLIC_ENABLE_REGISTRATION !== "true" && !existingUser) {
        return NextResponse.redirect(`${origin}/login?error=Registration%20is%20currently%20disabled.`);
      }

      // If they came from the signup page, redirect to the referrer collection page
      if (state === "signup") {
        const response = NextResponse.redirect(`${origin}/register?step=complete-profile`);
        response.cookies.set("signup_name", name, { path: "/", maxAge: 3600 });
        response.cookies.set("signup_email", await signCookieValue("signup_email", email, 3600), { path: "/", maxAge: 3600 });
        return response;
      }

      if (!existingUser) {
        // Check if the email exists in GingerGX by probing the signup-validate endpoint.
        // If Ginger rejects with an "already in use / exists" error, the user is a Ginger
        // member who just hasn't linked their Google account yet → send to complete-profile.
        // Otherwise they are brand-new → send to the full /register page.
        let existsInGinger = false;
        try {
          const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
          const validateRes = await fetch(
            `${GINGER_BASE}/bac/eam/koala/koala-user/user/signup-validate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email,
                username: `probe_${Date.now()}@gmail.com`,
                password: "Probe1234",
                password_conf: "Probe1234",
                contact: " ",
                graduate_date: " ",
                occupied: " ",
                payee_name: "",
                payee_uid: "",
                referal_email: "",
                imitation_code: "",
              }),
            }
          );
          const validateText = await validateRes.text();
          // Ginger returns a message containing "email" + "exist" / "already" when the
          // email is already registered; treat any such response as "found in Ginger".
          existsInGinger = /email.*(exist|already|taken|use)/i.test(validateText) ||
            /already.*(register|exist)/i.test(validateText);
          console.log("Ginger validate probe for", email, "→ status", validateRes.status, "| existsInGinger:", existsInGinger, "| body:", validateText.slice(0, 200));
        } catch (gingerProbeErr) {
          console.error("Ginger existence probe failed:", gingerProbeErr);
          // On probe failure, fall through to complete-profile (safer assumption)
          existsInGinger = false;
        }

        if (existsInGinger) {
          // User is in Ginger but not in our DB → they need to link & complete their profile
          const response = NextResponse.redirect(`${origin}/register`);
          response.cookies.set("signup_name", name, { path: "/", maxAge: 3600 });
          response.cookies.set("signup_email", await signCookieValue("signup_email", email, 3600), { path: "/", maxAge: 3600 });
          return response;
        } else {
          const response = NextResponse.redirect(`${origin}/register`);
          response.cookies.set("signup_name", name, { path: "/", maxAge: 3600 });
          response.cookies.set("signup_email", await signCookieValue("signup_email", email, 3600), { path: "/", maxAge: 3600 });
          return response;
        }
      }

      // User exists — set xnite_session so the dashboard layout can identify them
      let redirectPath = "/dashboard";
      if (!existingUser.hasCompletedPreCourse) {
        if (!existingUser.phone || !existingUser.firstName) {
          redirectPath = "/register?step=complete-profile";
        } else {
          redirectPath = "/register?step=welcome";
        }
      }
      const response = NextResponse.redirect(`${origin}${redirectPath}`);

      response.cookies.set("xnite_session", await signSessionToken(existingUser.email), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });

      // Ensure the user's Google name and email are preserved for the profile completion step
      response.cookies.set("signup_name", name, { path: "/", maxAge: 3600 });
      response.cookies.set("signup_email", await signCookieValue("signup_email", email, 3600), { path: "/", maxAge: 3600 });

      const gingerEmail = existingUser.gingerEmail || existingUser.gingerUsername || existingUser.email;
      const gingerPassword = existingUser.gingerPassword || existingUser.password;
      if (existingUser.isRegistered && gingerEmail && gingerPassword) {
        try {
          const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
          const gingerRes = await fetch(`${GINGER_BASE}/bac/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: gingerEmail, password: gingerPassword }),
          });
          const gingerData = await gingerRes.json().catch(() => ({}));

          if (gingerRes.ok && gingerData?.credential?.access_token) {
            response.cookies.set("ginger_access_token", gingerData.credential.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              path: "/",
            });
          } else {
            console.error("Ginger login failed (Google route):", gingerRes.status, gingerData);
          }
        } catch (gingerErr) {
          console.error("Ginger login failed during Google OAuth:", gingerErr);
        }
      } else if (!existingUser.isRegistered) {
        // A token cookie left in the browser belongs to an old Ginger account (e.g. one
        // replaced on reactivation); drop it so the dashboard creates the new one.
        response.cookies.delete("ginger_access_token");
      }

      response.cookies.set("pre_course_completed", existingUser.hasCompletedPreCourse ? "true" : "false", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      // Update last login timestamp and status
      await prisma.user.update({
        where: { email: existingUser.email },
        data: { lastLogin: new Date(), status: "Active" },
      });

      return response;

    } catch (err) {
      console.error("Google Auth error:", err);
      return NextResponse.redirect(`${origin}/login?error=GoogleAuthFailed`);
    }
  }

  // 3. Initiate OAuth if no code is present
  if (!clientId) {
    return NextResponse.json({ error: 'Missing GOOGLE_CLIENT_ID in environment variables' }, { status: 500 });
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'email profile');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  // Pass the action (e.g. signup) via the state parameter so we can read it on callback
  const action = searchParams.get("action");
  if (action) {
    authUrl.searchParams.set('state', action);
  }

  return NextResponse.redirect(authUrl.toString());
});
