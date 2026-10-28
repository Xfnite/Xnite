import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { redis, isRedisReady } from "@/lib/redis";
import { verifySessionToken } from "@/lib/jwt";
import { withRateLimit } from "@/lib/rateLimit";

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
          target.db_name = user.name;
          target.db_email = user.email;
          target.db_firstName = user.firstName;
          target.db_lastName = user.lastName;
          target.db_phone = user.phone;
          target.db_facebook = user.facebook;
          target.db_role = user.role;
          target.db_gingerEmail = user.gingerEmail;
          target.db_gingerPassword = user.gingerPassword;

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

          if (
            (fetchedGroupId && user.group_id !== Number(fetchedGroupId)) ||
            (fetchedTeamId && user.team_id !== Number(fetchedTeamId)) ||
            (firstLabelerId && user.labelerId !== firstLabelerId) ||
            (firstLabelerPassword && user.labelerPassword !== firstLabelerPassword)
          ) {
            await prisma.user.update({
              where: { email: sessionEmail },
              data: {
                group_id: fetchedGroupId ? Number(fetchedGroupId) : undefined,
                team_id: fetchedTeamId ? Number(fetchedTeamId) : undefined,
                ...(firstLabelerId ? { labelerId: firstLabelerId } : {}),
                ...(firstLabelerPassword ? { labelerPassword: firstLabelerPassword } : {})
              }
            });
          }
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
    if (sessionEmail && isRedisReady()) {
      const val = await redis.get(`walkthrough_completed:${sessionEmail}`);
      walkthroughCompleted = val === "true";
    }

    const responsePayload = {
      success: true,
      data: payload,
      walkthroughCompleted,
    };

    if (sessionEmail && isRedisReady()) {
      await redis.set(`api_account_cache:${sessionEmail}`, JSON.stringify(responsePayload), "EX", 3600);
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
    db_firstName: user.firstName,
    db_lastName: user.lastName,
    db_phone: user.phone,
    db_facebook: user.facebook,
    db_role: user.role,
    db_gingerEmail: user.gingerEmail,
    db_gingerPassword: user.gingerPassword,
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
  if (isRedisReady()) {
    const val = await redis.get(`walkthrough_completed:${sessionEmail}`);
    walkthroughCompleted = val === "true";
  }

  return NextResponse.json({
    success: true,
    data: { koala_user_details: koalaUserDetails },
    walkthroughCompleted,
    gingerUnavailable: true,
  });
}
