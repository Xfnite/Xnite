// Every email a recruiter's recruits can be stored under: their login, Ginger, or
// linked recruiter email. Older referral links stored the login one; new signups
// store their referal email, which is their linked recruiter or Ginger email (see
// findReferalFor in lib/referrers). Anything that credits a recruiter for their
// recruits should match on all of these. No database access, so it can be used in
// pure rule modules like lib/userActivation.
export function recruiterEmailsOf(account: { email: string; gingerEmail?: string | null; linkedRecruiterEmail?: string | null }): string[] {
  return Array.from(new Set(
    [account.email, account.gingerEmail, account.linkedRecruiterEmail]
      .filter((e): e is string => !!e?.trim())
      .map((e) => e.trim().toLowerCase())
  ));
}
