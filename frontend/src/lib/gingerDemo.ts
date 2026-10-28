// Demo/stub account. For this one email the app serves its own stateful data
// and makes NO request to Ginger, so Projects and Trainings behave like a real
// connected account (you can pause/reopen a training, register a project) while
// nothing ever reaches Ginger. State lives in the database (a SystemSetting
// key-value row), keyed to the account, so it persists across reloads and
// devices. Everyone else hits the real proxy; login is untouched.
import { prisma } from "@/lib/db";

// Re-exported so server callers can keep importing from this module. The pure
// definition lives in demoAccount.ts so client code can import it too.
export { DEMO_GINGER_EMAIL, isDemoGingerEmail } from "@/lib/demoAccount";

const DEMO_USER_ID = 10053976;

// Seed data (first login). After that, the live state comes from Redis.
const SEED_PROJECTS = [
  { annotate_id: 6990, annotate_project_id: 6990, annotate_name: "road&intersection-centerline-261027", annotate_status: "running", ts_started: "2026-10-28T01:58:34Z", annotate_schedule_details: { register_hours: 0, start_of_cycle: "2026-10-27", end_of_cycle: "2026-11-02" } },
  { annotate_id: 6955, annotate_project_id: 6955, annotate_name: "building-forest-water-repair-261023", annotate_status: "running", ts_started: "2026-10-25T07:37:28Z", annotate_schedule_details: { register_hours: 0, start_of_cycle: "2026-10-20", end_of_cycle: "2026-10-26" } },
  { annotate_id: 6894, annotate_project_id: 6894, annotate_name: "landcover-manmade-repair-261015", annotate_status: "running", ts_started: "2026-10-22T03:37:18Z", annotate_schedule_details: { register_hours: 0, start_of_cycle: "2026-10-20", end_of_cycle: "2026-10-26" } },
  { annotate_id: 6856, annotate_project_id: 6856, annotate_name: "landcover-manmade-repair-261015A", annotate_status: "running", ts_started: "2026-10-17T03:19:49Z", annotate_schedule_details: { register_hours: 0, start_of_cycle: "2026-10-13", end_of_cycle: "2026-10-19" } },
];

// Standard Building passed; one training active (Multi Level); the rest
// registered-but-inactive (user_state 0) so the UI greys them while one runs.
const SEED_TRAININGS = [
  { annotate_project_id: 1, annotate_sub_project_id: 1, annotate_name: "Standard Building", annotate_sub_project_name: "Standard Building", is_online: 1, is_active: 0, user_state: 0, training_status_desc: "STATUS_PASSED", passed_task_num: 35, total_task: 35, user_id: DEMO_USER_ID },
  { annotate_project_id: 3, annotate_sub_project_id: 3, annotate_name: "Multi Level Building Training", annotate_sub_project_name: "Multi Level Building Training", is_online: 1, is_active: 1, user_state: 0, training_status_desc: "STATUS_ONGOING", passed_task_num: 0, total_task: 3, user_id: DEMO_USER_ID },
  { annotate_project_id: 5, annotate_sub_project_id: 5, annotate_name: "landcover training", annotate_sub_project_name: "landcover training", is_online: 1, is_active: 0, user_state: 0, training_status_desc: "STATUS_ONGOING", passed_task_num: 0, total_task: 18, user_id: DEMO_USER_ID },
  { annotate_project_id: 6, annotate_sub_project_id: 6, annotate_name: "transportation training", annotate_sub_project_name: "transportation training", is_online: 1, is_active: 0, user_state: 0, training_status_desc: "STATUS_ONGOING", passed_task_num: 0, total_task: 12, user_id: DEMO_USER_ID },
  { annotate_project_id: 7, annotate_sub_project_id: 7, annotate_name: "roof_training", annotate_sub_project_name: "roof_training", is_online: 1, is_active: 0, user_state: 0, training_status_desc: "STATUS_ONGOING", passed_task_num: 0, total_task: 10, user_id: DEMO_USER_ID },
];

const DEMO_TOTALS: Record<number, number> = { 6990: 1200, 6955: 980, 6894: 1500, 6856: 760 };

