import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidateTag } from "next/cache";

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
      return NextResponse.json({ error: "Invalid body. Expected an array of rankings." }, { status: 400 });
    }

    // Validate array structure
    for (const item of body) {
      if (
        typeof item.email !== "string" ||
        typeof item.username !== "string" ||
        typeof item.balance !== "number" ||
        typeof item.rank !== "number"
      ) {
        return NextResponse.json(
          { error: "Invalid item format. Must include email (string), username (string), balance (number), and rank (number)." },
          { status: 400 }
        );
      }
    }

    // Filter duplicates: keep only the first occurrence of each unique email (case-insensitive)
    const uniqueRankings = [];
    const seenEmails = new Set<string>();

    for (const item of body) {
      const emailLower = item.email.trim().toLowerCase();
      if (!seenEmails.has(emailLower)) {
        seenEmails.add(emailLower);
        uniqueRankings.push({
          email: emailLower,
          username: item.username,
          balance: item.balance,
          rank: item.rank,
        });
      }
    }

    // Overwrite the rankings table transactionally
    await prisma.$transaction([
      prisma.ranking.deleteMany({}),
      prisma.ranking.createMany({
        data: uniqueRankings,
      }),
    ]);

    try {
      revalidateTag("user-rankings", "max");
      console.log("[Cache] Invalidated user-rankings cache");
    } catch (e) {
      console.error("Failed to revalidate user-rankings:", e);
    }

    return NextResponse.json({ success: true, count: uniqueRankings.length });
  } catch (error: any) {
    console.error("Error in ranking update API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
