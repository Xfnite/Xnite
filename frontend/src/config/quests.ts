export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  target: string;
  xp: number;
  selfAwarding?: boolean;
}

export const TORCH_QUEST_ID = "daily_q1";
export const TORCH_DAILY_CAP = 20;

export const DJ_QUEST_ID = "daily_q_harmony";
export const DJ_TARGET_MINUTES = 60;

export const CHECKIN_QUEST_ID = "daily_q_checkin";
export const BOUNTY_QUEST_ID = "daily_q_bounty";

// Recruit the Realm: refer new users who finish the standard onboarding gate
// (onboarding + Standard Building + rules & guidelines) this week. Resets weekly
// (Monday, anchor tz) via getWeekKey, not daily. The +LXP is a single manual
// claim at target; once claimed the card hides until the next week.
export const RECRUIT_QUEST_ID = "daily_q2";
export const RECRUIT_WEEKLY_TARGET = 10;
export const RECRUIT_WEEKLY_LXP = 200;

export const DAILY_QUESTS: DailyQuest[] = [
  {
    id: "daily_q1",
    title: "Pass the Torch",
    description: "Help lower roles by replying to chat comms questions, e.g overseers and arbiters must help builders and challengers to gain points, builders must help challengers to gain points",
    target: "0/20 Unique Player(s)",
    xp: 10,
  },
  {
    id: "daily_q2",
    title: "Recruit the Realm",
    description: "Refer a Friend to work here in Xfnite, you can get your referral link on the bottom left sidebar.",
    target: "0/10 Passers per week",
    xp: 200,
  },
  {
    id: "daily_q3",
    title: "The Bards Ballad",
    description: "Add song queue to DJ Booth",
    target: "0/2 Song",
    xp: 1,
  },
  {
    id: "daily_q_bounty",
    title: "The Daily Bounty",
    description: "Take-on and submit 10 live task in Ginger Software",
    target: "0/10 Live Task",
    xp: 10,
  },
  {
    id: "daily_q_harmony",
    title: "The 60-Minute Harmony",
    description: "Listen to DJ Booth for 60mins",
    target: "0/60mins DJ Booth",
    xp: 1,
  },
  {
    id: "daily_q_checkin",
    title: "Daily Check-In",
    description: "Log-in daily",
    target: "0/1 Log-in",
    xp: 1,
  },
];
