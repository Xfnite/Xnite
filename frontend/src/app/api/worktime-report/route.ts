import { NextResponse, NextRequest } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { verifySessionToken } from "@/lib/jwt";

// Bitmap's async worktime report lands in this bucket as a presigned CSV link.
// The browser can't read it directly (no CORS), so we fetch it here. Only this
// host is allowed so the route can't be used to fetch arbitrary URLs.
const ALLOWED_HOST = "alpaca-async-task.s3.amazonaws.com";

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const sessionToken = request.cookies.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!sessionEmail) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const { url } = await request.json();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid report URL" }, { status: 400 });
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== ALLOWED_HOST) {
      return NextResponse.json({ success: false, error: "Invalid report URL" }, { status: 400 });
    }

    const res = await fetch(parsed.toString());
    if (!res.ok) {
      return NextResponse.json({ success: false, error: "Failed to fetch worktime report" }, { status: 502 });
    }
    const csv = await res.text();
    return NextResponse.json({ success: true, csv });
  } catch (error) {
    console.error("[worktime-report] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch worktime report" }, { status: 500 });
  }
});
