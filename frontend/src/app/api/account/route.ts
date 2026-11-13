import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { redis, isRedisReady } from "@/lib/redis";
import { verifySessionToken } from "@/lib/jwt";
import { withRateLimit } from "@/lib/rateLimit";
import { isGingerExpiredResponse, resetExpiredGingerUser } from "@/lib/gingerExpiredAccount";

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
const ACCOUNT_ENDPOINT = `${GINGER_BASE}/bac/eam/sale/user/detail`;

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("ginger_access_token")?.value;
    const sessionToken = cookieStore.get("xnite_session")?.value;
    const sessionEmail = sessionToken ? await verifySessionToken(sessionToken) : null;

    if (!token) {
      if (!sessionEmail) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      // No valid Ginger session (e.g. stored Ginger credentials are wrong) — fall back to
      // local account details so the user can still view/fix their settings from the dashboard.
      return await buildLocalFallbackResponse(sessionEmail);
    }

    let reqBody: any = {};
    try {
      reqBody = await request.json();
    } catch (e) {
      // Ignore if no body is passed
    }

    if (reqBody.action === "complete_walkthrough") {
      if (!sessionEmail) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      if (isRedisReady()) {
        await redis.set(`walkthrough_completed:${sessionEmail}`, "true");
        await redis.del(`api_account_cache:${sessionEmail}`);
      } else {
        console.warn(`[Redis] Redis not ready, could not store walkthrough completion for ${sessionEmail}`);
      }
      return NextResponse.json({ success: true });
    }

    const isForceRefresh = Boolean(reqBody.forceRefresh);

    if (isForceRefresh && sessionEmail && isRedisReady()) {
      await redis.del(`api_account_cache:${sessionEmail}`);
    }

    // Serve from Redis cache if available and not forced
    if (!isForceRefresh && sessionEmail && isRedisReady()) {
      const cached = await redis.get(`api_account_cache:${sessionEmail}`);
      if (cached) {
        return NextResponse.json(JSON.parse(cached));
      }
    }

    const { forceRefresh: _, ...gingerBody } = reqBody;

    const gingerRes = await fetch(ACCOUNT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(gingerBody),
    });

    const data = await gingerRes.json();

    if (!gingerRes.ok) {
      console.error("Ginger API Account Error:", gingerRes.status, data);
      if (sessionEmail) {
        return await buildLocalFallbackResponse(sessionEmail);
      }
      return NextResponse.json(
        { success: false, error: data.error ?? data.message ?? "Failed to fetch account details", details: data, status: gingerRes.status },
        { status: gingerRes.status }
      );
    }

    const payload = data.data || data;
    const target = payload.koala_user_details || payload;

    if (sessionEmail) {
      try {
        const user = await prisma.user.findUnique({ where: { email: sessionEmail } });
        if (user) {
          if (isGingerExpiredResponse(data)) {
            console.log(`[/api/account] User ${user.email} Ginger account is expired. Auto-resetting for training.`);
            const resetResult = await resetExpiredGingerUser(user);
            if (resetResult.newGingerToken) {
              cookieStore.set({
                name: "ginger_access_token",
                value: resetResult.newGingerToken,
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24,
              });
            }
            return await buildLocalFallbackResponse(sessionEmail);
          }

          target.db_name = user.name;
          target.db_email = user.email;
          target.db_username = user.username;
          target.db_firstName = user.firstName;
          target.db_lastName = user.lastName;
          target.db_phone = user.phone;
          target.db_facebook = user.facebook;
          target.db_role = user.role;
          target.db_gingerEmail = user.gingerEmail;
          target.db_gingerPassword = user.gingerPassword;
          target.db_gingerUsername = user.gingerUsername;

          target.db_groupId = user.group_id;
          target.db_teamId = user.team_id;

          // ANY prior request consumes the one-time name & facebook change
          // allowance, whatever its status — the attempt has been used.
          const priorReqs = await prisma.profileChangeRequest.findMany({
            where: { userEmail: sessionEmail },
            orderBy: { createdAt: "desc" },
          });
          target.pendingProfileChangeRequest = priorReqs.find((r) => r.status === "PENDING") || null;
          target.nameChangeUsed = priorReqs.some((r) => r.requestedFirstName || r.requestedLastName);
          target.facebookChangeUsed = priorReqs.some((r) => r.requestedFacebook);

          // Sync group_id, team_id, and labelerId to local DB if found and different
          const fetchedGroupId = target.group_id || target.origin_group_id;
          const fetchedTeamId = target.team_id || target.origin_team_id;
          
          let firstLabelerId: string | undefined = undefined;
          let firstLabelerPassword: string | undefined = undefined;
          if (target.koala_user_role && Array.isArray(target.koala_user_role)) {
            const labelerRole = target.koala_user_role.find((r: any) => r.role?.toLowerCase() === 'labeler');
            if (labelerRole) {
              if (labelerRole.role_user_id) {
                firstLabelerId = labelerRole.role_user_id.toString();
              }
              if (labelerRole.role_password) {
                firstLabelerPassword = labelerRole.role_password.toString();
              }
            }
          }

          const isRealNumericId = (id: any) => {
            if (id == null) return false;
            const n = Number(id);
            return !isNaN(n) && n > 0;
          };

          const newTeamId = isRealNumericId(fetchedTeamId) ? Number(fetchedTeamId) : null;
          const newGroupId = isRealNumericId(fetchedGroupId) ? Number(fetchedGroupId) : null;

          const hasValidTeamName = Boolean(
            target.team_name &&
            target.team_name !== "-" &&
            target.team_name !== "null" &&
            target.team_name !== "undefined" &&
            String(target.team_name).trim() !== ""
          );

          // If Ginger returns a new valid positive team/group, update them.
          // Otherwise, preserve the user's existing team_id and group_id from DB so renewals don't wipe them.
          const effectiveTeamId = (newTeamId && hasValidTeamName) ? newTeamId : (user.team_id || null);
          const effectiveGroupId = newGroupId !== null ? newGroupId : (user.group_id || null);

          if (!hasValidTeamName && !user.team_id) {
            target.team_id = null;
            target.origin_team_id = null;
            target.team_name = null;
            target.team_checker_link = null;
            target.team_judger_link = null;
          } else if (effectiveTeamId) {
            target.team_id = effectiveTeamId;
          }

          if (effectiveGroupId) {
            target.group_id = effectiveGroupId;
          }

          const teamChanged = user.team_id !== effectiveTeamId;
          const groupChanged = user.group_id !== effectiveGroupId;
          const labelerIdChanged = Boolean(firstLabelerId && user.labelerId !== firstLabelerId);
          const labelerPassChanged = Boolean(firstLabelerPassword && user.labelerPassword !== firstLabelerPassword);

          if (teamChanged || groupChanged || labelerIdChanged || labelerPassChanged) {
            await prisma.user.update({
              where: { email: sessionEmail },
              data: {
                group_id: effectiveGroupId,
                team_id: effectiveTeamId,
                ...(firstLabelerId ? { labelerId: firstLabelerId } : {}),
                ...(firstLabelerPassword ? { labelerPassword: firstLabelerPassword } : {})
              }
            });
            user.team_id = effectiveTeamId;
            user.group_id = effectiveGroupId;
          }

          target.db_groupId = user.group_id;
          target.db_teamId = user.team_id;
        }
      } catch (e) {
        console.error("Error fetching db user info:", e);
      }
    }

    try {
      // Match by groupId/team_id (the real unique key, same one used everywhere else
      // links are read/written) rather than by group_name text, which drifts whenever
      // a group is renamed in Koala and silently breaks this lookup.
      //
      // The account page is loaded by every user on nearly every visit, so this also
      // doubles as the primary sync point that backfills/refreshes Group rows in
      // Postgres — upsert (not just read) whenever we have a name to save, instead of
      // relying solely on the recruiter/group page to have synced that specific group.
      const linkGroupId = target?.group_id || target?.origin_group_id;
      const linkTeamId = target?.team_id || target?.origin_team_id;

      if (linkGroupId) {
        const cleanGroupId = Number(linkGroupId);
        const groupRow = target.group_name
          ? await prisma.group.upsert({
            where: { groupId: cleanGroupId },
            update: { groupName: target.group_name.trim(), groupType: "group" },
            create: { groupId: cleanGroupId, groupName: target.group_name.trim(), groupType: "group" },
          })
          : await prisma.group.findUnique({ where: { groupId: cleanGroupId } });
        target.group_checker_link = groupRow?.checkerLink || null;
        target.group_judger_link = groupRow?.judgerLink || null;
      }

      if (linkTeamId) {
        const cleanTeamId = Number(linkTeamId);
        const teamRow = target.team_name
          ? await prisma.group.upsert({
            where: { groupId: cleanTeamId },
            update: { groupName: target.team_name.trim(), groupType: "team" },
            create: { groupId: cleanTeamId, groupName: target.team_name.trim(), groupType: "team" },
          })
          : await prisma.group.findUnique({ where: { groupId: cleanTeamId } });
        target.team_checker_link = teamRow?.checkerLink || null;
        target.team_judger_link = teamRow?.judgerLink || null;
      }
    } catch (e) {
      console.error("Error checking or matching group/team:", e);
    }

    let walkthroughCompleted = false;
    if (sessionEmail) {
      if (isRedisReady()) {
        const val = await redis.get(`walkthrough_completed:${sessionEmail}`);
        walkthroughCompleted = val === "true";
      }
      if (!walkthroughCompleted) {
        const dbUser = await prisma.user.findUnique({
          where: { email: sessionEmail },
          select: { activeProjectsTutorialProgress: true },
        });
        const tutProg = dbUser?.activeProjectsTutorialProgress as any;
        if (tutProg?.account_walkthrough_completed === true || tutProg?.project_walkthrough_completed === true) {
          walkthroughCompleted = true;
        }
      }
    }

    const responsePayload = {
      success: true,
      data: payload,
      walkthroughCompleted,
    };

    if (sessionEmail && isRedisReady()) {
      await redis.set(`api_account_cache:${sessionEmail}`, JSON.stringify(responsePayload), "EX", 60);
    }

    return NextResponse.json(responsePayload);
  } catch (err) {
    console.error("Account API error:", err);
    return NextResponse.json(
      { success: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
});

async function buildLocalFallbackResponse(sessionEmail: string) {
  const user = await prisma.user.findUnique({ where: { email: sessionEmail } });
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const koalaUserDetails: any = {
    db_name: user.name,
    db_email: user.email,
    db_username: user.username,
    db_firstName: user.firstName,
    db_lastName: user.lastName,
    db_phone: user.phone,
    db_facebook: user.facebook,
    db_role: user.role,
    db_gingerEmail: user.gingerEmail,
    db_gingerPassword: user.gingerPassword,
    db_gingerUsername: user.gingerUsername,
    user_email: user.email,
    role: user.role,
    group_id: user.group_id,
    team_id: user.team_id,
    db_groupId: user.group_id,
    db_teamId: user.team_id,
  };

  const priorReqs = await prisma.profileChangeRequest.findMany({
    where: { userEmail: sessionEmail },
    orderBy: { createdAt: "desc" },
  });
  koalaUserDetails.pendingProfileChangeRequest = priorReqs.find((r) => r.status === "PENDING") || null;
  koalaUserDetails.nameChangeUsed = priorReqs.some((r) => r.requestedFirstName || r.requestedLastName);
  koalaUserDetails.facebookChangeUsed = priorReqs.some((r) => r.requestedFacebook);

  let walkthroughCompleted = false;
  if (sessionEmail) {
    if (isRedisReady()) {
      const val = await redis.get(`walkthrough_completed:${sessionEmail}`);
      walkthroughCompleted = val === "true";
    }
    if (!walkthroughCompleted) {
      const dbUser = await prisma.user.findUnique({
        where: { email: sessionEmail },
        select: { activeProjectsTutorialProgress: true },
      });
      const tutProg = dbUser?.activeProjectsTutorialProgress as any;
      if (tutProg?.account_walkthrough_completed === true || tutProg?.project_walkthrough_completed === true) {
        walkthroughCompleted = true;
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: { koala_user_details: koalaUserDetails },
    walkthroughCompleted,
    gingerUnavailable: true,
  });
}
