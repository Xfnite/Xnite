import { useState, useEffect, useCallback, useRef } from "react";
import { getLoyaltyData, completeQuest, claimWeeklyQuest, type LoyaltyData } from "@/app/actions/loyalty";
import { DAILY_QUESTS, DJ_QUEST_ID, DJ_TARGET_MINUTES, CHECKIN_QUEST_ID, RECRUIT_QUEST_ID, TORCH_QUEST_ID } from "@/config/quests";

export function useQuests() {
  const [localDailyQuests, setLocalDailyQuests] = useState<{ id: string; title: string; description: string; target: string; xp: number; complete: boolean; claimed: boolean }[]>([]);
  const [loyaltyLoaded, setLoyaltyLoaded] = useState(false);
  const [floatingXPs, setFloatingXPs] = useState<{ id: number; text: string; label: string }[]>([]);
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  // Last DJ-Booth minute count we rendered, for crossing detection.
  const djMinutesRef = useRef<number | null>(null);

  // Must outlast the reward-burst animation in XPFloat (XP_FLOAT_DURATION_MS).
  const triggerXPFloat = useCallback((xpAmount: number, label = "Quest Complete") => {
    const id = Date.now() + Math.random();
    setFloatingXPs((prev) => [...prev, { id, text: `+${xpAmount} LXP`, label }]);
    setTimeout(() => {
      setFloatingXPs((prev) => prev.filter((item) => item.id !== id));
    }, 2000);
  }, []);

  const getClaimedStorageKey = useCallback(() => `xfnite_claimed_quests_${new Date().toDateString()}`, []);

  const getClaimedQuestIds = useCallback((): string[] => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(getClaimedStorageKey()) || "[]");
    } catch {
      return [];
    }
  }, [getClaimedStorageKey]);

  const markQuestClaimed = useCallback((questId: string) => {
    if (typeof window === "undefined") return;
    const claimed = getClaimedQuestIds();
    if (!claimed.includes(questId)) {
      localStorage.setItem(getClaimedStorageKey(), JSON.stringify([...claimed, questId]));
    }
  }, [getClaimedQuestIds, getClaimedStorageKey]);

  // Applies an already-fetched LoyaltyData payload to local state, with no
  // network call of its own — shared by the initial load and by the
  // refresh_quests handler below when a claim result is riding along on the
  // event, so a claim doesn't have to pay for a second round-trip just to
  // reflect what the claim call already told us.
  const applyLoyaltyData = useCallback((data: LoyaltyData) => {
    const completedIds = data.completedQuestIds;
    const progress = data.questProgress;
    const weeklyClaimedIds = data.weeklyClaimedQuestIds ?? [];
    const claimedIds = getClaimedQuestIds();
    const { torchTarget, torchXp } = data.rank;
    setLocalDailyQuests(
      DAILY_QUESTS
        .map((q) => {
          const count = progress[q.id] || 0;
          // Pass the Torch's target/reward scale with the user's LXP rank
          // (LoyaltyRank.torchTarget/torchXp) rather than the static config.
          const isTorch = q.id === TORCH_QUEST_ID;
          const targetMatches = q.target.match(/\/(\d+)/);
          const maxTarget = isTorch ? torchTarget : (targetMatches ? parseInt(targetMatches[1], 10) : 1);
          // Simply being logged in satisfies the Daily Check-In, so it reads
          // as complete straight away — but the LXP is still only granted on
          // the manual claim click (completeQuest guards against repeats).
          const isComplete =
            q.id === CHECKIN_QUEST_ID || completedIds.includes(q.id) || count >= maxTarget;
          const displayCount = isComplete ? maxTarget : Math.min(count, maxTarget);
          let target = q.target.replace(/^\d+\/\d+/, `${displayCount}/${maxTarget}`);
          if (isTorch) {
            target = target.replace("Player(s)", maxTarget === 1 ? "Player" : "Players");
          }
          // Claimed quests stay in the list (greyed out) rather than disappearing:
          // a daily once completed AND claimed today, a weekly once claimed this week.
          const isClaimed =
            (completedIds.includes(q.id) && claimedIds.includes(q.id)) ||
            weeklyClaimedIds.includes(q.id);
          return {
            ...q,
            target,
            xp: isTorch ? torchXp : q.xp,
            complete: isComplete,
            claimed: isClaimed,
          };
        })
    );
  }, [getClaimedQuestIds]);

  const loadLoyalty = useCallback(async () => {
    const result = await getLoyaltyData();
    if (result.success) {
      applyLoyaltyData(result.data);
    } else {
      setLocalDailyQuests(
        DAILY_QUESTS.map((q) => ({ ...q, complete: false, claimed: false }))
      );
    }
    setLoyaltyLoaded(true);
  }, [applyLoyaltyData]);

  useEffect(() => {
    loadLoyalty();
    // A claim result is attached as event.detail (see handleCompletedClick) so
    // this can apply it directly with zero extra round-trips; other dispatchers
    // (e.g. JukeboxWidget) fire the event bare, which still falls back to a fetch.
    const handleRefresh = (e: Event) => {
      const detail = (e as CustomEvent<LoyaltyData | undefined>).detail;
      if (detail) {
        applyLoyaltyData(detail);
      } else {
        loadLoyalty();
      }
    };
    window.addEventListener("refresh_quests", handleRefresh);
    return () => {
      window.removeEventListener("refresh_quests", handleRefresh);
    };
  }, [loadLoyalty, applyLoyaltyData]);

  // Live "X/60mins" counter for The 60-Minute Harmony. The socket server owns
  // the clock and re-sends the running total on every listening heartbeat, so
  // patch the card in place rather than refetching the whole loyalty payload.
  useEffect(() => {
    const handleDjMinutes = (e: Event) => {
      const detail = (e as CustomEvent<{ minutes: number; target: number }>).detail;
      if (typeof detail?.minutes !== "number") return;

      const goal = detail.target ?? DJ_TARGET_MINUTES;
      const minutes = Math.min(detail.minutes, goal);
      const prev = djMinutesRef.current;
      djMinutesRef.current = minutes;

      // Only on the real crossing: the total repeats on every heartbeat and is
      // replayed on reconnect, so `>= goal` alone would float XP forever.
      if (prev !== null && prev < goal && minutes >= goal) {
        triggerXPFloat(1);
      }

      // Heartbeats arrive every few seconds; most carry the same minute.
      if (prev === minutes) return;

      setLocalDailyQuests((prevQuests) =>
        prevQuests.map((q) => {
          if (q.id !== DJ_QUEST_ID) return q;
          const base = DAILY_QUESTS.find((d) => d.id === DJ_QUEST_ID)?.target ?? q.target;
          return {
            ...q,
            target: base.replace(/^\d+\//, `${minutes}/`),
            complete: minutes >= goal,
          };
        })
      );
    };

    window.addEventListener("dj_minutes", handleDjMinutes);
    return () => window.removeEventListener("dj_minutes", handleDjMinutes);
  }, [triggerXPFloat]);

  const handleCompletedClick = useCallback((questId: string, xp: number) => {
    // Fire the claim feedback immediately on click, before the server round-trip,
    // so there's no 1-2s dead pause where nothing on screen reacts. The reward
    // burst plays and the card greys out right away; if the server call turns out
    // to have failed for a real reason (not just "already claimed/completed" —
    // those are treated as success since the end state matches), the card is
    // rolled back to claimable.
    triggerXPFloat(xp, "Reward Claimed");
    const setClaimed = (claimed: boolean) =>
      setLocalDailyQuests(prev => prev.map(q => (q.id === questId ? { ...q, claimed } : q)));
    setClaimed(true);

    const rollback = () => setClaimed(false);

    (async () => {
      // The claim call already returns the post-claim totalLxp/rank/progress —
      // riding it on the refresh_quests event lets every listener (this widget,
      // the Loyalty Points page) apply it directly instead of each firing its
      // own follow-up getLoyaltyData() fetch, which is what caused the visible
      // delay before the balance updated on screen.
      let freshData: LoyaltyData | undefined;

      if (questId === RECRUIT_QUEST_ID) {
        // Recruit the Realm is weekly: claim through the weekly path (records the
        // claim in WeeklyQuestClaim and grants the server-fixed reward). Eligibility
        // is re-checked server-side, so a stale/forged card can't pay out.
        const result = await claimWeeklyQuest(questId);
        if (!result.success && result.error !== "Already claimed this week") {
          console.error("Failed to claim weekly quest:", result.error);
          rollback();
          return;
        }
        if (result.success) freshData = result.data;
        // No localStorage claim flag — hiding until next week comes from the DB
        // (weeklyClaimedQuestIds), so it survives a new day within the same week.
      } else {
        // Daily quests: persist totalLxp + completedQuests on the daily row.
        const result = await completeQuest(questId);
        if (!result.success && result.error !== "Quest already completed today") {
          console.error("Failed to complete quest:", result.error);
          rollback();
          return;
        }
        if (result.success) freshData = result.data;
        markQuestClaimed(questId);
      }

      window.dispatchEvent(new CustomEvent("refresh_quests", { detail: freshData }));
    })();
  }, [triggerXPFloat, markQuestClaimed]);

  const toggleQuest = useCallback((id: string) => {
    setExpandedQuestId(prev => (prev === id ? null : id));
  }, []);

  return {
    localDailyQuests,
    loyaltyLoaded,
    floatingXPs,
    expandedQuestId,
    toggleQuest,
    handleCompletedClick,
    loadLoyalty
  };
}
