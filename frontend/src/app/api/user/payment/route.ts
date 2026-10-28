import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withRateLimit } from "@/lib/rateLimit";
import { withIdempotency } from "@/lib/idempotency";
import { verifySessionToken } from "@/lib/jwt";
import { consumeOtpVerified } from "@/lib/otpVerification";

async function resolveToPrimaryEmail(inputEmail: string): Promise<string> {
  if (!inputEmail) return "";
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: inputEmail.toLowerCase() },
          { gingerEmail: inputEmail.toLowerCase() }
        ]
      },
      select: {
        email: true
      }
    });
    return user?.email || inputEmail;
  } catch (err) {
    console.error("resolveToPrimaryEmail failed:", err);
    return inputEmail;
  }
}

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const resolvedEmail = await resolveToPrimaryEmail(email);

    const paymentDetails = await prisma.paymentDetails.findUnique({
      where: { email: resolvedEmail },
    });

    return NextResponse.json({ success: true, data: paymentDetails });
  } catch (err) {
    console.error("GET Payment Details error:", err);
    return NextResponse.json(
      { success: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
});

export const POST = withRateLimit(withIdempotency(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { email, payeeName, lastName, payeeUid, paymentMethod, qrImageUrl } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const resolvedEmail = await resolveToPrimaryEmail(email);

    // Verify requesting user owns this email
    const sessionToken = request.cookies.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!sessionEmail || (sessionEmail.toLowerCase() !== email.toLowerCase() && sessionEmail.toLowerCase() !== resolvedEmail.toLowerCase())) {
      return NextResponse.json({ success: false, error: "Unauthorized: email mismatch" }, { status: 403 });
    }

    const userRecord = await prisma.user.findUnique({
      where: { email: resolvedEmail },
      select: { lastName: true }
    });

    const registeredLastName = userRecord?.lastName || "";
    if (!lastName) {
      return NextResponse.json({ success: false, error: "Last name is required." }, { status: 400 });
    }
    
    if (registeredLastName && lastName.trim().toLowerCase() !== registeredLastName.trim().toLowerCase()) {
      return NextResponse.json({ success: false, error: "Last name must match your registered last name." }, { status: 400 });
    }

    const existing = await prisma.paymentDetails.findUnique({
      where: { email: resolvedEmail }
    });

    if (existing) {
      const timeSinceUpdate = Date.now() - new Date(existing.updatedAt).getTime();
      const fiveMinutes = 5 * 60 * 1000;
      if (timeSinceUpdate < fiveMinutes) {
        const remainingMinutes = Math.ceil((fiveMinutes - timeSinceUpdate) / 60000);
        return NextResponse.json({ 
          success: false, 
          error: `You can only change your payment method every 5 minutes. Please try again in ${remainingMinutes} minute(s).` 
        }, { status: 429 });
      }
    }

    // Require changing QR code if user changes any payment details (name or number or method)
    const isNameChanged = Boolean(
      existing && (
        (payeeName && payeeName.trim().toLowerCase() !== (existing.payeeName || "").trim().toLowerCase()) ||
        (lastName && lastName.trim().toLowerCase() !== (existing.lastName || "").trim().toLowerCase())
      )
    );
    const isNumberChanged = Boolean(
      existing && payeeUid && payeeUid.trim() !== (existing.payeeUid || "").trim()
    );
    const isMethodChanged = Boolean(
      existing && paymentMethod && paymentMethod.trim() !== (existing.paymentMethod || "").trim()
    );
    const hasDetailsChanged = isNameChanged || isNumberChanged || isMethodChanged;

    if (existing && hasDetailsChanged) {
      if (!qrImageUrl || qrImageUrl === existing.qrImageUrl) {
        return NextResponse.json({
          success: false,
          error: "A new QR code is required whenever you change your payment details (name or number), as it is the primary mode of sending salaries."
        }, { status: 400 });
      }
    }

    if (!qrImageUrl && !existing?.qrImageUrl) {
      return NextResponse.json({ success: false, error: "QR code image is required to save payment details." }, { status: 400 });
    }

    // Payout details may only change right after the email OTP step.
    if (!(await consumeOtpVerified(resolvedEmail))) {
      return NextResponse.json({ success: false, error: "Please verify the OTP sent to your email before saving payment details." }, { status: 403 });
    }

    const updated = await prisma.paymentDetails.upsert({
      where: { email: resolvedEmail },
      update: {
        payeeName,
        lastName,
        payeeUid,
        paymentMethod,
        ...(qrImageUrl !== undefined && { qrImageUrl }),
      },
      create: {
        email: resolvedEmail,
        payeeName,
        lastName,
        payeeUid,
        paymentMethod,
        qrImageUrl: qrImageUrl ?? null,
      },
    });

    if (existing) {
      const hasChanged = existing.payeeName !== payeeName || existing.lastName !== lastName || existing.payeeUid !== payeeUid || existing.paymentMethod !== paymentMethod || existing.qrImageUrl !== (qrImageUrl ?? existing.qrImageUrl);
      if (hasChanged) {
        await prisma.paymentMethodHistory.create({
          data: {
            email: resolvedEmail,
            oldPayeeName: existing.payeeName,
            oldLastName: existing.lastName,
            oldPayeeUid: existing.payeeUid,
            oldPaymentMethod: existing.paymentMethod,
            oldQrImageUrl: existing.qrImageUrl,
            newPayeeName: payeeName,
            newLastName: lastName,
            newPayeeUid: payeeUid,
            newPaymentMethod: paymentMethod,
            newQrImageUrl: qrImageUrl ?? existing.qrImageUrl,
          }
        });
      }
    } else {
      await prisma.paymentMethodHistory.create({
        data: {
          email: resolvedEmail,
          newPayeeName: payeeName,
          newLastName: lastName,
          newPayeeUid: payeeUid,
          newPaymentMethod: paymentMethod,
          newQrImageUrl: qrImageUrl ?? null,
        }
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("POST Payment Details error:", err);
    return NextResponse.json(
      { success: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}));
