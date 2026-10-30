import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/jwt";

const PROTECTED_PREFIXES = ["/dashboard", "/project", "/account", "/wallet"];
const PUBLIC_PATHS = ["/", "/login", "/register", "/privacy", "/terms"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isServerActionRequest = request.headers.has("next-action");

  // ─── Maintenance Mode Guard ──────────────────────────────────────────────
  const isMaintenance = process.env.UNDER_MAINTENANCE === "true" || process.env.NEXT_PUBLIC_UNDER_MAINTENANCE === "true";
  if (isMaintenance) {
    if (pathname.startsWith("/api")) {
      return new NextResponse(
        JSON.stringify({ error: "Service under maintenance" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // ─── Bot and Crawler Prevention Guard ────────────────────────────────────
  const userAgent = request.headers.get("user-agent") || "";
  const isBot = /bot|crawler|spider|scrape|crawl|lighthouse|headless|selenium|puppeteer|curl|wget|python-requests|gsa-crawler|postman|insomnia|bruno|thunderclient|axios|http-client|node-fetch|fetch-client/i.test(userAgent);
  
  if (isBot) {
    console.warn(`[Security] Blocked bot/crawler/API-tool request from User-Agent: "${userAgent}" targeting ${pathname}`);
    return new NextResponse(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // ─── API Domain Security Verification ──────────────────────────────────────
  if (pathname.startsWith("/api")) {
    // Exclude OAuth redirects, webhooks, and external worker sync endpoints from strict referer/origin domain checks
    const isExternalCallbackOrWebhook =
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/uploadthing") ||
      pathname.startsWith("/api/sync-ranking") ||
      pathname.startsWith("/api/ranking/update") ||
      pathname.startsWith("/api/checkers-ranking/update");

    if (isExternalCallbackOrWebhook) {
      return NextResponse.next();
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const referer = request.headers.get("referer");
    const origin = request.headers.get("origin");

    // Helper to verify if referer/origin host is allowed
    const isAllowedHost = (h: string) => {
      if (h === host) return true;
      const allowedThirdPartyDomains = [
        "accounts.google.com",
        "facebook.com",
        "uploadthing.com",
        "ginger.bitmappro.com"
      ];
      return allowedThirdPartyDomains.some(d => h === d || h.endsWith(`.${d}`));
    };

    // Block direct API access from clients without referer or origin (e.g. scripts, curl, postman)
    if (!referer && !origin) {
      console.warn(`[Security] Blocked direct API access to ${pathname} (no referer or origin headers)`);
      return new NextResponse(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify Referer domain matches our host or allowed 3rd parties
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (!isAllowedHost(refererUrl.host)) {
          console.warn(`[Security] Blocked cross-origin API access to ${pathname} from referer: ${refererUrl.host} (expected: ${host})`);
          return new NextResponse(
            JSON.stringify({ error: "Not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        return new NextResponse(
          JSON.stringify({ error: "Not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Verify Origin domain matches our host or allowed 3rd parties
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (!isAllowedHost(originUrl.host)) {
          console.warn(`[Security] Blocked cross-origin API access to ${pathname} from origin: ${originUrl.host} (expected: ${host})`);
          return new NextResponse(
            JSON.stringify({ error: "Not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        return new NextResponse(
          JSON.stringify({ error: "Not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // ─── API Session Authentication Guard ────────────────────────────────────
    const isPublicApi = 
      pathname.startsWith("/api/auth") || 
      pathname.startsWith("/api/uploadthing") ||
      pathname.startsWith("/api/sync-ranking") ||
      pathname.startsWith("/api/ranking/update") ||
      pathname.startsWith("/api/checkers-ranking/update");

    if (!isPublicApi) {
      const sessionToken = request.cookies.get("xnite_session")?.value;
      const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
      if (!sessionEmail) {
        console.warn(`[Security] Blocked unauthenticated API request to ${pathname}`);
        return new NextResponse(
          JSON.stringify({ success: false, error: "Unauthorized. Please log in." }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      // Verify that any requested email parameter matches the authenticated user session
      const emailParam = request.nextUrl.searchParams.get("email");
      if (emailParam && sessionEmail.toLowerCase() !== emailParam.toLowerCase()) {
        console.warn(`[Security] Blocked unauthorized email query: session=${sessionEmail}, queried=${emailParam}`);
        return new NextResponse(
          JSON.stringify({ error: "Not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return NextResponse.next();
  }

  if (request.method !== "GET" || isServerActionRequest) {
    return NextResponse.next();
  }

  if (pathname === "/registration" || pathname.startsWith("/registration/")) {
    return NextResponse.redirect(new URL("/register", request.url));
  }

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("xnite_session")?.value;
  const isAuthenticated = sessionToken ? !!(await verifySessionToken(sessionToken)) : false;
  const preCourseCompleted = request.cookies.get("pre_course_completed")?.value === "true";
  const hasProgress = request.cookies.has("pre_course_progress");

  if (isProtectedPath(pathname)) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (!preCourseCompleted) {
      return NextResponse.redirect(new URL("/register", request.url));
    }
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // Trigger middleware for all routes except static resource folders
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};