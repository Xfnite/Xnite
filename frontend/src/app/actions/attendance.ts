"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { isApplicant, isStaff } from "@/config/permissions";
import { verifySessionToken } from "@/lib/jwt";
import { toUserFacingError } from "@/lib/userFacingError";

async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("xnite_session")?.value;
  return sessionToken ? await verifySessionToken(sessionToken) : null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "meeting";
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const slug = `${base}-${suffix}`;
    const existing = await prisma.attendance.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function getAttendanceDataAction() {
  try {
    const email = await getSessionEmail();
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!currentUser) {
      return { success: false, error: "User not found" };
    }

    if (isApplicant(currentUser.role)) {
      return { success: false, error: "Unauthorized. Applicants cannot access attendance." };
    }
    const isAdminOrJudger = isStaff(currentUser.role) && (currentUser.role?.toLowerCase() === "admin" || currentUser.role?.toLowerCase() === "judger");

    // Fetch all attendance sessions
    const meetings = await prisma.attendance.findMany({
      orderBy: { date: "desc" },
      include: {
        attendances: true,
      },
    });

    // Fetch email -> gingerEmail mapping
    const users = await prisma.user.findMany({
      select: { email: true, gingerEmail: true }
    });
    const emailToGingerEmailMap = new Map(
      users.map((u) => [u.email.toLowerCase(), u.gingerEmail || ""])
    );

    // Format meetings list securely
    const formattedMeetings = meetings.map((meeting) => {
      const hasAttended = meeting.attendances.some(
        (a) => a.userEmail.toLowerCase() === email.toLowerCase()
      );
      
      const userAttendanceRecord = meeting.attendances.find(
        (a) => a.userEmail.toLowerCase() === email.toLowerCase()
      );

      return {
        id: meeting.id,
        title: meeting.title,
        createdAt: meeting.createdAt,
        date: meeting.date,
        createdBy: meeting.createdBy,
        createdByEmail: meeting.createdByEmail,
        slug: meeting.slug,
        hasAttended,
        attendedAt: userAttendanceRecord?.attendedAt || null,
        // Hide password for labelers/checkers
        password: isAdminOrJudger ? meeting.password : null,
        // Hide entire attendee logs for labelers/checkers
        attendances: isAdminOrJudger
          ? meeting.attendances.map((a) => ({
              id: a.id,
              userName: a.userName,
              userEmail: a.userEmail,
              gingerUsername: a.gingerUsername,
              gingerEmail: emailToGingerEmailMap.get(a.userEmail.toLowerCase()) || "",
              facebook: a.facebook,
              attendedAt: a.attendedAt,
            }))
          : [],
        attendeeCount: meeting.attendances.length,
      };
    });

    return {
      success: true,
      currentUser: {
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
        isAdminOrJudger,
      },
      meetings: formattedMeetings,
    };
  } catch (error: any) {
    console.error("getAttendanceDataAction error:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't load attendance data. Please try again.") };
  }
}

export async function createMeetingAction(title: string, password: string, date?: string | Date) {
  try {
    const email = await getSessionEmail();
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true, name: true },
    });

    const role = currentUser?.role?.toLowerCase();
    if (role !== "admin" && role !== "judger") {
      return { success: false, error: "Unauthorized. Admins or Judgers only." };
    }

    if (!title?.trim() || !password?.trim()) {
      return { success: false, error: "Title and passcode are required." };
    }

    const slug = await generateUniqueSlug(title.trim());

    const newMeeting = await prisma.attendance.create({
      data: {
        title: title.trim(),
        password: password.trim(),
        date: date ? new Date(date) : undefined,
        createdBy: currentUser?.name || email.split("@")[0],
        createdByEmail: email,
        slug,
      },
    });

    // revalidatePath("/attendance");
    return { success: true, meeting: newMeeting };
  } catch (error: any) {
    console.error("createMeetingAction error:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't create meeting. Please try again.") };
  }
}

