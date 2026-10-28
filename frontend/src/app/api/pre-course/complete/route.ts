import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { signSessionToken } from "@/lib/jwt";
import { verifyCookieValue } from "@/lib/signedCookie";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const onboardingEmail = await verifyCookieValue("onboarding_email", cookieStore.get("onboarding_email")?.value);

    if (!onboardingEmail) {
      return NextResponse.json({ success: false, error: "Missing onboarding session" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const answers = body?.answers ?? {};

    const user = await prisma.user.findUnique({
      where: { email: onboardingEmail }
    });

    if (user && user.gingerUsername) {
      const loginPassword = user.gingerPassword || user.password;
      if (loginPassword) {
        try {
          const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
          const gingerRes = await fetch(`${GINGER_BASE}/bac/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.gingerUsername, password: loginPassword }),
          });

          if (gingerRes.ok) {
            const gingerData = await gingerRes.json();
            if (gingerData.credential?.access_token) {
              const cookieStore = await cookies();
              cookieStore.set({
                name: "ginger_access_token",
                value: gingerData.credential.access_token,
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
              });
            }
          }
        } catch (e) {
          console.error("Failed to login to Ginger after pre-course:", e);
        }
      }
    }

    await prisma.user.update({
      where: { email: onboardingEmail },
      data: { hasCompletedPreCourse: true, isRegistered: true },
    });

    const response = NextResponse.json({ success: true, data: { answers, redirectTo: "/dashboard" } });

    response.cookies.set({
      name: "pre_course_completed",
      value: "true",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    response.cookies.set({
      name: "xnite_session",
      value: await signSessionToken(onboardingEmail),
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    response.cookies.delete("pre_course_progress");
    response.cookies.delete("onboarding_email");
    response.cookies.delete("onboarding_name");
    response.cookies.delete("onboarding_referrer");

    return response;
  } catch (error) {
    console.error("Pre-course completion error:", error);
    return NextResponse.json({ success: false, error: "Failed to complete pre-course" }, { status: 500 });
  }
}