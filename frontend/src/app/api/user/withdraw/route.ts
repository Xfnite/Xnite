import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { withRateLimit } from "@/lib/rateLimit";
import { withIdempotency } from "@/lib/idempotency";
import { verifySessionToken } from "@/lib/jwt";
import { consumeOtpVerified, markOtpVerified } from "@/lib/otpVerification";
import { checkWithdrawEligibility } from "@/lib/withdrawEligibility";

// Lets the wallet page check eligibility when Withdraw is clicked, before the
// confirmation modal opens. POST below still enforces the same rules.
export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const sessionToken = request.cookies.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!sessionEmail) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const eligibility = await checkWithdrawEligibility(sessionEmail);
    if (!eligibility.ok) {
      return NextResponse.json({ success: false, error: eligibility.error }, { status: eligibility.status });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("GET Withdraw eligibility error:", err);
    return NextResponse.json({ success: false, error: "Unexpected server error" }, { status: 500 });
  }
});

export const POST = withRateLimit(withIdempotency(async (request: NextRequest) => {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    // Verify requesting user owns this email
    const sessionToken = request.cookies.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!sessionEmail || sessionEmail.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ success: false, error: "Unauthorized: email mismatch" }, { status: 403 });
    }

    const eligibility = await checkWithdrawEligibility(email);
    if (!eligibility.ok) {
      return NextResponse.json({ success: false, error: eligibility.error }, { status: eligibility.status });
    }
    const { currentIncome } = eligibility;

    // Withdrawals require the email OTP step the wallet page runs right before this call.
    if (!(await consumeOtpVerified(email, "withdraw"))) {
      return NextResponse.json({ success: false, otpRequired: true, error: "Please verify the OTP sent to your email before withdrawing." }, { status: 403 });
    }

    const amountPaid = currentIncome.estimatedAmount;

    // Claim the balance atomically: only zero it if it still holds the amount and
    // status we validated above. A second concurrent request (double-click, two tabs)
    // or a salary push/blacklist landing mid-request matches no row, so it can't
    // create a second IncomeHistory claim for the same balance.
    let claimed: boolean;
    try {
      claimed = await prisma.$transaction(async (tx) => {
        const { count } = await tx.currentIncome.updateMany({
          where: { email, estimatedAmount: amountPaid, status: currentIncome.status },
          data: {
            estimatedAmount: 0,
            status: "Sending",
            rawComputation: Prisma.DbNull,
          }
        });
        if (count === 0) return false;

        await tx.incomeHistory.create({
          data: {
            id: crypto.randomUUID(),
            email: email,
            amountPaid: amountPaid,
            status: "Sending",
            rawComputation: currentIncome.rawComputation === null ? undefined : currentIncome.rawComputation,
          }
        });
        return true;
      });
    } catch (err) {
      // The withdrawal failed after the OTP pass was used up. Hand it back so the retry
      // doesn't need another code; the status and balance checks above still stop a
      // second withdrawal if the first one did go through.
      await markOtpVerified(email, "withdraw").catch(() => {});
      throw err;
    }

    if (!claimed) {
      // Nothing was withdrawn, so hand the OTP pass back — the retry this message asks
      // for shouldn't need a second code.
      await markOtpVerified(email, "withdraw");
      return NextResponse.json(
        { success: false, error: "Your balance changed or a withdrawal is already in progress. Please refresh and try again." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Withdrawal successful",
      data: { withdrawnAmount: amountPaid }
    });
  } catch (err) {
    console.error("POST Withdraw error:", err);
    return NextResponse.json(
      { success: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}));
