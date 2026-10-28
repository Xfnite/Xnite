"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken } from "@/lib/jwt";
import { toUserFacingError } from "@/lib/userFacingError";

async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  return sessionToken ? await verifySessionToken(sessionToken) : null;
}

export async function getUserDetailsAction(senderNameOrEmail: string) {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true }
    });

    if (currentUser?.role?.toLowerCase() !== "admin") {
      return { success: false, error: "Unauthorized" };
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: senderNameOrEmail },
          { name: senderNameOrEmail }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        phone: true,
        facebook: true,
        isRegistered: true,
        isDashboardCompleted: true,
      }
    });

    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    return { success: true, user: targetUser };
  } catch (err: any) {
    console.error("getUserDetailsAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load user details. Please try again.") };
  }
}

export async function getChatRoomsListAction() {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true, team_id: true }
    });
    const role = currentUser?.role?.toLowerCase() || "";

    if (role !== "admin" && role !== "judger") {
      return { success: false, error: "Unauthorized" };
    }

    let whereClause: any = { status: "active" };
    if (role === "judger" && currentUser?.team_id) {
      whereClause = {
        status: "active",
        OR: [
          { parentGroupId: currentUser.team_id },
          { groupId: currentUser.team_id }
        ]
      };
    }

    const rooms = await prisma.group.findMany({
      where: whereClause,
      select: {
        groupId: true,
        groupName: true,
        groupType: true,
        logoUrl: true,
      },
      orderBy: { groupName: "asc" }
    });

    return { success: true, rooms };
  } catch (err: any) {
    console.error("getChatRoomsListAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load chat rooms. Please refresh the page.") };
  }
}

export async function getUserGroupNamesAction(groupId: number | null, teamId: number | null) {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const ids = [];
    if (groupId != null) ids.push(groupId);
    if (teamId != null) ids.push(teamId);

    if (ids.length === 0) return { success: true, groupName: null, teamName: null };

    const groups = await prisma.group.findMany({
      where: {
        groupId: { in: ids },
        status: "active"
      },
      select: { groupId: true, groupName: true, groupType: true, logoUrl: true, parentGroupId: true }
    });

    const groupRecord = groups.find(g => g.groupType === "group" || g.groupId === groupId);
    let teamRecord = groups.find(g => g.groupType === "team" || g.groupId === teamId);

    let parentTeamId = teamRecord?.groupId || null;
    let parentTeamName = teamRecord?.groupName || null;
    let parentTeamLogoUrl = teamRecord?.logoUrl || null;

    // Resolve checker parent team via DB relations if team is not set directly
    if (!teamRecord && groupRecord?.parentGroupId) {
      const pTeam = await prisma.group.findUnique({
        where: { groupId: groupRecord.parentGroupId },
        select: { groupId: true, groupName: true, logoUrl: true, status: true }
      });
      if (pTeam && pTeam.status === "active") {
        parentTeamId = pTeam.groupId;
        parentTeamName = pTeam.groupName;
        parentTeamLogoUrl = pTeam.logoUrl;
      }
    }

    return {
      success: true,
      groupName: groupRecord?.groupName || null,
      groupLogoUrl: groupRecord?.logoUrl || null,
      teamId: parentTeamId,
      teamName: parentTeamName,
      teamLogoUrl: parentTeamLogoUrl
    };
  } catch (err: any) {
    console.error("getUserGroupNamesAction error:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't load group names. Please refresh the page.") };
  }
}

export async function updateGroupLogoAction(groupId: number, logoUrl: string | null): Promise<{ success: boolean; error?: string }> {
  const email = await getSessionEmail();
  if (!email) return { success: false, error: "Not authenticated" };

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    const userRole = user?.role?.toLowerCase() || "";
    // Only checker, judger, recruiter, and admin can edit logo
    const allowed = ["admin", "checker", "judger", "recruiter"].includes(userRole);
    if (!allowed) {
      return { success: false, error: "You are not authorized to edit the group logo." };
    }

    await prisma.group.upsert({
      where: { groupId: Number(groupId) },
      update: { logoUrl },
      create: {
        groupId: Number(groupId),
        groupName: `Group #${groupId}`,
        logoUrl
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("updateGroupLogoAction failed:", err);
    return { success: false, error: toUserFacingError(err, "Couldn't update the group logo. Please try again.") };
  }
}



