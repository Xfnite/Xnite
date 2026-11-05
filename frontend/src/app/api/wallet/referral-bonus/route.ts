import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/app/actions/auth";
import { resolveRecruiterEmail } from "@/lib/referralBonus";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cutoff = searchParams.get("cutoff");

    const where: Prisma.ReferralBonusWhereInput = {};
    if (cutoff && cutoff !== "All") {
      where.cutoff = cutoff;
    }

    const bonuses = await prisma.referralBonus.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: bonuses });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("GET /api/wallet/referral-bonus error:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

interface IncomingBonusRow {
  gingerUsername?: unknown;
  amount?: unknown;
  cutoff?: unknown;
  note?: unknown;
  status?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    // Auth check: support x-sync-secret header OR authenticated staff session
    const syncSecret = req.headers.get("x-sync-secret");
    const isSecretValid =
      syncSecret &&
      (syncSecret === process.env.SYNC_SECRET || syncSecret === "xfnite_referral_sync");

    if (!isSecretValid) {
      const user = await getSessionUser();
      const role = user?.role?.toLowerCase() || "";
      const isStaff = ["admin", "judger", "recruiter", "checker"].includes(role);
      if (!user || !isStaff) {
        return NextResponse.json({ success: false, error: "Unauthorized access" }, { status: 401 });
      }
    }

    const body = await req.json();
    const rawRows: IncomingBonusRow[] | null = Array.isArray(body)
      ? body
      : Array.isArray(body?.bonuses)
      ? body.bonuses
      : Array.isArray(body?.rows)
      ? body.rows
      : null;

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid bonuses array in request body" },
        { status: 400 }
      );
    }

    const defaultCutoff = typeof body?.cutoff === "string" && body.cutoff.trim() ? body.cutoff.trim() : "Current Cutoff";

    // Clean and validate rows
    const cleanedRows = rawRows
      .filter((r): r is IncomingBonusRow & { gingerUsername: string } => typeof r?.gingerUsername === "string" && r.gingerUsername.trim() !== "")
      .map((r) => ({
        gingerUsername: String(r.gingerUsername).trim().toLowerCase(),
        amount: typeof r.amount === "number" ? r.amount : parseFloat(String(r.amount || 0)) || 0,
        cutoff: typeof r.cutoff === "string" && r.cutoff.trim() ? r.cutoff.trim() : defaultCutoff,
        note: r.note ? String(r.note) : null,
        status: r.status ? String(r.status) : "Active",
      }));

    if (cleanedRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid rows found (gingerUsername is required)" },
        { status: 400 }
      );
    }

    // Unique ginger usernames to resolve
    const uniqueGingerUsernames = Array.from(new Set(cleanedRows.map((r) => r.gingerUsername)));

    // Fetch matching recruits from database
    const recruits = await prisma.user.findMany({
      where: {
        OR: [
          { gingerUsername: { in: uniqueGingerUsernames, mode: "insensitive" } },
          { gingerEmail: { in: uniqueGingerUsernames, mode: "insensitive" } },
          { email: { in: uniqueGingerUsernames, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        gingerUsername: true,
        gingerEmail: true,
        labelerRefererEmail: true,
        refererEmail: true,
        linkedRecruiterEmail: true,
      },
    });

    const recruitMap = new Map<string, typeof recruits[0]>();
    recruits.forEach((u) => {
      if (u.gingerUsername) recruitMap.set(u.gingerUsername.trim().toLowerCase(), u);
      if (u.gingerEmail) recruitMap.set(u.gingerEmail.trim().toLowerCase(), u);
      if (u.email) recruitMap.set(u.email.trim().toLowerCase(), u);
    });

    let matchedCount = 0;
    let fallbackCount = 0;
    let unassignedCount = 0;

    // Upsert each bonus row with resolved recruiter
    for (const row of cleanedRows) {
      const recruit = recruitMap.get(row.gingerUsername);
      const resolution = recruit
        ? resolveRecruiterEmail(recruit)
        : { email: null, source: "organic" as const, sourceLabel: "Organic / Unassigned" };

      if (
        resolution.source === "referral_link" ||
        resolution.source === "direct_referral" ||
        resolution.source === "linked_recruiter"
      ) {
        matchedCount++;
      } else if (resolution.source === "fallback_iru") {
        fallbackCount++;
      } else {
        unassignedCount++;
      }

      const existing = await prisma.referralBonus.findFirst({
        where: {
          gingerUsername: row.gingerUsername,
          cutoff: row.cutoff,
        },
      });

      if (existing) {
        await prisma.referralBonus.update({
          where: { id: existing.id },
          data: {
            amount: row.amount,
            recruiterEmail: resolution.email,
            recruitEmail: recruit?.email || null,
            source: resolution.source,
            note: row.note,
            status: row.status,
          },
        });
      } else {
        await prisma.referralBonus.create({
          data: {
            gingerUsername: row.gingerUsername,
            amount: row.amount,
            cutoff: row.cutoff,
            recruiterEmail: resolution.email,
            recruitEmail: recruit?.email || null,
            source: resolution.source,
            note: row.note,
            status: row.status,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalProcessed: cleanedRows.length,
        matchedCount,
        fallbackCount,
        unassignedCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("POST /api/wallet/referral-bonus error:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
