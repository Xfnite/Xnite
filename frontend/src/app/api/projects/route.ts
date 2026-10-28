import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GINGER_BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";
const LIST_ENDPOINT = `${GINGER_BASE}/bac/mapping/annotate/list-ongoing-projects-for-annotator`;
const STATS_ENDPOINT = `${GINGER_BASE}/bac/mapping/annotate/list-projects-with-statistics`;

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("ginger_access_token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };

    // 1️⃣ Get the basic list of ongoing projects via pagination loop
    let projects: any[] = [];
    let currentOffset = 0;
    const pageSize = 20;
    let totalSize = 0;

    do {
      const listRes = await fetch(LIST_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ offset: currentOffset, size: pageSize })
      });
      const listData = await listRes.json();

      if (!listRes.ok) {
        console.error("Ginger API List Error:", listRes.status, listData);
        if (projects.length === 0) {
          return NextResponse.json(
            { success: false, error: listData.error ?? "Failed to fetch project list", details: listData },
            { status: listRes.status }
          );
        }
        break; // Stop fetching if error but we have some projects
      }

      const items = listData.ongoing_annotate_list || [];
      projects = [...projects, ...items];
      totalSize = listData.total_size || 0;
      currentOffset += pageSize;

      if (items.length === 0) break;
    } while (projects.length < totalSize);

    // If there are no projects, return early with debug info
    if (projects.length === 0) {
      return NextResponse.json({ success: true, data: { annotate_list: [] } });
    }

    // 2️⃣ Extract the project IDs and fetch statistics for them (in chunks)
    const annotateIds = projects.map((p: any) => p.annotate_id);
    let statsList: any[] = [];
    let statsSuccess = true;

    for (let i = 0; i < annotateIds.length; i += 20) {
      const chunk = annotateIds.slice(i, i + 20);
      const statsRes = await fetch(STATS_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ annotate_id_list: chunk }),
      });
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        statsList = [...statsList, ...(statsData.annotate_list || [])];
      } else {
        statsSuccess = false;
        console.error("Ginger API Stats Error Chunk:", statsRes.status);
      }
    }

    if (!statsSuccess && statsList.length === 0) {
      // Fallback to just returning projects without statistics if stats fail completely
      return NextResponse.json({ success: true, data: { annotate_list: projects } });
    }

    // 3️⃣ Merge statistics back into the project objects
    const mergedProjects = projects.map((project: any) => {
      const stats = statsList.find((s: any) => s.annotate_id === project.annotate_id);
      return {
        ...project,
        statistics: stats?.statistics || null
      };
    });

    // 4️⃣ Return merged data in the format the frontend expects
    return NextResponse.json({
      success: true,
      data: { annotate_list: mergedProjects },
    });

  } catch (err) {
    console.error("Projects API error:", err);
    return NextResponse.json(
      { success: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
