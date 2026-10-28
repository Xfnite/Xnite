import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withRateLimit } from "@/lib/rateLimit";
import { getAuthedUser } from "@/lib/authGuard";
import crypto from 'crypto';

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    // ?keys=a,b,c reads several settings in one request: { success, values: { a: "...", b: null } }
    const keysParam = searchParams.get("keys");
    if (keysParam) {
      const keys = Array.from(new Set(keysParam.split(",").map((k) => k.trim()).filter(Boolean)));
      if (keys.length === 0 || keys.length > 20) {
        return NextResponse.json({ success: false, error: "Between 1 and 20 keys are required" }, { status: 400 });
      }
      const rows = await prisma.systemSetting.findMany({
        where: { key: { in: keys } },
        select: { key: true, value: true },
      });
      const values: Record<string, string | null> = Object.fromEntries(keys.map((k) => [k, null]));
      rows.forEach((r) => { values[r.key] = r.value || null; });
      return NextResponse.json({ success: true, values });
    }

    if (!key) {
      return NextResponse.json({ success: false, error: "Key is required" }, { status: 400 });
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { key },
    });

    return NextResponse.json({ success: true, value: setting?.value || null });
  } catch (error) {
    console.error("GET SystemSetting error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
});

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    // Settings control salaries/withdrawals for everyone — only admins (the /wallet/restrict page) may change them.
    const user = await getAuthedUser();
    if (!user || user.role?.trim().toLowerCase() !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { key, value } = await request.json();

    if (!key || typeof value !== "string") {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: {
        id: crypto.randomUUID(),
        key,
        value,
      },
    });

    return NextResponse.json({ success: true, setting });
  } catch (error) {
    console.error("POST SystemSetting error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
});