function demoStatistics(annotateId: number) {
  const total = DEMO_TOTALS[annotateId] ?? 1000;
  return {
    task_release_statistics: { total_task_count: total, finished_task_count: Math.floor(total * 0.6) },
    feature_statistics: { finished_features: Math.floor(total * 0.5), processed_features: Math.floor(total * 0.8) },
    task_state_statistics: { task_state_list: [] },
  };
}

// ---- State store (Redis) --------------------------------------------------
type DemoProject = (typeof SEED_PROJECTS)[number];
type DemoTraining = (typeof SEED_TRAININGS)[number];
type DemoState = { projects: DemoProject[]; trainings: DemoTraining[] };

const stateKey = (email: string) => `ginger_demo_state:${email.toLowerCase()}`;

function seedState(): DemoState {
  return JSON.parse(JSON.stringify({ projects: SEED_PROJECTS, trainings: SEED_TRAININGS }));
}

// Reads the stored state, or the seed until the first mutation persists one.
// (No create on read, so concurrent first reads can't race on the unique key.)
async function readState(email: string): Promise<DemoState> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: stateKey(email) } });
    if (row?.value) return JSON.parse(row.value) as DemoState;
  } catch (err) {
    console.error("[gingerDemo] readState failed, using seed:", err);
  }
  return seedState();
}

async function writeState(email: string, state: DemoState): Promise<void> {
  try {
    const key = stateKey(email);
    const value = JSON.stringify(state);
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { id: key, key, value },
    });
  } catch (err) {
    console.error("[gingerDemo] writeState failed:", err);
  }
}

function parseBody(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}

// Stateful canned responses, shaped exactly like Ginger's so every caller
// parses them the same way. Writes mutate the stored state and return success.
export async function gingerDemoResponse(endpoint: string, email: string, body: string): Promise<unknown> {
  const state = await readState(email);

  switch (endpoint) {
    case "bac/mapping/annotate/list-ongoing-projects-for-annotator":
      return { ongoing_annotate_list: state.projects, total_size: state.projects.length };

    case "bac/mapping/annotate/list-projects-with-statistics":
      return { annotate_list: state.projects.map((p) => ({ annotate_id: p.annotate_id, statistics: demoStatistics(p.annotate_id) })) };

    case "bac/mapping/annotate/detail-annotate-statistics": {
      const payload = parseBody(body);
      const id = Number(payload.annotate_id) || state.projects[0]?.annotate_id;
      return { statistics: demoStatistics(id) };
    }

    case "bac/mapping/annotate/training-annotate/list-ongoing-projects":
      return { training_annotate_list: state.trainings };

    case "bac/mapping/annotate/training-annotate/update-user-training-status": {
      const payload = parseBody(body);
      const pid = payload.annotate_project_id;
      const next = Number(payload.is_active);
      const target = state.trainings.find((t) => t.annotate_project_id === pid || t.annotate_sub_project_id === pid);
      if (target) {
        if (next === 1) {
          // Only one training may run at a time: pause the others (never the
          // passed Standard Building), then activate this one.
          state.trainings.forEach((t) => {
            if (t.annotate_project_id !== 1 && t.training_status_desc !== "STATUS_PASSED") t.is_active = 0;
          });
          target.is_active = 1;
        } else {
          target.is_active = 0;
        }
        await writeState(email, state);
      }
      return { code: 0, msg: "success" };
    }

    case "bac/mapping/annotate/register-worktime": {
      const payload = parseBody(body);
      const aid = payload.annotate_id;
      const project = state.projects.find((p) => p.annotate_id === aid || p.annotate_project_id === aid);
      if (project) {
        project.annotate_schedule_details = { ...project.annotate_schedule_details, register_hours: 1 };
        await writeState(email, state);
      }
      return { errcode: 0, msg: "success" };
    }

    case "bac/eam/koala/koala-group/group/detail":
      return { errcode: 0, group: { group_name: "Demo Guild" }, users: [] };
    case "bac/mapping/annotate/performance/async_download_work_time_table":
      return { task_id: "demo-task" };
    case "bac/async_task/api_request/get_result":
      return { data: { status: "success" } };
    default:
      return { code: 0 };
  }
}
