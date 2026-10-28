import { getMyPerformanceLogsAction } from "@/app/actions/project";

// GlobalPerformanceAnnouncements and GlobalLowHoursAnnouncements both load the
// user's work logs when a page opens; they share the request while it's in
// flight. Nothing is kept once it settles, so a different user logging in on the
// same tab never gets the previous user's logs.
let inFlight: ReturnType<typeof getMyPerformanceLogsAction> | null = null;

export function loadMyPerformanceSnapshot() {
  if (inFlight) return inFlight;
  const data = getMyPerformanceLogsAction({ includeAllLogs: false, includePlatformStats: true });
  inFlight = data;
  const clear = () => {
    if (inFlight === data) inFlight = null;
  };
  data.then(clear, clear);
  return data;
}
