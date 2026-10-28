/* eslint-disable @typescript-eslint/no-explicit-any */

// Checks training pass status from a user's stored Ginger training list (same logic
// as hasPassedTraining in referrals.ts). Reads both the raw Ginger field names and
// the mapped ones.
export function checkTrainingPassedFromList(
  trainings: any[],
  type: "landcover" | "transpo" | "roof" | "3d"
): boolean {
  let target: any | undefined;
  if (type === "landcover") {
    target = trainings.find((t: any) => {
      const name = (t.annotate_sub_project_name || t.name || "").toLowerCase();
      return name.includes("landcover") || name.includes("land cover");
    });
  } else if (type === "transpo") {
    target = trainings.find((t: any) => {
      const name = (t.annotate_sub_project_name || t.name || "").toLowerCase();
      return name.includes("transportation") || name.includes("transport");
    });
  } else if (type === "roof") {
    target = trainings.find((t: any) => {
      const name = (t.annotate_sub_project_name || t.name || "").toLowerCase();
      return name.includes("roof");
    });
  } else if (type === "3d") {
    target = trainings.find((t: any) => {
      const name = (t.annotate_sub_project_name || t.name || "").toLowerCase();
      return name.includes("3d_match") || name.includes("3d match");
    });
  }

  if (!target) return false;

  const rawStatus = (target.training_status_desc || target.trainingStatus || "").toLowerCase();
  const isPassed = rawStatus === "status_passed" || rawStatus === "passed";

  if (type === "transpo" || type === "roof") return isPassed;

  const passed = Number(target.passed_task_num ?? target.passedTask ?? 0);
  let total = Number(target.total_task ?? target.totalTask ?? 0);
  if (type === "landcover" && total === 0) total = 18;
  if (type === "3d" && total === 0) total = 7;
  const pct = total > 0 ? Math.round((passed / total) * 100) : (isPassed ? 100 : 0);
  return isPassed || pct === 100;
}
