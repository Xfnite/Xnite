import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    const configuredApiKey = process.env.N8N_API_KEY;

    if (!configuredApiKey) {
      console.error("N8N_API_KEY is not configured on the server.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    if (!apiKey || apiKey !== configuredApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid body. Expected an array of checkers." }, { status: 400 });
    }

    const uniqueRankings: {
      email: string;
      username: string;
      balance: number;
      rank: number;
    }[] = [];
    const seenEmails = new Set<string>();

    // Validate and parse array structure
    for (const item of body) {
      const email = typeof item.email === "string" ? item.email.trim() : "";
      const username = typeof item.username === "string" ? item.username.trim() : "";
      
      // Parse balance and rank support both numbers and numeric strings
      const balance = typeof item.balance === "number" ? item.balance : parseFloat(item.balance);
      const rank = typeof item.rank === "number" ? item.rank : parseInt(item.rank);

      if (!email || !username || isNaN(balance) || isNaN(rank)) {
        return NextResponse.json(
          { error: "Invalid item format. Must include email (string), username (string), balance (number), and rank (number)." },
          { status: 400 }
        );
      }

      const emailLower = email.toLowerCase();
      if (!seenEmails.has(emailLower)) {
        seenEmails.add(emailLower);
        uniqueRankings.push({
          email: emailLower,
          username,
          balance,
          rank,
        });
      }
    }

    // Overwrite the checkers rankings table transactionally
    await prisma.$transaction([
      prisma.checkerRanking.deleteMany({}),
      prisma.checkerRanking.createMany({
        data: uniqueRankings,
      }),
    ]);

    return NextResponse.json({ success: true, count: uniqueRankings.length });
  } catch (error: any) {
    console.error("Error in checkers ranking update API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
