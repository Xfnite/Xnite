import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, signSessionToken } from "@/lib/jwt";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("xnite_session")?.value;
  const email = sessionToken ? await verifySessionToken(sessionToken) : null;

  if (!email) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authoritative DB verification: Ensure the user has actually completed the pre-course
  const user = await prisma.user.findUnique({
    where: { email },
    select: { hasCompletedPreCourse: true },
  });

  if (!user || !user.hasCompletedPreCourse) {
    // If not completed in database, keep user in pre-course flow
    return NextResponse.redirect(new URL("/register?step=pre-course", request.url));
  }

  // Completed user: heal their cookies and redirect safely to dashboard
  const response = NextResponse.redirect(new URL("/dashboard", request.url));

  response.cookies.set("pre_course_completed", "true", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year persistence
  });

  response.cookies.set("xnite_session", await signSessionToken(email, true), {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });

  return response;
}

