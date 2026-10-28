"use server";

import { prisma } from "@/lib/db";
import { getAuthedUser } from "@/lib/authGuard";

export async function getSystemSetting(key: string, defaultValue: string = "") {
  try {
    if (!(await getAuthedUser())) return defaultValue;
    const setting = await prisma.systemSetting.findUnique({
      where: { key },
    });
    return setting ? setting.value : defaultValue;
  } catch (error) {
    console.error(`Error fetching system setting ${key}:`, error);
    return defaultValue;
  }
}
