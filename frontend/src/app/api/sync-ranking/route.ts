import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidateTag } from "next/cache";

interface RankingRow {
  email: string;
  username: string;
  balance: number;
  rank: number;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rows: RankingRow[];
  try {
    const body = await req.json();
    rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Sort by balance descending and assign rank dynamically
  const ranked = [...rows]
    .sort((a, b) => b.balance - a.balance)
    .map((r, i) => ({
      email:    r.email,
      username: r.username,
      balance:  r.balance,
      rank:     i + 1,
    }));

  try {
    const result = await prisma.$transaction([
      prisma.ranking.deleteMany(),
      prisma.ranking.createMany({ data: ranked }),
    ]);
    console.log("Transaction result:", JSON.stringify(result));
    
    try {
      revalidateTag("user-rankings", "max");
      console.log("[Cache] Invalidated user-rankings cache");
    } catch (e) {
      console.error("Failed to revalidate user-rankings:", e);
    }
  } catch (err) {
    console.error("Transaction error:", err);
    return NextResponse.json({ error: "DB error", detail: String(err) }, { status: 500 });
  }

  return NextResponse.json({ synced: rows.length });
}
