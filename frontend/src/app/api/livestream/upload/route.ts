import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/jwt";
import { uploadVideoToR2 } from "@/lib/r2";
import { prisma, pool } from "@/lib/db";
import { isStaff } from "@/config/permissions";

export const runtime = "nodejs";

// Max 250MB for video audit checks
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "Unauthorized: Missing session token" }, { status: 401 });
    }

    const email = await verifySessionToken(sessionToken);
    if (!email) {
      return NextResponse.json({ success: false, error: "Unauthorized: Invalid session" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { email: true, name: true, role: true },
    });

    if (!user || !isStaff(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden: Only Checkers can upload video checks" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "Quality Audit Check";
    const projectType = (formData.get("projectType") as string) || "Standard Building";
    const durationSec = parseInt((formData.get("durationSec") as string) || "0", 10);
    const description = (formData.get("description") as string) || "";

    if (!file) {
      return NextResponse.json({ success: false, error: "No video file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadRes = await uploadVideoToR2(buffer, file.name, file.type || "video/webm");
    if (!uploadRes.success || !uploadRes.url) {
      return NextResponse.json({ success: false, error: uploadRes.error || "Failed to store video" }, { status: 500 });
    }

    // Save to database
    let recording: any;
    if ((prisma as any).checkRecording) {
      recording = await (prisma as any).checkRecording.create({
        data: {
          title,
          projectType,
          description: description || null,
          checkerEmail: user.email,
          checkerName: user.name || user.email.split("@")[0],
          videoUrl: uploadRes.url,
          durationSec,
          qualities: ["1080p", "720p", "360p"],
        },
      });
    } else {
      const insertQuery = `
        INSERT INTO "CheckRecording" 
          ("id", "title", "projectType", "description", "checkerEmail", "checkerName", "videoUrl", "durationSec", "qualities", "createdAt", "updatedAt")
        VALUES 
          (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *;
      `;
      const dbRes = await pool.query(insertQuery, [
        title,
        projectType,
        description || null,
        user.email,
        user.name || user.email.split("@")[0],
        uploadRes.url,
        durationSec,
        ["1080p", "720p", "360p"],
      ]);
      recording = dbRes.rows[0];
    }

    return NextResponse.json({ success: true, recording });
  } catch (error: any) {
    console.error("[Livestream Upload API] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to process video upload" }, { status: 500 });
  }
}

