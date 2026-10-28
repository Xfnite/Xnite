const BASE = process.env.NEXT_PUBLIC_GINGER_API_URL || "https://ginger.bitmappro.com";

export const GINGER_ENDPOINTS = {
  // Auth
  login:           `${BASE}/bac/login`,
  logout:          `${BASE}/bac/logout`,
  signupValidate:  `${BASE}/bac/eam/koala/koala-user/user/signup-validate`,
  signup:          `${BASE}/bac/eam/koala/koala-user/user/signup`,

  // Account
  accountDetail:   `${BASE}/bac/eam/sale/user/detail`,

  // Projects
  listOngoingProjects:    `${BASE}/bac/mapping/annotate/list-ongoing-projects-for-annotator`,
  listProjectsWithStats:  `${BASE}/bac/mapping/annotate/list-projects-with-statistics`,
  projectDetailStats:     `${BASE}/bac/mapping/annotate/detail-annotate-statistics`,
  registerWorktime:       `${BASE}/bac/mapping/annotate/register-worktime`,

  // Training
  listOngoingTraining:    `${BASE}/bac/mapping/annotate/training-annotate/list-ongoing-projects`,
  updateTrainingStatus:   `${BASE}/bac/mapping/annotate/training-annotate/update-user-training-status`,
} as const;

export type GingerEndpoint = keyof typeof GINGER_ENDPOINTS;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GingerSignupPayload {
  email: string;
  username: string;
  password: string;
  password_conf: string;
  contact: string;
  graduate_date: string;
  occupied: string;
  payee_name: string;
  payee_uid: string;
  referal_email: string;
  imitation_code: string;
}

export interface GingerCredential {
  access_token: string;
  refresh_token?: string;
}

export interface GingerLoginResponse {
  credential: GingerCredential;
  user?: Record<string, unknown>;
}

// ─── Headers ──────────────────────────────────────────────────────────────────

export function gingerHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

const jsonHeaders: HeadersInit = { "Content-Type": "application/json" };

// ─── Token helper ─────────────────────────────────────────────────────────────

export function getGingerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("scrapedGingerData");
    if (!raw) return null;
    return JSON.parse(raw)?.credential?.access_token ?? null;
  } catch {
    return null;
  }
}

// ─── Auth calls ───────────────────────────────────────────────────────────────

export async function gingerLogin(
  email: string,
  password: string,
): Promise<{ ok: boolean; data: GingerLoginResponse }> {
  const res = await fetch(GINGER_ENDPOINTS.login, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export async function gingerSignupValidate(
  payload: GingerSignupPayload,
): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(GINGER_ENDPOINTS.signupValidate, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export async function gingerSignup(
  payload: GingerSignupPayload,
): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(GINGER_ENDPOINTS.signup, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}
