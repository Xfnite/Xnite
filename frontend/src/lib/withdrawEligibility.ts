import { prisma } from "@/lib/db";

// Everything that can block a withdrawal before the OTP pass is consumed. Shared by
// the withdraw route (final authority) and the OTP route, so a user who can't
// withdraw is told so before an OTP is emailed instead of after they verify it.
export async function checkWithdrawEligibility(email: string) {
  const currentIncome = await prisma.currentIncome.findUnique({
    where: { email },
    include: { user: { select: { role: true } } }
  });

  if (!currentIncome) {
    return { ok: false as const, error: "Income record not found", status: 404 };
  }

  const settings = await prisma.systemSetting.findMany({
    where: {
      key: { in: [
        "salaries_disabled", "salaries_disabled_roles", "withdraw_disabled_roles",
        "disable_withdrawals_balance_threshold", "disable_withdrawals_balance_enabled",
        "disable_withdrawals_balance_labeler_enabled", "disable_withdrawals_balance_labeler",
        "disable_withdrawals_balance_old_labeler_enabled", "disable_withdrawals_balance_old_labeler"
      ] }
    },
    select: { key: true, value: true }
  });

  const blocked = evaluateWithdrawEligibility(
    { role: currentIncome.user?.role, status: currentIncome.status, estimatedAmount: currentIncome.estimatedAmount },
    settings
  );
  if (blocked) return blocked;

  return { ok: true as const, currentIncome };
}

// The rules themselves, free of DB access so the dev self-test page can run them
// against made-up settings. Returns null when nothing blocks the withdrawal.
export function evaluateWithdrawEligibility(
  income: { role?: string | null; status?: string | null; estimatedAmount: number },
  settings: { key: string; value: string | null }[]
) {
  const thresholdSetting = settings.find(s => s.key === "disable_withdrawals_balance_threshold");
  const thresholdEnabledSetting = settings.find(s => s.key === "disable_withdrawals_balance_enabled");

  // Role-specific settings
  const labelerThresholdEnabledSetting = settings.find(s => s.key === "disable_withdrawals_balance_labeler_enabled");
  const labelerThresholdSetting = settings.find(s => s.key === "disable_withdrawals_balance_labeler");
  const oldLabelerThresholdEnabledSetting = settings.find(s => s.key === "disable_withdrawals_balance_old_labeler_enabled");
  const oldLabelerThresholdSetting = settings.find(s => s.key === "disable_withdrawals_balance_old_labeler");

  let threshold = thresholdSetting && thresholdSetting.value && !isNaN(Number(thresholdSetting.value))
    ? Number(thresholdSetting.value)
    : 1250;
  let isThresholdEnabled = thresholdEnabledSetting ? thresholdEnabledSetting.value !== "false" : true;

  let isSalariesDisabled = settings.find(s => s.key === "salaries_disabled")?.value === "true";
  const userRole = income.role?.toLowerCase() || "applicant";

  // Apply role-specific overrides if applicable
  if (userRole === 'labeler') {
    const isLabelerOverride = labelerThresholdEnabledSetting?.value === "true";
    if (isLabelerOverride) {
      isThresholdEnabled = true; // Override to true
      threshold = labelerThresholdSetting && labelerThresholdSetting.value && !isNaN(Number(labelerThresholdSetting.value))
        ? Number(labelerThresholdSetting.value)
        : 1250;
    }
  } else if (userRole === 'old-labeler') {
    const isOldLabelerOverride = oldLabelerThresholdEnabledSetting?.value === "true";
    if (isOldLabelerOverride) {
      isThresholdEnabled = true; // Override to true
      threshold = oldLabelerThresholdSetting && oldLabelerThresholdSetting.value && !isNaN(Number(oldLabelerThresholdSetting.value))
        ? Number(oldLabelerThresholdSetting.value)
        : 1250;
    }
  }

  try {
    const salariesRolesStr = settings.find(s => s.key === "salaries_disabled_roles")?.value;
    if (!isSalariesDisabled && salariesRolesStr) {
      const disabledRoles = JSON.parse(salariesRolesStr);
      if (Array.isArray(disabledRoles) && disabledRoles.includes(userRole)) {
        isSalariesDisabled = true;
      }
    }
  } catch (e) {
    // ignore
  }

  let disabledRoles: string[] = [];
  try {
    const rolesStr = settings.find(s => s.key === "withdraw_disabled_roles")?.value;
    if (rolesStr) {
      disabledRoles = JSON.parse(rolesStr);
    }
  } catch (e) {
    // ignore
  }

  if (isSalariesDisabled) {
    return { ok: false as const, error: "Withdrawal has not started yet", status: 400 };
  }

  if (disabledRoles.includes(userRole)) {
    return { ok: false as const, error: "Withdrawal has not started yet", status: 400 };
  }

  const validStatuses = ["Fill-out claim form", "can be claimed next cut-off", "Sent"];
  const status = income.status || "";

  // Check if status allows withdrawal
  if (!validStatuses.includes(status) && !status.toLowerCase().includes("claim")) {
    return { ok: false as const, error: "Status does not allow withdrawal", status: 400 };
  }

  if (isThresholdEnabled && income.estimatedAmount < threshold) {
    return { ok: false as const, error: "Withdrawal has not started yet", status: 400 };
  }

  return null;
}
