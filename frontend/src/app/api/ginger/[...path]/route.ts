import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { forceGingerLoginAction } from "@/app/actions/auth";
import { verifySessionToken } from "@/lib/jwt";
import { isDemoGingerEmail, gingerDemoResponse } from "@/lib/gingerDemo";

// Server-side proxy for the Ginger annotation API. The browser calls
// /api/ginger/<endpoint> on our own origin; this handler adds the token from
// the httpOnly ginger_access_token cookie and forwards the request to Ginger.
// Keeping it server-side means the browser never contacts Ginger directly for
// these calls (no Origin/Referer, no token exposed to JS).

// Prisma + cookies() require the Node.js runtime.
export const runtime = "nodejs";

const GINGER_BASE = process.env.GINGER_API_URL || "https://ginger.bitmappro.com";

// Only these upstream endpoints may be reached through this proxy. Without an
// allow-list this route would relay any path to Ginger.
const ALLOWED = new Set([
  "bac/mapping/annotate/list-ongoing-projects-for-annotator",
  "bac/mapping/annotate/list-projects-with-statistics",
  "bac/mapping/annotate/detail-annotate-statistics",
  "bac/mapping/annotate/training-annotate/list-ongoing-projects",
  "bac/mapping/annotate/training-annotate/update-user-training-status",
  "bac/mapping/annotate/register-worktime",
  // Recruiter group view + worktime report
  "bac/eam/koala/koala-group/group/detail",
  "bac/mapping/annotate/performance/async_download_work_time_table",
  "bac/async_task/api_request/get_result",
]);

const TIMEOUT_MS = 20_000;

async function callGinger(endpoint: string, token: string, body: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${GINGER_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const endpoint = path.join("/");
  if (!ALLOWED.has(endpoint)) {
    return NextResponse.json({ error: "Endpoint not allowed" }, { status: 403 });
  }

  const cookieStore = await cookies();

  // Demo/stub account: serve stateful canned data and make NO request to Ginger.
  // Only the session lookup is guarded; once we know it's the demo account we
  // always answer locally so the request can never fall through to Ginger.
  let sessionEmail: string | null = null;
  try {
    const sessionToken = cookieStore.get("xnite_session")?.value;
    sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
  } catch {
    sessionEmail = null;
  }
  if (isDemoGingerEmail(sessionEmail)) {
    const demoBody = await req.text();
    return NextResponse.json(await gingerDemoResponse(endpoint, sessionEmail as string, demoBody), { status: 200 });
  }

  let token = cookieStore.get("ginger_access_token")?.value || null;

  // No cookie yet (first call after login, or it expired): mint one from the
  // user's stored Ginger credentials, the same way the client used to.
  if (!token) {
    const refreshed = await forceGingerLoginAction();
    if (!refreshed.success || !refreshed.token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    token = refreshed.token;
  }

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.text();

  let res: Response;
  try {
    res = await callGinger(endpoint, token, body);
  } catch {
    return NextResponse.json({ error: "Upstream request failed" }, { status: 502 });
  }

  // Token expired mid-session: re-login once and retry.
  if (res.status === 401 || res.status === 403) {
    const refreshed = await forceGingerLoginAction();
    if (refreshed.success && refreshed.token) {
      try {
        res = await callGinger(endpoint, refreshed.token, body);
      } catch {
        return NextResponse.json({ error: "Upstream request failed" }, { status: 502 });
      }
    }
  }

  // Pass Ginger's body and status straight through so callers that check
  // response.ok / result.code / result.errcode behave exactly as before.
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
