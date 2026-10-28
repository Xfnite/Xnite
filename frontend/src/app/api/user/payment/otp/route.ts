import { NextResponse, NextRequest } from "next/server";
import dns from "dns";

if (process.env.NODE_ENV === "development") {
  dns.setDefaultResultOrder("ipv4first");
}
import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import { prisma } from "@/lib/db";
import { withRateLimit } from "@/lib/rateLimit";
import { withIdempotency } from "@/lib/idempotency";
import { verifySessionToken } from "@/lib/jwt";
import { sendSlackMessage } from "@/lib/slack";
import { markOtpVerified, hasOtpVerified, type OtpPurpose } from "@/lib/otpVerification";
import { storeOtp, hasPendingOtp, checkOtp } from "@/lib/otpStore";
import { beginOtpSend, finishOtpSend, formatWait } from "@/lib/otpSendLimit";
import { checkWithdrawEligibility } from "@/lib/withdrawEligibility";

const OTP_MAIL_TIMEOUT_MS = 15000; // stop waiting on the mail server after this long
const OTP_MAIL_TIMEOUT_MESSAGE = "SMTP send timed out";

// ─── Resolve Ginger Email Helper ───────────────────────────────────────────────
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

// ─── Route Handler ───────────────────────────────────────────────────────────

export const POST = withRateLimit(withIdempotency(async (request: NextRequest) => {
  try {
    const { action, email: requestEmail, otp, purpose } = await request.json();

    if (!requestEmail) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const email = await resolveToPrimaryEmail(requestEmail);
    const otpPurpose: OtpPurpose = purpose === "withdraw" ? "withdraw" : "payment";

    // Verify requesting user owns this email
    const sessionToken = request.cookies.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (!sessionEmail || (sessionEmail.toLowerCase() !== requestEmail.toLowerCase() && sessionEmail.toLowerCase() !== email.toLowerCase())) {
      return NextResponse.json({ success: false, error: "Unauthorized: email mismatch" }, { status: 403 });
    }

    // ── SEND OTP ────────────────────────────────────────────────────────────
    if (action === "send") {
      // Don't email an OTP (or use up a step of the wait ladder) for a withdrawal the
      // withdraw route would reject anyway. Same lookup key the withdraw route uses.
      if (otpPurpose === "withdraw") {
        const eligibility = await checkWithdrawEligibility(requestEmail);
        if (!eligibility.ok) {
          return NextResponse.json({ success: false, error: eligibility.error }, { status: eligibility.status });
        }
      }

      const existing = await prisma.paymentDetails.findUnique({
        where: { email }
      });

      if (existing) {
        const timeSinceUpdate = Date.now() - new Date(existing.updatedAt).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        if (timeSinceUpdate < fiveMinutes) {
          const remainingMinutes = Math.ceil((fiveMinutes - timeSinceUpdate) / 60000);
          return NextResponse.json({ 
            success: false, 
            error: otpPurpose === "withdraw"
              ? `You recently updated your payment details. For your security, please wait ${remainingMinutes} minute(s) before withdrawing.`
              : `You can only change your payment method every 5 minutes. Please try again in ${remainingMinutes} minute(s).` 
          }, { status: 429 });
        }
      }

      // A withdrawal OTP verified moments ago (e.g. the withdrawal then failed, or the
      // modal was closed) still authorizes one withdrawal — don't make the user get another.
      if (otpPurpose === "withdraw" && (await hasOtpVerified(email, otpPurpose))) {
        return NextResponse.json({ success: true, alreadyVerified: true });
      }

      // Anti-spam ladder: each OTP email makes the next one wait longer (see otpSendLimit).
      const sendCheck = await beginOtpSend(email, otpPurpose);
      if (!sendCheck.ok) {
        const { retryAfter } = sendCheck;
        if (sendCheck.busy) {
          return NextResponse.json({
            success: false,
            retryAfter,
            error: "An OTP is already being sent to your email. Please wait a moment."
          }, { status: 429 });
        }
        // The code already in their inbox still works; tell the client to ask for it
        // instead of leaving the user waiting with nowhere to enter it.
        if (await hasPendingOtp(email, otpPurpose)) {
          return NextResponse.json({
            success: false,
            otpPending: true,
            retryAfter,
            error: `An OTP was already sent to your email and is still valid. Enter that code to continue. You can request a new one in ${formatWait(retryAfter)}.`
          }, { status: 429 });
        }
        return NextResponse.json({
          success: false,
          retryAfter,
          error: `Please wait ${formatWait(retryAfter)} before requesting another OTP.`
        }, { status: 429 });
      }

      const generatedOtp = randomInt(100000, 1000000).toString();

      // Never write a live code to production logs.
      if (process.env.NODE_ENV === "development") {
        console.log(`[OTP GENERATED for ${email}]: ${generatedOtp}`);
      }

      const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
      const smtpPort = parseInt(process.env.SMTP_PORT || "465");
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      // Wait for the mail server's answer, so "OTP sent" is only said once it accepted the email.
      let delivered = false;
      if (smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
            tls: {
              rejectUnauthorized: false
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
          });

          await Promise.race([
            transporter.sendMail({
              from: `"Xfnite Support" <${smtpUser}>`,
              to: email,
              subject: "Your Xfnite OTP Code",
              html: `
                <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; border-radius: 8px;">
                  <h2 style="color: #1F7A1F; margin-bottom: 16px;">Xfnite Security Verification</h2>
                  <p>Hello,</p>
                  <p>${otpPurpose === "withdraw"
                    ? "We received a request to withdraw your salary. Please enter the following One-Time Password (OTP) to finish your withdrawal:"
                    : "We received a request to update your payment information. Please use the following One-Time Password (OTP) to complete this action:"}</p>
                  <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #0D1B2A; background-color: #ffffff; padding: 16px; border-radius: 6px; text-align: center; margin: 24px 0; border: 1px solid #e0e0e0;">
                    ${generatedOtp}
                  </div>
                  <p style="color: #666; font-size: 12px; margin-top: 24px;">This code is valid for 5 minutes and can only be used once. If you did not make this request, please secure your account immediately.</p>
                </div>
              `,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(OTP_MAIL_TIMEOUT_MESSAGE)), OTP_MAIL_TIMEOUT_MS)
            ),
          ]);
          delivered = true;
          console.log(`[OTP] Sent to ${email} via SMTP`);
        } catch (mailErr) {
          // Our own timer firing is not a refusal: the send is still running and the email
          // may yet arrive. Treat it as sent — keep the code valid and count it on the
          // ladder — otherwise slow mail would hand out uncounted emails with dead codes.
          if (mailErr instanceof Error && mailErr.message === OTP_MAIL_TIMEOUT_MESSAGE) {
            delivered = true;
          }
          console.error("[OTP] Failed to send email via SMTP:", mailErr);
          const env = process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "unknown";
          const domain = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "unknown domain";
          sendSlackMessage(`:warning: *OTP Email Delivery Failed*\n*Env:* \`${env}\`\n*Domain:* ${domain}\n*SMTP User:* ${smtpUser}\n*Target:* ${email}\n*Error:* \`${mailErr instanceof Error ? mailErr.message : String(mailErr)}\``);
        }
      } else {
        console.error("[OTP] SMTP credentials missing, cannot deliver OTP.");
      }

      if (!delivered) {
        if (process.env.NODE_ENV !== "development") {
          // Nothing reached the user, so this attempt doesn't count toward the wait before
          // the next OTP and they can retry at once. The new code was never stored, so a
          // code from an earlier email (a failed resend) still works.
          await finishOtpSend(email, otpPurpose, false);
          return NextResponse.json({ success: false, error: "We couldn't send the OTP email. Please try again in a moment." }, { status: 500 });
        }
        // In development the code stays valid — use the one logged above.
        console.warn("[OTP] Email not delivered (development): use the code logged above.");
      }

      // Stored only now, once the email is on its way: replacing the previous code
      // any earlier would kill it even when the new one never arrives.
      try {
        await storeOtp(email, generatedOtp, otpPurpose);
      } catch (storeErr) {
        // Don't leave the account locked against sending if the code couldn't be saved.
        await finishOtpSend(email, otpPurpose, false).catch(() => {});
        throw storeErr;
      }

      // Count this email and learn how long until the next one is allowed.
      const retryAfter = await finishOtpSend(email, otpPurpose, true);

      // OTP is only ever delivered via email — never expose it in the HTTP response
      return NextResponse.json({
        success: true,
        message: "OTP generated and sent",
        retryAfter
      });
    }

    // ── VERIFY OTP ──────────────────────────────────────────────────────────
    if (action === "verify") {
      if (!otp) {
        return NextResponse.json({ success: false, error: "OTP is required" }, { status: 400 });
      }

      const result = await checkOtp(email, otpPurpose, String(otp).trim());

      if (result === "expired") {
        return NextResponse.json(
          { success: false, otpExpired: true, error: "OTP has expired or was never requested. Please request a new one." },
          { status: 400 }
        );
      }

      if (result === "locked") {
        return NextResponse.json(
          { success: false, otpExpired: true, error: "Too many incorrect attempts. Please request a new OTP." },
          { status: 400 }
        );
      }

      if (result === "invalid") {
        // The code stays valid until its original expiry, so the user can retry.
        return NextResponse.json({ success: false, error: "Invalid OTP code" }, { status: 400 });
      }

      // ✅ Verified — already deleted by checkOtp. Record a one-time pass the
      // withdraw / payment-details routes require before they act.
      await markOtpVerified(email, otpPurpose);
      return NextResponse.json({ success: true, verified: true });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("OTP Route error:", err);
    return NextResponse.json({ success: false, error: "Unexpected server error" }, { status: 500 });
  }
}), { limit: 5, windowSeconds: 60 });
