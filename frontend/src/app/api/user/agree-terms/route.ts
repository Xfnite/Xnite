import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withRateLimit } from "@/lib/rateLimit";
import { verifySessionToken } from "@/lib/jwt";

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const sessionToken = request.cookies.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;

    if (!sessionEmail) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (user.hasAgreedToTerms) {
      return NextResponse.json({ success: true, message: "Already agreed" });
    }

    // Update user
    await prisma.user.update({
      where: { email: sessionEmail },
      data: { hasAgreedToTerms: true },
    });

    // Create welcome announcement in DirectMessage
    // Lines stay flush left: messages render with whitespace kept, so any indent here shows up.
    // **text** renders bold in the announcement views.
    const termsMessage = `**Welcome to Xfnite!**

Before you begin working on the platform, please take a moment to understand the following:

**Platform & Processing Fees**
Xfnite has operated with platform and processing fees since 2017. Platform fees (4%) help cover development and platform maintenance, while processing fees (12% + fixed $2) cover the costs and risks associated with handling payments. These fees help us maintain the platform and continue providing job opportunities to thousands of labelers.

**About Benchmark Rates**
Xfnite only pays for correctly completed work, as stated in our Rules & Guidelines. Your benchmark rate may start lower while the system evaluates your work and accuracy.

If your current rate does not meet your expectations, you are free to stop and explore other opportunities. However, if you continue improving your accuracy and consistency, your rate may improve over time. Many labelers have increased their rates through experience, and some have been working with us for years.

By clicking “Agree & Continue,” you acknowledge that you have read and understood these guidelines, including the platform and processing fees and the benchmark-rate system.

Thank you for being part of Xfnite.`;

    // The "Welcome to Xfnite" popup they just agreed to, kept in the bell ahead of the terms
    // message. Already read, so it isn't popped up again.
    await prisma.directMessage.create({
      data: {
        toEmail: sessionEmail,
        fromName: "Xfnite System",
        subject: "Welcome to Xfnite",
        message: termsMessage,
        isRead: true,
      },
    });

    const welcomeMessage = await prisma.directMessage.create({
      data: {
        toEmail: sessionEmail,
        fromName: "Xfnite System",
        subject: "Welcome to Xfnite - Platform Terms & Guidelines",
        message: termsMessage,
        isRead: false,
      },
    });

    // Returned so the open page can show it right away; this route can't reach the socket server
    return NextResponse.json({ success: true, message: welcomeMessage });
  } catch (err) {
    console.error("POST Agree Terms error:", err);
    return NextResponse.json(
      { success: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
});
