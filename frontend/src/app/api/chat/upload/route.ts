import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/jwt";
import { prisma } from "@/lib/db";
import { uploadChatImageToR2 } from "@/lib/r2";
import { withRateLimit } from "@/lib/rateLimit";
import { toUserFacingError } from "@/lib/userFacingError";

export const runtime = "nodejs";

export const POST = withRateLimit(
  async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("xnite_session")?.value;
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "Unauthorized: Missing session token" }, { status: 401 });
    }

    const email = await verifySessionToken(sessionToken);
    if (!email) {
      return NextResponse.json({ success: false, error: "Unauthorized: Invalid session" }, { status: 401 });
    }

    // 2. Validate role from DB
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { role: true },
    });

    const role = user?.role?.trim()?.toLowerCase() || "";

    // 3. Extract file from multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    const isImageAllowedRole = ["admin", "judger", "checker", "recruiter"].includes(role);

    if (!isImageAllowedRole) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to upload images." },
        { status: 403 }
      );
    }

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    // 4. Validate file type and size (max 10MB)
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "Only image files are allowed" }, { status: 400 });
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // 5. Convert File to Buffer and upload to R2 with compression
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResult = await uploadChatImageToR2(buffer, file.name);

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { success: false, error: uploadResult.error || "Failed to upload to R2" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: uploadResult.url,
    });
  } catch (error: any) {
    console.error("[Chat Upload API Error]:", error);
    return NextResponse.json(
      { success: false, error: toUserFacingError(error, "Couldn't upload the file. Please try again.") },
      { status: 500 }
    );
  }
},
{
  limit: 10, // Max 10 image uploads
  windowSeconds: 60, // Per 60 seconds
}
);
