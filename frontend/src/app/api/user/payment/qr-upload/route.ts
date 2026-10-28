import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/jwt";
import { uploadQrToR2 } from "@/lib/r2";
import { withRateLimit } from "@/lib/rateLimit";
import { toUserFacingError } from "@/lib/userFacingError";

export const runtime = "nodejs";

export const POST = withRateLimit(
  async function POST(req: NextRequest) {
    try {
      // 1. Authenticate user (any authenticated role can upload their own QR)
      const cookieStore = await cookies();
      const sessionToken = cookieStore.get("xnite_session")?.value;
      if (!sessionToken) {
        return NextResponse.json({ success: false, error: "Unauthorized: Missing session token" }, { status: 401 });
      }

      const email = await verifySessionToken(sessionToken);
      if (!email) {
        return NextResponse.json({ success: false, error: "Unauthorized: Invalid session" }, { status: 401 });
      }

      // 2. Extract file from multipart form data
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
      }

      // 3. Validate file type and size (max 5MB for QR codes)
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ success: false, error: "Only image files are allowed" }, { status: 400 });
      }

      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { success: false, error: "File size exceeds 5MB limit" },
          { status: 400 }
        );
      }

      // 4. Convert File to Buffer and upload to R2
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadResult = await uploadQrToR2(buffer, file.name);

      if (!uploadResult.success || !uploadResult.url) {
        return NextResponse.json(
          { success: false, error: uploadResult.error || "Failed to upload QR code to R2" },
          { status: 500 }
        );
      }

      // 5. Fire-and-forget backup to Google Drive via n8n webhook (server-side to avoid CORS)
      const webhookUrl = process.env.UPLOAD_QR;
      if (webhookUrl) {
        const backupForm = new FormData();
        backupForm.append("payload", new Blob([buffer], { type: file.type }), file.name);
        backupForm.append("name", `${email}-${new Date().toISOString()}`);
        fetch(webhookUrl, { method: "POST", body: backupForm })
          .then(() => console.log(`[QR Backup] Sent to Google Drive for ${email}`))
          .catch((err) => console.error("[QR Backup] Google Drive webhook failed:", err?.message));
      }

      return NextResponse.json({
        success: true,
        url: uploadResult.url,
      });
    } catch (error: any) {
      console.error("[QR Upload API Error]:", error);
      return NextResponse.json(
        { success: false, error: toUserFacingError(error, "Couldn't upload the QR image. Please try again.") },
        { status: 500 }
      );
    }
  },
  {
    limit: 5, // Max 5 QR uploads
    windowSeconds: 60, // Per 60 seconds
  }
);