export async function deleteMeetingAction(meetingId: string) {
  try {
    const email = await getSessionEmail();
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });

    const role = currentUser?.role?.toLowerCase();
    if (role !== "admin" && role !== "judger") {
      return { success: false, error: "Unauthorized. Admins or Judgers only." };
    }

    const meeting = await prisma.attendance.findUnique({
      where: { id: meetingId },
      select: { createdByEmail: true, createdBy: true },
    });

    if (!meeting) {
      return { success: false, error: "Attendance session not found." };
    }

    const creatorEmail = meeting.createdByEmail || meeting.createdBy;

    if (creatorEmail && creatorEmail.toLowerCase() !== email.toLowerCase()) {
      return { success: false, error: "Unauthorized. Only the creator of this session can delete it." };
    }

    await prisma.attendance.delete({
      where: { id: meetingId },
    });

    // revalidatePath("/attendance");
    return { success: true };
  } catch (error: any) {
    console.error("deleteMeetingAction error:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't delete meeting. Please try again.") };
  }
}

export async function getMeetingBySlugAction(slug: string) {
  try {
    const email = await getSessionEmail();
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const meeting = await prisma.attendance.findUnique({
      where: { slug },
      include: { attendances: true },
    });

    if (!meeting) {
      return { success: false, error: "Attendance session not found." };
    }

    const userAttendanceRecord = meeting.attendances.find(
      (a) => a.userEmail.toLowerCase() === email.toLowerCase()
    );

    const creatorEmail = meeting.createdByEmail || meeting.createdBy;
    const isOwner = !!creatorEmail && creatorEmail.toLowerCase() === email.toLowerCase();

    return {
      success: true,
      meeting: {
        id: meeting.id,
        title: meeting.title,
        date: meeting.date,
        hasAttended: !!userAttendanceRecord,
        attendedAt: userAttendanceRecord?.attendedAt || null,
        isOwner,
      },
    };
  } catch (error: any) {
    console.error("getMeetingBySlugAction error:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't load attendance session. Please try again.") };
  }
}

export async function markAttendanceAction(meetingId: string, password: string) {
  try {
    const email = await getSessionEmail();
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { name: true, gingerUsername: true, facebook: true },
    });

    if (!currentUser) {
      return { success: false, error: "User not found" };
    }

    const meeting = await prisma.attendance.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return { success: false, error: "Meeting not found" };
    }

    // Passcode check (trimmed comparison)
    if (meeting.password.trim() !== password.trim()) {
      return { success: false, error: "Incorrect passcode. Please try again." };
    }

    // Check if already marked
    const existing = await prisma.attendanceSession.findUnique({
      where: {
        meetingId_userEmail: {
          meetingId,
          userEmail: email,
        },
      },
    });

    if (existing) {
      return { success: true, message: "Already marked as attended." };
    }

    await prisma.attendanceSession.create({
      data: {
        meetingId,
        userEmail: email,
        userName: currentUser.name || email.split("@")[0],
        gingerUsername: currentUser.gingerUsername || null,
        facebook: currentUser.facebook || null,
      },
    });

    // revalidatePath("/attendance");
    return { success: true };
  } catch (error: any) {
    console.error("markAttendanceAction error:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't mark attendance. Please try again.") };
  }
}

export async function updateMeetingAction(
  meetingId: string,
  title: string,
  password: string,
  date?: string | Date
) {
  try {
    const email = await getSessionEmail();
    if (!email) {
      return { success: false, error: "Not authenticated" };
    }

    const currentUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });

    const role = currentUser?.role?.toLowerCase();
    if (role !== "admin" && role !== "judger") {
      return { success: false, error: "Unauthorized. Admins or Judgers only." };
    }

    if (!title?.trim() || !password?.trim()) {
      return { success: false, error: "Title and passcode are required." };
    }

    const meeting = await prisma.attendance.findUnique({
      where: { id: meetingId },
      select: { createdByEmail: true, createdBy: true },
    });

    if (!meeting) {
      return { success: false, error: "Attendance session not found." };
    }

    const creatorEmail = meeting.createdByEmail || meeting.createdBy;

    if (creatorEmail && creatorEmail.toLowerCase() !== email.toLowerCase()) {
      return { success: false, error: "Unauthorized. Only the creator of this session can edit it." };
    }

    const updatedMeeting = await prisma.attendance.update({
      where: { id: meetingId },
      data: {
        title: title.trim(),
        password: password.trim(),
        date: date ? new Date(date) : undefined,
      },
    });

    // revalidatePath("/attendance");
    return { success: true, meeting: updatedMeeting };
  } catch (error: any) {
    console.error("updateMeetingAction error:", error);
    return { success: false, error: toUserFacingError(error, "Couldn't update session. Please try again.") };
  }
}
