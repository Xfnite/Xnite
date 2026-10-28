import { notFound } from "next/navigation";
import { checkWithdrawEligibility } from "@/lib/withdrawEligibility";
import { runSelfTest } from "./selfTest";

// Dev-only: /dev/otp-withdraw-test
// Runs the withdrawal OTP self-test on every load. Add ?email=someone@example.com to
// also see (read-only) what the live settings currently decide for that user.
export default async function OtpWithdrawTestPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { email } = await searchParams;
  const { store, results } = await runSelfTest();
  const failed = results.filter((r) => !r.pass).length;
  const groups = [...new Set(results.map((r) => r.group))];

  let live: { ok: boolean; message: string } | null = null;
  if (email) {
    try {
      const eligibility = await checkWithdrawEligibility(email);
      live = eligibility.ok
        ? { ok: true, message: "Allowed — an OTP would be sent." }
        : { ok: false, message: `Blocked before any OTP is sent: "${eligibility.error}"` };
    } catch (err) {
      live = { ok: false, message: `Lookup failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 font-mono text-sm text-[#0D1B2A] dark:text-white">
      <h1 className="text-xl font-bold">Withdrawal OTP self-test (dev only)</h1>
      <p className="mt-1 opacity-70">
        Store: {store} · {results.length - failed}/{results.length} passed · reload to run again
      </p>
      <p className={`mt-3 text-lg font-bold ${failed ? "text-red-500" : "text-green-600"}`}>
        {failed ? `${failed} FAILED` : "ALL PASSED"}
      </p>

      {groups.map((group) => (
        <section key={group} className="mt-6">
          <h2 className="font-bold">{group}</h2>
          <ul className="mt-2 space-y-1">
            {results.filter((r) => r.group === group).map((r, i) => (
              <li key={i} className={r.pass ? "" : "text-red-500"}>
                {r.pass ? "PASS" : "FAIL"} · {r.name}
                {!r.pass && <span className="block pl-12 opacity-80">{r.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-8 border-t border-black/10 pt-4 dark:border-white/10">
        <h2 className="font-bold">Live check (read-only)</h2>
        {live ? (
          <p className={`mt-2 ${live.ok ? "text-green-600" : "text-orange-500"}`}>
            {email}: {live.message}
          </p>
        ) : (
          <p className="mt-2 opacity-70">
            Add ?email=user@example.com to the URL to see what the current settings decide for that user.
          </p>
        )}
      </section>
    </main>
  );
}
