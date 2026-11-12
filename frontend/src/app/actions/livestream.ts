"use server";

import { prisma, pool } from "@/lib/db";
import { getSessionUser } from "@/app/actions/auth";
import { isStaff } from "@/config/permissions";

export interface CheckRecordingInput {
  title: string;
  projectType: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSec?: number;
  qualities?: string[];
}

/**
 * Fetch all check recordings for the VOD Replay Library
 */
export async function getCheckRecordingsAction(projectType?: string) {
  try {
    if ((prisma as any).checkRecording) {
      const where: any = {};
      if (projectType && projectType !== "All") {
        where.projectType = projectType;
      }

      const recordings = await (prisma as any).checkRecording.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return { success: true, recordings };
    }

    // Direct fallback if Prisma client is stale in memory
    let query = 'SELECT * FROM "CheckRecording"';
    const params: any[] = [];
    if (projectType && projectType !== "All") {
      query += ' WHERE "projectType" = $1';
      params.push(projectType);
    }
    query += ' ORDER BY "createdAt" DESC';
    const res = await pool.query(query, params);
    return { success: true, recordings: res.rows };
  } catch (error: any) {
    console.error("[getCheckRecordingsAction] Error:", error);
    return { success: false, error: error.message || "Failed to fetch recordings." };
  }
}

/**
 * Save a newly recorded or uploaded check session to the database
 */
export async function createCheckRecordingAction(input: CheckRecordingInput) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return { success: false, error: "Unauthorized: Please log in." };
    }

    if (!isStaff(user.role)) {
      return { success: false, error: "Forbidden: Only Checkers and Staff can publish check recordings." };
    }

    const title = input.title?.trim() || "Quality Audit Check";
    const projectType = input.projectType || "Standard Building";
    const description = input.description?.trim() || null;
    const checkerEmail = user.email;
    const checkerName = user.name || user.email.split("@")[0];
    const videoUrl = input.videoUrl;
    const durationSec = input.durationSec || 0;
    const qualities = input.qualities && input.qualities.length > 0 ? input.qualities : ["1080p", "720p", "360p"];

    if ((prisma as any).checkRecording) {
      const recording = await (prisma as any).checkRecording.create({
        data: {
          title,
          projectType,
          description,
          checkerEmail,
          checkerName,
          videoUrl,
          thumbnailUrl: input.thumbnailUrl || null,
          durationSec,
          qualities,
        },
      });

      return { success: true, recording };
    }

    // Direct fallback if Prisma client is stale in memory
    const insertQuery = `
      INSERT INTO "CheckRecording" 
        ("id", "title", "projectType", "description", "checkerEmail", "checkerName", "videoUrl", "durationSec", "qualities", "createdAt", "updatedAt")
      VALUES 
        (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *;
    `;
    const res = await pool.query(insertQuery, [
      title,
      projectType,
      description,
      checkerEmail,
      checkerName,
      videoUrl,
      durationSec,
      qualities,
    ]);

    return { success: true, recording: res.rows[0] };
  } catch (error: any) {
    console.error("[createCheckRecordingAction] Error:", error);
    return { success: false, error: error.message || "Failed to create check recording." };
  }
}

/**
 * Get active livestream check room status
 */
export async function getActiveLivestreamRoomAction() {
  try {
    if ((prisma as any).livestreamRoom) {
      const activeRoom = await (prisma as any).livestreamRoom.findFirst({
        where: { status: "live" },
        orderBy: { startedAt: "desc" },
      });

      return { success: true, room: activeRoom };
    }

    // Direct fallback if Prisma client is stale in memory
    const res = await pool.query(
      'SELECT * FROM "LivestreamRoom" WHERE "status" = $1 ORDER BY "startedAt" DESC LIMIT 1',
      ["live"]
    );
    return { success: true, room: res.rows[0] || null };
  } catch (error: any) {
    console.error("[getActiveLivestreamRoomAction] Error:", error);
    return { success: false, error: error.message || "Failed to fetch live room status." };
  }
}

/**
 * Start a live stream check session
 */
export async function startLivestreamRoomAction(title: string, projectType: string) {
  try {
    const user = await getSessionUser();
    if (!user || !isStaff(user.role)) {
      return { success: false, error: "Forbidden: Only Checkers can host live sessions." };
    }

    if ((prisma as any).livestreamRoom) {
      // End any existing live rooms for this checker
      await (prisma as any).livestreamRoom.updateMany({
        where: { checkerEmail: user.email, status: "live" },
        data: { status: "ended", endedAt: new Date() },
      });

      const newRoom = await (prisma as any).livestreamRoom.create({
        data: {
          title: title.trim() || "Live Quality Audit",
          projectType: projectType || "Standard Building",
          checkerEmail: user.email,
          checkerName: user.name || user.email.split("@")[0],
          status: "live",
          streamUrl: "https://stream.xfnite.cloud/embed/video",
          startedAt: new Date(),
          viewerLimit: 10,
          currentViewers: 0,
        },
      });

      return { success: true, room: newRoom };
    }

    // Direct fallback
    await pool.query(
      'UPDATE "LivestreamRoom" SET "status" = $1, "endedAt" = NOW() WHERE "checkerEmail" = $2 AND "status" = $3',
      ["ended", user.email, "live"]
    );
    const insertRes = await pool.query(
      `INSERT INTO "LivestreamRoom" 
        ("id", "title", "projectType", "checkerEmail", "checkerName", "status", "streamUrl", "startedAt", "viewerLimit", "currentViewers", "createdAt", "updatedAt")
       VALUES 
        (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), 10, 0, NOW(), NOW())
       RETURNING *`,
      [
        title.trim() || "Live Quality Audit",
        projectType || "Standard Building",
        user.email,
        user.name || user.email.split("@")[0],
        "live",
        "https://stream.xfnite.cloud/embed/video",
      ]
    );
    return { success: true, room: insertRes.rows[0] };
  } catch (error: any) {
    console.error("[startLivestreamRoomAction] Error:", error);
    return { success: false, error: error.message || "Failed to start live session." };
  }
}

/**
 * End a live stream check session
 */
export async function endLivestreamRoomAction(roomId: string) {
  try {
    const user = await getSessionUser();
    if (!user || !isStaff(user.role)) {
      return { success: false, error: "Forbidden." };
    }

    if ((prisma as any).livestreamRoom) {
      await (prisma as any).livestreamRoom.update({
        where: { id: roomId },
        data: { status: "ended", endedAt: new Date() },
      });

      return { success: true };
    }

    await pool.query(
      'UPDATE "LivestreamRoom" SET "status" = $1, "endedAt" = NOW() WHERE "id" = $2',
      ["ended", roomId]
    );
    return { success: true };
  } catch (error: any) {
    console.error("[endLivestreamRoomAction] Error:", error);
    return { success: false, error: error.message || "Failed to end live session." };
  }
}

