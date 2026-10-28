"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { getSessionUser } from "@/app/actions/auth";
import { activateUsersAction, type ActivationResult } from "@/app/actions/activation";
import { ACTIVATION_MAX_BATCH, extractEmailCandidates, splitPastedEmails } from "@/lib/userActivation";

const OUTCOME_STYLE: Record<ActivationResult["outcome"], string> = {
  activated: "text-[#1F7A1F] dark:text-[#55f761]",
  new_ginger_account: "text-orange-500",
  already_active: "text-[#2F3E46] dark:text-white/60",
  duplicate: "text-[#2F3E46] dark:text-white/60",
  not_found: "text-red-500",
  not_allowed: "text-red-500",
  invalid: "text-orange-500",
};

export default function ActivateUsersPage() {
  const [role, setRole] = useState("");
  const [text, setText] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<ActivationResult[] | null>(null);

  useEffect(() => {
    getSessionUser().then((user) => setRole(user?.role?.toLowerCase() || "")).catch(console.error);
  }, []);

  const lines = useMemo(() => splitPastedEmails(text), [text]);
  const emailCount = useMemo(() => lines.filter((l) => extractEmailCandidates(l).length > 0).length, [lines]);
  const unreadableCount = lines.length - emailCount;
  const tooMany = lines.length > ACTIVATION_MAX_BATCH;

  const handleActivate = async () => {
    setIsConfirming(false);
    setIsSubmitting(true);
    const toastId = toast.loading("Activating users...");
    try {
      const res = await activateUsersAction(lines);
      if (!res.success) {
        toast.error(res.error, { id: toastId });
        return;
      }
      setResults(res.results);
      const failed = res.results.filter((r) => r.outcome === "not_found" || r.outcome === "not_allowed" || r.outcome === "invalid").length;
      toast.success(`Activated ${res.activated} user${res.activated === 1 ? "" : "s"}`, {
        id: toastId,
        description: failed > 0 ? `${failed} line${failed === 1 ? "" : "s"} could not be activated. See the results below.` : undefined,
      });
    } catch (err) {
      console.error("Activate users failed:", err);
      toast.error("An unexpected error occurred", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const summary = results && {
    activated: results.filter((r) => r.outcome === "activated").length,
    newGinger: results.filter((r) => r.outcome === "new_ginger_account").length,
    alreadyActive: results.filter((r) => r.outcome === "already_active").length,
    notFound: results.filter((r) => r.outcome === "not_found").length,
    notAllowed: results.filter((r) => r.outcome === "not_allowed").length,
    other: results.filter((r) => r.outcome === "invalid" || r.outcome === "duplicate").length,
  };

  return (
    <div className="w-full max-w-3xl space-y-6 relative z-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1F7A1F]/15 dark:bg-[#55f761]/15 flex items-center justify-center">
          <UserCheck className="w-5 h-5 text-[#1F7A1F] dark:text-[#55f761]" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-[#0D1B2A] dark:text-white">Activate Users</h1>
          <p className="text-sm text-[#2F3E46] dark:text-white/60">
            {role === "admin"
              ? "Reactivate deactivated accounts by email."
              : "Reactivate deactivated accounts of your own recruits or your group members. For anyone else, the result shows who can activate them."}
          </p>
        </div>
      </div>

      <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 space-y-4">
        <label htmlFor="activate-emails" className="block text-sm font-semibold text-[#0D1B2A] dark:text-white">
          Emails
        </label>
        <textarea
          id="activate-emails"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setIsConfirming(false);
          }}
          rows={10}
          spellCheck={false}
          placeholder={"name@example.com\n2. another@example.com\nthird@example.com, fourth@example.com"}
          className="w-full px-3 py-2.5 bg-white dark:bg-white/10 border border-black/15 dark:border-white/15 rounded-lg text-sm font-mono text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F]/30 dark:focus:ring-[#55f761]/40"
        />
        <p className={`text-xs font-medium ${tooMany ? "text-red-500" : "text-[#2F3E46]/80 dark:text-white/60"}`}>
          {tooMany
            ? `Up to ${ACTIVATION_MAX_BATCH} emails at a time. You pasted ${lines.length}.`
            : `${emailCount} email${emailCount === 1 ? "" : "s"} found${unreadableCount > 0 ? `, ${unreadableCount} unreadable (shown in the results)` : ""}. Any format works: lines, commas, numbers or names. Up to ${ACTIVATION_MAX_BATCH} at a time.`}
        </p>

        <div className="flex items-center gap-3">
          {!isConfirming ? (
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              disabled={isSubmitting || emailCount === 0 || tooMany}
              className="px-6 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Activating..." : "Activate"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleActivate}
                className="px-6 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg"
              >
                Confirm: activate {emailCount} user{emailCount === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                className="px-4 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-sm font-bold text-[#0D1B2A] dark:text-white transition-all"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {results && summary && (
        <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Results</h2>
          <p className="mt-1 text-sm text-[#2F3E46] dark:text-white/60">
            Activated {summary.activated}
            {summary.newGinger > 0 ? ` · New Ginger account ${summary.newGinger}` : ""}
            {" · "}Already active {summary.alreadyActive} · Not found {summary.notFound}
            {summary.notAllowed > 0 ? ` · Not yours to activate ${summary.notAllowed}` : ""}
            {summary.other > 0 ? ` · Skipped ${summary.other}` : ""}
          </p>
          <ul className="mt-4 divide-y divide-black/5 dark:divide-white/5">
            {results.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <span className="font-mono text-[#0D1B2A] dark:text-white break-all">{r.email || r.input}</span>
                <span className={`font-semibold sm:text-right ${OUTCOME_STYLE[r.outcome]}`}>{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
