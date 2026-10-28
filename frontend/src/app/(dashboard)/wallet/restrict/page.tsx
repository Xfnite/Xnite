"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ShieldAlert, Info, HandCoins, Megaphone, CheckCircle2 } from "lucide-react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function RestrictPage() {
  const [isSalariesDisabled, setIsSalariesDisabled] = useState(false);
  const [salariesDisabledRoles, setSalariesDisabledRoles] = useState<string[]>([]);
  const [withdrawDisabledRoles, setWithdrawDisabledRoles] = useState<string[]>([]);
  const [isWalkthroughEnabled, setIsWalkthroughEnabled] = useState(false);
  const [isNameWalkthroughEnabled, setIsNameWalkthroughEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSalaries, setIsSavingSalaries] = useState(false);
  const [isSavingSalariesRoles, setIsSavingSalariesRoles] = useState(false);
  const [isSavingWithdraw, setIsSavingWithdraw] = useState(false);
  const [isSavingWalkthrough, setIsSavingWalkthrough] = useState(false);
  const [isSavingNameWalkthrough, setIsSavingNameWalkthrough] = useState(false);
  const [minimumBalanceThreshold, setMinimumBalanceThreshold] = useState("1250");
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [isThresholdEnabled, setIsThresholdEnabled] = useState(true);
  const [isSavingThresholdToggle, setIsSavingThresholdToggle] = useState(false);

  const [disableWithdrawalsThreshold, setDisableWithdrawalsThreshold] = useState("1250");
  const [isSavingDisableWithdrawalsThreshold, setIsSavingDisableWithdrawalsThreshold] = useState(false);
  const [isDisableWithdrawalsThresholdEnabled, setIsDisableWithdrawalsThresholdEnabled] = useState(true);
  const [isSavingDisableWithdrawalsThresholdToggle, setIsSavingDisableWithdrawalsThresholdToggle] = useState(false);

  const [isDisableWithdrawalsLabelerEnabled, setIsDisableWithdrawalsLabelerEnabled] = useState(false);
  const [disableWithdrawalsLabelerThreshold, setDisableWithdrawalsLabelerThreshold] = useState("1250");
  const [isSavingDisableWithdrawalsLabeler, setIsSavingDisableWithdrawalsLabeler] = useState(false);
  const [isSavingDisableWithdrawalsLabelerToggle, setIsSavingDisableWithdrawalsLabelerToggle] = useState(false);

  const [isDisableWithdrawalsOldLabelerEnabled, setIsDisableWithdrawalsOldLabelerEnabled] = useState(false);
  const [disableWithdrawalsOldLabelerThreshold, setDisableWithdrawalsOldLabelerThreshold] = useState("1250");
  const [isSavingDisableWithdrawalsOldLabeler, setIsSavingDisableWithdrawalsOldLabeler] = useState(false);
  const [isSavingDisableWithdrawalsOldLabelerToggle, setIsSavingDisableWithdrawalsOldLabelerToggle] = useState(false);

  const [isNewUserSalariesDisabled, setIsNewUserSalariesDisabled] = useState(false);
  const [isSavingNewUserSalaries, setIsSavingNewUserSalaries] = useState(false);

  const [isLabelerThresholdEnabled, setIsLabelerThresholdEnabled] = useState(false);
  const [labelerThreshold, setLabelerThreshold] = useState("1250");
  const [isSavingLabelerThreshold, setIsSavingLabelerThreshold] = useState(false);
  const [isSavingLabelerThresholdToggle, setIsSavingLabelerThresholdToggle] = useState(false);

  const [isOldLabelerThresholdEnabled, setIsOldLabelerThresholdEnabled] = useState(false);
  const [oldLabelerThreshold, setOldLabelerThreshold] = useState("1250");
  const [isSavingOldLabelerThreshold, setIsSavingOldLabelerThreshold] = useState(false);
  const [isSavingOldLabelerThresholdToggle, setIsSavingOldLabelerThresholdToggle] = useState(false);

  // Announcement state
  const [announcementTargetRoles, setAnnouncementTargetRoles] = useState<string[]>([]);
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [announcementSent, setAnnouncementSent] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const AVAILABLE_ROLES = ["labeler", "old-labeler", "checker", "judger & admin", "recruiter"];

  // Names the roles in a stored restriction list, as the switches show them. Roles
  // saved in the list that have no switch here are listed too, so the count is never
  // a mystery.
  const restrictedRoleNames = (stored: string[]) => {
    const rolesOf = (d: string) => (d === "judger & admin" ? ["judger", "admin"] : [d]);
    const shown = AVAILABLE_ROLES.filter(d => rolesOf(d).every(r => stored.includes(r)));
    const covered = new Set(shown.flatMap(rolesOf));
    return [...shown, ...stored.filter(r => !covered.has(r)).map(r => `${r} (no switch on this page)`)];
  };

  useEffect(() => {
    fetchSettings();

    // Connect socket for announcements
    const token = getCookie("xnite_session");
    if (token) {
      socketRef.current = io(SOCKET_URL, {
        auth: { token, client: "tool" },
        transports: ["websocket"],
      });

      socketRef.current.on("announcement_sent", ({ success, count, message: msg }: { success: boolean; count?: number; message?: string }) => {
        setIsSendingAnnouncement(false);
        if (success) {
          setAnnouncementSent(true);
          toast.success(`Payout announcement sent to ${count} user(s).`);
          setTimeout(() => setAnnouncementSent(false), 4000);
        } else {
          toast.error(msg || "Failed to send announcement.");
        }
      });

      socketRef.current.on("error_message", (errMsg: string) => {
        setIsSendingAnnouncement(false);
        toast.error(errMsg);
      });
    }

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const fetchSettings = async () => {
    try {
      const [
        resSalaries, resSalariesRoles, resWithdraw, resWalkthrough, 
        resThreshold, resThresholdEnabled, resDisableWithdrawalsThreshold, resDisableWithdrawalsThresholdEnabled, 
        resNewUserSalaries, resNameWalkthrough,
        resLabelerThresholdEnabled, resLabelerThreshold,
        resOldLabelerThresholdEnabled, resOldLabelerThreshold,
        resDisableWithdrawalsLabelerEnabled, resDisableWithdrawalsLabeler,
        resDisableWithdrawalsOldLabelerEnabled, resDisableWithdrawalsOldLabeler
      ] = await Promise.all([
        fetch("/api/system-settings?key=salaries_disabled"),
        fetch("/api/system-settings?key=salaries_disabled_roles"),
        fetch("/api/system-settings?key=withdraw_disabled_roles"),
        fetch("/api/system-settings?key=wallet_walkthrough_enabled"),
        fetch("/api/system-settings?key=minimum_balance_threshold"),
        fetch("/api/system-settings?key=minimum_balance_threshold_enabled"),
        fetch("/api/system-settings?key=disable_withdrawals_balance_threshold"),
        fetch("/api/system-settings?key=disable_withdrawals_balance_enabled"),
        fetch("/api/system-settings?key=hide_salaries_new_users_enabled"),
        fetch("/api/system-settings?key=wallet_name_walkthrough_enabled"),
        fetch("/api/system-settings?key=minimum_balance_threshold_labeler_enabled"),
        fetch("/api/system-settings?key=minimum_balance_threshold_labeler"),
        fetch("/api/system-settings?key=minimum_balance_threshold_old_labeler_enabled"),
        fetch("/api/system-settings?key=minimum_balance_threshold_old_labeler"),
        fetch("/api/system-settings?key=disable_withdrawals_balance_labeler_enabled"),
        fetch("/api/system-settings?key=disable_withdrawals_balance_labeler"),
        fetch("/api/system-settings?key=disable_withdrawals_balance_old_labeler_enabled"),
        fetch("/api/system-settings?key=disable_withdrawals_balance_old_labeler")
      ]);
      const dataSalaries = await resSalaries.json();
      const dataSalariesRoles = await resSalariesRoles.json();
      const dataWithdraw = await resWithdraw.json();
      const dataWalkthrough = await resWalkthrough.json();
      const dataThreshold = await resThreshold.json();
      const dataThresholdEnabled = await resThresholdEnabled.json();
      const dataDisableWithdrawalsThreshold = await resDisableWithdrawalsThreshold.json();
      const dataDisableWithdrawalsThresholdEnabled = await resDisableWithdrawalsThresholdEnabled.json();
      const dataNewUserSalaries = await resNewUserSalaries.json();
      const dataNameWalkthrough = await resNameWalkthrough.json();
      const dataLabelerThresholdEnabled = await resLabelerThresholdEnabled.json();
      const dataLabelerThreshold = await resLabelerThreshold.json();
      const dataOldLabelerThresholdEnabled = await resOldLabelerThresholdEnabled.json();
      const dataOldLabelerThreshold = await resOldLabelerThreshold.json();
      const dataDisableWithdrawalsLabelerEnabled = await resDisableWithdrawalsLabelerEnabled.json();
      const dataDisableWithdrawalsLabeler = await resDisableWithdrawalsLabeler.json();
      const dataDisableWithdrawalsOldLabelerEnabled = await resDisableWithdrawalsOldLabelerEnabled.json();
      const dataDisableWithdrawalsOldLabeler = await resDisableWithdrawalsOldLabeler.json();
      
      if (dataSalaries.success) setIsSalariesDisabled(dataSalaries.value === "true");
      if (dataSalariesRoles.success && dataSalariesRoles.value) {
        try {
          const parsed = JSON.parse(dataSalariesRoles.value);
          if (Array.isArray(parsed)) {
            setSalariesDisabledRoles(parsed);
          }
        } catch (e) {
          // ignore
        }
      }
      if (dataWithdraw.success && dataWithdraw.value) {
        try {
          const parsed = JSON.parse(dataWithdraw.value);
          if (Array.isArray(parsed)) {
            setWithdrawDisabledRoles(parsed);
          }
        } catch (e) {
          // ignore
        }
      }
      if (dataWalkthrough.success) setIsWalkthroughEnabled(dataWalkthrough.value === "true");
      if (dataNameWalkthrough.success) setIsNameWalkthroughEnabled(dataNameWalkthrough.value === "true");
      if (dataThreshold.success && dataThreshold.value) setMinimumBalanceThreshold(dataThreshold.value);
      if (dataThresholdEnabled.success && dataThresholdEnabled.value !== null) {
        setIsThresholdEnabled(dataThresholdEnabled.value === "true");
      }
      if (dataDisableWithdrawalsThreshold.success && dataDisableWithdrawalsThreshold.value) {
        setDisableWithdrawalsThreshold(dataDisableWithdrawalsThreshold.value);
      }
      if (dataDisableWithdrawalsThresholdEnabled.success && dataDisableWithdrawalsThresholdEnabled.value !== null) {
        setIsDisableWithdrawalsThresholdEnabled(dataDisableWithdrawalsThresholdEnabled.value === "true");
      }
      if (dataDisableWithdrawalsLabelerEnabled.success && dataDisableWithdrawalsLabelerEnabled.value !== null) {
        setIsDisableWithdrawalsLabelerEnabled(dataDisableWithdrawalsLabelerEnabled.value === "true");
      }
      if (dataDisableWithdrawalsLabeler.success && dataDisableWithdrawalsLabeler.value) {
        setDisableWithdrawalsLabelerThreshold(dataDisableWithdrawalsLabeler.value);
      }
      if (dataDisableWithdrawalsOldLabelerEnabled.success && dataDisableWithdrawalsOldLabelerEnabled.value !== null) {
        setIsDisableWithdrawalsOldLabelerEnabled(dataDisableWithdrawalsOldLabelerEnabled.value === "true");
      }
      if (dataDisableWithdrawalsOldLabeler.success && dataDisableWithdrawalsOldLabeler.value) {
        setDisableWithdrawalsOldLabelerThreshold(dataDisableWithdrawalsOldLabeler.value);
      }
      if (dataNewUserSalaries.success && dataNewUserSalaries.value !== null) {
        setIsNewUserSalariesDisabled(dataNewUserSalaries.value === "true");
      }
      if (dataLabelerThresholdEnabled.success && dataLabelerThresholdEnabled.value !== null) {
        setIsLabelerThresholdEnabled(dataLabelerThresholdEnabled.value === "true");
      }
      if (dataLabelerThreshold.success && dataLabelerThreshold.value) {
        setLabelerThreshold(dataLabelerThreshold.value);
      }
      if (dataOldLabelerThresholdEnabled.success && dataOldLabelerThresholdEnabled.value !== null) {
        setIsOldLabelerThresholdEnabled(dataOldLabelerThresholdEnabled.value === "true");
      }
      if (dataOldLabelerThreshold.success && dataOldLabelerThreshold.value) {
        setOldLabelerThreshold(dataOldLabelerThreshold.value);
      }
    } catch (error) {
      console.error("Failed to fetch settings", error);
      toast.error("Failed to fetch settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSalaries = async () => {
    setIsSavingSalaries(true);
    const newValue = !isSalariesDisabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "salaries_disabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsSalariesDisabled(newValue);
        if (newValue) {
          toast.success("Salaries and withdrawals are now disabled.");
        } else {
          toast.success("Salaries and withdrawals have been re-enabled.");
        }

        // Emit socket event to notify all clients via the global ChatWidget
        window.dispatchEvent(new CustomEvent("trigger_salary_toggle", { detail: { disabled: newValue } }));
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingSalaries(false);
    }
  };

  const handleToggleRoleSalary = async (displayRole: string) => {
    setIsSavingSalariesRoles(true);
    const rolesToToggle = displayRole === "judger & admin" ? ["judger", "admin"] : [displayRole];
    const isCurrentlyDisabled = rolesToToggle.every(r => salariesDisabledRoles.includes(r));
    
    let newRoles = [...salariesDisabledRoles];
    if (isCurrentlyDisabled) {
      newRoles = newRoles.filter(r => !rolesToToggle.includes(r));
    } else {
      rolesToToggle.forEach(r => {
        if (!newRoles.includes(r)) newRoles.push(r);
      });
    }

    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "salaries_disabled_roles", value: JSON.stringify(newRoles) }),
      });
      const data = await res.json();
      if (data.success) {
        setSalariesDisabledRoles(newRoles);
        if (!isCurrentlyDisabled) {
          toast.success(`Salaries disabled for ${displayRole}.`);
        } else {
          toast.success(`Salaries enabled for ${displayRole}.`);
        }
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingSalariesRoles(false);
    }
  };

  const handleToggleRoleWithdraw = async (displayRole: string) => {
    setIsSavingWithdraw(true);
    const rolesToToggle = displayRole === "judger & admin" ? ["judger", "admin"] : [displayRole];
    const isCurrentlyDisabled = rolesToToggle.every(r => withdrawDisabledRoles.includes(r));
    
    let newRoles = [...withdrawDisabledRoles];
    if (isCurrentlyDisabled) {
      newRoles = newRoles.filter(r => !rolesToToggle.includes(r));
    } else {
      rolesToToggle.forEach(r => {
        if (!newRoles.includes(r)) newRoles.push(r);
      });
    }

    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "withdraw_disabled_roles", value: JSON.stringify(newRoles) }),
      });
      const data = await res.json();
      if (data.success) {
        setWithdrawDisabledRoles(newRoles);
        if (!isCurrentlyDisabled) {
          toast.success(`Withdrawals disabled for ${displayRole}.`);
        } else {
          toast.success(`Withdrawals enabled for ${displayRole}.`);
        }
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingWithdraw(false);
    }
  };

  const handleToggleWalkthrough = async () => {
    setIsSavingWalkthrough(true);
    const newValue = !isWalkthroughEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "wallet_walkthrough_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsWalkthroughEnabled(newValue);
        toast.success(`Wallet Walkthrough is now ${newValue ? "enabled" : "disabled"}.`);
        window.dispatchEvent(new CustomEvent("trigger_wallet_walkthrough", { detail: { enabled: newValue } }));
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingWalkthrough(false);
    }
  };

  const handleToggleNameWalkthrough = async () => {
    setIsSavingNameWalkthrough(true);
    const newValue = !isNameWalkthroughEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "wallet_name_walkthrough_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsNameWalkthroughEnabled(newValue);
        toast.success(`Name Update Walkthrough is now ${newValue ? "enabled" : "disabled"}.`);
        window.dispatchEvent(new CustomEvent("trigger_wallet_walkthrough", { detail: { enabled: newValue } }));
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingNameWalkthrough(false);
    }
  };

  const handleSaveThreshold = async () => {
    setIsSavingThreshold(true);
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "minimum_balance_threshold", value: minimumBalanceThreshold }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Minimum balance threshold updated to ₱${minimumBalanceThreshold}.`);
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingThreshold(false);
    }
  };

  const handleToggleThreshold = async () => {
    setIsSavingThresholdToggle(true);
    const newValue = !isThresholdEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "minimum_balance_threshold_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsThresholdEnabled(newValue);
        toast.success(`Minimum Balance Threshold is now ${newValue ? "enabled" : "disabled"}.`);
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingThresholdToggle(false);
    }
  };
  const handleToggleNewUserSalaries = async () => {
    setIsSavingNewUserSalaries(true);
    const newValue = !isNewUserSalariesDisabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "hide_salaries_new_users_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsNewUserSalariesDisabled(newValue);
        toast.success(`Hide salaries for new users (< 15 days) is now ${newValue ? "enabled" : "disabled"}.`);
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingNewUserSalaries(false);
    }
  };

  const handleSaveDisableWithdrawalsThreshold = async () => {
    setIsSavingDisableWithdrawalsThreshold(true);
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "disable_withdrawals_balance_threshold", value: disableWithdrawalsThreshold }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Disable withdrawals threshold updated to ₱${disableWithdrawalsThreshold}.`);
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingDisableWithdrawalsThreshold(false);
    }
  };

  const handleToggleLabelerThreshold = async () => {
    setIsSavingLabelerThresholdToggle(true);
    const newValue = !isLabelerThresholdEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "minimum_balance_threshold_labeler_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsLabelerThresholdEnabled(newValue);
        toast.success(`Labeler specific threshold is now ${newValue ? "enabled" : "disabled"}.`);
      } else {
        toast.error("Failed to update labeler threshold toggle.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingLabelerThresholdToggle(false);
    }
  };

  const handleSaveLabelerThreshold = async () => {
    setIsSavingLabelerThreshold(true);
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "minimum_balance_threshold_labeler", value: labelerThreshold }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Labeler minimum balance threshold set to ₱${labelerThreshold}`);
      } else {
        toast.error("Failed to update labeler threshold.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingLabelerThreshold(false);
    }
  };

  const handleToggleOldLabelerThreshold = async () => {
    setIsSavingOldLabelerThresholdToggle(true);
    const newValue = !isOldLabelerThresholdEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "minimum_balance_threshold_old_labeler_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsOldLabelerThresholdEnabled(newValue);
        toast.success(`Old Labeler specific threshold is now ${newValue ? "enabled" : "disabled"}.`);
      } else {
        toast.error("Failed to update old labeler threshold toggle.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingOldLabelerThresholdToggle(false);
    }
  };

  const handleSaveOldLabelerThreshold = async () => {
    setIsSavingOldLabelerThreshold(true);
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "minimum_balance_threshold_old_labeler", value: oldLabelerThreshold }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Old Labeler minimum balance threshold set to ₱${oldLabelerThreshold}`);
      } else {
        toast.error("Failed to update old labeler threshold.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingOldLabelerThreshold(false);
    }
  };

  const handleToggleDisableWithdrawalsThreshold = async () => {
    setIsSavingDisableWithdrawalsThresholdToggle(true);
    const newValue = !isDisableWithdrawalsThresholdEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "disable_withdrawals_balance_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsDisableWithdrawalsThresholdEnabled(newValue);
        toast.success(`Disable withdrawals by balance is now ${newValue ? "enabled" : "disabled"}.`);
      } else {
        toast.error("Failed to update setting");
      }
    } catch (error) {
      console.error("Failed to update setting", error);
      toast.error("An error occurred");
    } finally {
      setIsSavingDisableWithdrawalsThresholdToggle(false);
    }
  };

  const handleToggleDisableWithdrawalsLabeler = async () => {
    setIsSavingDisableWithdrawalsLabelerToggle(true);
    const newValue = !isDisableWithdrawalsLabelerEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "disable_withdrawals_balance_labeler_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsDisableWithdrawalsLabelerEnabled(newValue);
        toast.success(`Labeler specific disable withdrawal threshold is now ${newValue ? "enabled" : "disabled"}.`);
      } else {
        toast.error("Failed to update labeler disable withdrawal threshold toggle.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingDisableWithdrawalsLabelerToggle(false);
    }
  };

  const handleSaveDisableWithdrawalsLabeler = async () => {
    setIsSavingDisableWithdrawalsLabeler(true);
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "disable_withdrawals_balance_labeler", value: disableWithdrawalsLabelerThreshold }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Labeler disable withdrawals threshold set to ₱${disableWithdrawalsLabelerThreshold}`);
      } else {
        toast.error("Failed to update labeler disable withdrawals threshold.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingDisableWithdrawalsLabeler(false);
    }
  };

  const handleToggleDisableWithdrawalsOldLabeler = async () => {
    setIsSavingDisableWithdrawalsOldLabelerToggle(true);
    const newValue = !isDisableWithdrawalsOldLabelerEnabled;
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "disable_withdrawals_balance_old_labeler_enabled", value: newValue ? "true" : "false" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsDisableWithdrawalsOldLabelerEnabled(newValue);
        toast.success(`Old Labeler specific disable withdrawal threshold is now ${newValue ? "enabled" : "disabled"}.`);
      } else {
        toast.error("Failed to update old labeler disable withdrawal threshold toggle.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingDisableWithdrawalsOldLabelerToggle(false);
    }
  };

  const handleSaveDisableWithdrawalsOldLabeler = async () => {
    setIsSavingDisableWithdrawalsOldLabeler(true);
    try {
      const res = await fetch("/api/system-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "disable_withdrawals_balance_old_labeler", value: disableWithdrawalsOldLabelerThreshold }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Old Labeler disable withdrawals threshold set to ₱${disableWithdrawalsOldLabelerThreshold}`);
      } else {
        toast.error("Failed to update old labeler disable withdrawals threshold.");
      }
    } catch (error) {
      toast.error("An error occurred.");
    } finally {
      setIsSavingDisableWithdrawalsOldLabeler(false);
    }
  };

  const handleToggleAnnouncementRole = (displayRole: string) => {
    setAnnouncementTargetRoles(prev => {
      if (prev.includes(displayRole)) {
        return prev.filter(r => r !== displayRole);
      }
      return [...prev, displayRole];
    });
  };

  const handleSendAnnouncement = () => {
    if (!socketRef.current?.connected) {
      toast.error("Socket not connected. Please refresh and try again.");
      return;
    }
    setIsSendingAnnouncement(true);
    socketRef.current.emit("send_payout_announcement", {
      targetRoles: announcementTargetRoles
    });
  };

  if (isLoading) {
    return (
      <div className="w-full h-40 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#1F7A1F] dark:border-[#55f761] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-10 w-full max-w-5xl mx-auto pt-4 pb-12">
      <section>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          Salary System Control
        </h1>
        <p className="text-sm text-[#2F3E46] dark:text-white/60">
          Turn the salary and withdrawal system on or off for all users.
        </p>
      </section>

      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div>
          <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white mb-2 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            Disable Salaries & Withdrawals by Role
          </h3>
          <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mb-4">
            Switch a role <span className="font-semibold">off</span> to hide its salaries (estimated salary shown as &apos;Processing&apos;). This also blocks withdrawals for that role. Green means salaries are visible.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {AVAILABLE_ROLES.map((displayRole) => {
              const rolesToCheck = displayRole === "judger & admin" ? ["judger", "admin"] : [displayRole];
              const isDisabled = rolesToCheck.every(r => salariesDisabledRoles.includes(r));
              return (
                <div key={displayRole} className="flex items-center justify-between p-4 rounded-xl border border-black/10 dark:border-white/10 bg-white/30 dark:bg-black/30">
                  <span className="font-semibold capitalize text-[#0D1B2A] dark:text-white">{displayRole}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold uppercase transition-colors ${!isDisabled ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                      {!isDisabled ? "VISIBLE" : "HIDDEN"}
                    </span>
                    <button
                      onClick={() => handleToggleRoleSalary(displayRole)}
                      disabled={isSavingSalariesRoles || isSalariesDisabled}
                      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${!isDisabled && !isSalariesDisabled ? "bg-[#1F7A1F] dark:bg-[#55f761]" : "bg-black/20 dark:bg-white/20"} ${isSalariesDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="sr-only">Toggle {displayRole} Salaries</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${!isDisabled && !isSalariesDisabled ? "translate-x-2" : "-translate-x-2"}`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          
          {salariesDisabledRoles.length > 0 && !isSalariesDisabled && (
            <div className="mt-6 p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-start gap-3 text-[#2F3E46] dark:text-[#E0E1DD] text-sm animate-in fade-in slide-in-from-top-2">
              <Info className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Salaries hidden and withdrawals blocked for: <span className="capitalize">{restrictedRoleNames(salariesDisabledRoles).join(", ")}</span></p>
                <p className="mt-1 opacity-90">Affected users will see their estimated salary as &apos;Processing&apos; and won&apos;t be able to withdraw.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              <HandCoins className="w-5 h-5 text-orange-500" />
              Disable Withdrawals by Role (Keep Salary Visible)
            </h3>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2">
              Switch a role <span className="font-semibold">off</span> to block its withdrawals while its users still see their balances. Green means withdrawals are allowed. (A role whose salaries are hidden above is blocked either way.)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {AVAILABLE_ROLES.map((displayRole) => {
            const rolesToCheck = displayRole === "judger & admin" ? ["judger", "admin"] : [displayRole];
            const isDisabled = rolesToCheck.every(r => withdrawDisabledRoles.includes(r));
            return (
              <div key={displayRole} className="flex items-center justify-between p-4 rounded-xl border border-black/10 dark:border-white/10 bg-white/30 dark:bg-black/30">
                <span className="font-semibold capitalize text-[#0D1B2A] dark:text-white">{displayRole}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold uppercase transition-colors ${!isDisabled ? "text-[#1F7A1F] dark:text-[#55f761]" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                    {!isDisabled ? "ALLOWED" : "BLOCKED"}
                  </span>
                  <button
                    onClick={() => handleToggleRoleWithdraw(displayRole)}
                    disabled={isSavingWithdraw}
                    className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${!isDisabled ? "bg-[#1F7A1F] dark:bg-[#55f761]" : "bg-black/20 dark:bg-white/20"}`}
                  >
                    <span className="sr-only">Toggle {displayRole} Withdrawals</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${!isDisabled ? "translate-x-2" : "-translate-x-2"}`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {withdrawDisabledRoles.length > 0 && (
          <div className="mt-6 p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-start gap-3 text-[#2F3E46] dark:text-[#E0E1DD] text-sm animate-in fade-in slide-in-from-top-2">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Withdrawals blocked for: <span className="capitalize">{restrictedRoleNames(withdrawDisabledRoles).join(", ")}</span></p>
              <p className="mt-1 opacity-90">Affected users can see their balances, but cannot successfully submit a withdrawal.</p>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" />
              Global Wallet Walkthrough
            </h3>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2">
              If enabled, users who visit the Wallet page (with an unlocked wallet) and are missing a QR image or payment method will see a forced tutorial overlay prompting them to update their payment method.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-4">
            <span className={`text-sm font-bold transition-colors ${isWalkthroughEnabled ? "text-blue-600 dark:text-blue-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
              {isWalkthroughEnabled ? "ENABLED" : "DISABLED"}
            </span>
            <button
              onClick={handleToggleWalkthrough}
              disabled={isSavingWalkthrough}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isWalkthroughEnabled ? "bg-blue-500" : "bg-black/20 dark:bg-white/20"}`}
            >
              <span className="sr-only">Toggle Wallet Walkthrough</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isWalkthroughEnabled ? "translate-x-3" : "-translate-x-3"}`}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" />
              Name Update Walkthrough
            </h3>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2">
              If enabled, users whose payment last name is missing or does not match their account last name will be forced to update it via the walkthrough.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-4">
            <span className={`text-sm font-bold transition-colors ${isNameWalkthroughEnabled ? "text-blue-600 dark:text-blue-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
              {isNameWalkthroughEnabled ? "ENABLED" : "DISABLED"}
            </span>
            <button
              onClick={handleToggleNameWalkthrough}
              disabled={isSavingNameWalkthrough}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isNameWalkthroughEnabled ? "bg-blue-500" : "bg-black/20 dark:bg-white/20"}`}
            >
              <span className="sr-only">Toggle Name Update Walkthrough</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNameWalkthroughEnabled ? "translate-x-3" : "-translate-x-3"}`}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-purple-500" />
              Hide Salary if Wallet Balance is Below Threshold
            </h3>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2">
              When ENABLED, users must have at least the minimum balance set below to see their salary. If their balance is below this amount, their salary will show as 'Processing'. When DISABLED, all users can see their salaries regardless of their balance.
            </p>
          </div>
          
          <div className="shrink-0 flex flex-wrap items-center gap-4">
            <div className="shrink-0 flex items-center gap-4 mr-4">
              <span className={`text-sm font-bold transition-colors ${isThresholdEnabled ? "text-purple-600 dark:text-purple-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                {isThresholdEnabled ? "ENABLED" : "DISABLED"}
              </span>
              <button
                onClick={handleToggleThreshold}
                disabled={isSavingThresholdToggle}
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isThresholdEnabled ? "bg-purple-500" : "bg-black/20 dark:bg-white/20"}`}
              >
                <span className="sr-only">Toggle Hide Salaries Threshold</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isThresholdEnabled ? "translate-x-3" : "-translate-x-3"}`}
                />
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2F3E46]/50 dark:text-white/40 font-bold">₱</span>
              <input
                type="number"
                value={minimumBalanceThreshold}
                onChange={(e) => setMinimumBalanceThreshold(e.target.value)}
                className="w-32 pl-8 pr-4 py-2 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl text-[#0D1B2A] dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                placeholder="1250"
              />
            </div>
            <button
              onClick={handleSaveThreshold}
              disabled={isSavingThreshold}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                isSavingThreshold
                  ? "bg-purple-500/50 text-white cursor-not-allowed"
                  : "bg-purple-500 hover:bg-purple-600 text-white hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              {isSavingThreshold ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="border-t border-black/10 dark:border-white/10 pt-6 mt-2">
            <h4 className="text-md font-bold text-[#0D1B2A] dark:text-white mb-2">Override for 'Labeler' Role</h4>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mb-4">When ENABLED, this specific threshold will be used for 'labeler' users instead of the global threshold above.</p>
            <div className="shrink-0 flex flex-wrap items-center gap-4">
              <div className="shrink-0 flex items-center gap-4 mr-4">
                <span className={`text-sm font-bold transition-colors ${isLabelerThresholdEnabled ? "text-purple-600 dark:text-purple-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                  {isLabelerThresholdEnabled ? "ENABLED" : "DISABLED"}
                </span>
                <button
                  onClick={handleToggleLabelerThreshold}
                  disabled={isSavingLabelerThresholdToggle}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isLabelerThresholdEnabled ? "bg-purple-500" : "bg-black/20 dark:bg-white/20"}`}
                >
                  <span className="sr-only">Toggle Labeler Threshold</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isLabelerThresholdEnabled ? "translate-x-3" : "-translate-x-3"}`}
                  />
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2F3E46]/50 dark:text-white/40 font-bold">₱</span>
                <input
                  type="number"
                  value={labelerThreshold}
                  onChange={(e) => setLabelerThreshold(e.target.value)}
                  className="w-32 pl-8 pr-4 py-2 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl text-[#0D1B2A] dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  placeholder="1250"
                />
              </div>
              <button
                onClick={handleSaveLabelerThreshold}
                disabled={isSavingLabelerThreshold}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  isSavingLabelerThreshold
                    ? "bg-purple-500/50 text-white cursor-not-allowed"
                    : "bg-purple-500 hover:bg-purple-600 text-white hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                {isSavingLabelerThreshold ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="border-t border-black/10 dark:border-white/10 pt-6 mt-2">
            <h4 className="text-md font-bold text-[#0D1B2A] dark:text-white mb-2">Override for 'Old-Labeler' Role</h4>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mb-4">When ENABLED, this specific threshold will be used for 'old-labeler' users instead of the global threshold above.</p>
            <div className="shrink-0 flex flex-wrap items-center gap-4">
              <div className="shrink-0 flex items-center gap-4 mr-4">
                <span className={`text-sm font-bold transition-colors ${isOldLabelerThresholdEnabled ? "text-purple-600 dark:text-purple-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                  {isOldLabelerThresholdEnabled ? "ENABLED" : "DISABLED"}
                </span>
                <button
                  onClick={handleToggleOldLabelerThreshold}
                  disabled={isSavingOldLabelerThresholdToggle}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isOldLabelerThresholdEnabled ? "bg-purple-500" : "bg-black/20 dark:bg-white/20"}`}
                >
                  <span className="sr-only">Toggle Old Labeler Threshold</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isOldLabelerThresholdEnabled ? "translate-x-3" : "-translate-x-3"}`}
                  />
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2F3E46]/50 dark:text-white/40 font-bold">₱</span>
                <input
                  type="number"
                  value={oldLabelerThreshold}
                  onChange={(e) => setOldLabelerThreshold(e.target.value)}
                  className="w-32 pl-8 pr-4 py-2 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl text-[#0D1B2A] dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  placeholder="1250"
                />
              </div>
              <button
                onClick={handleSaveOldLabelerThreshold}
                disabled={isSavingOldLabelerThreshold}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  isSavingOldLabelerThreshold
                    ? "bg-purple-500/50 text-white cursor-not-allowed"
                    : "bg-purple-500 hover:bg-purple-600 text-white hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                {isSavingOldLabelerThreshold ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Disable Withdrawals by Wallet Value
            </h3>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2">
              Set the minimum balance required for users to make withdrawals. Users below this threshold will have their withdrawals disabled.
            </p>
          </div>
          
          <div className="shrink-0 flex flex-wrap items-center gap-4">
            <div className="shrink-0 flex items-center gap-4 mr-4">
              <span className={`text-sm font-bold transition-colors ${isDisableWithdrawalsThresholdEnabled ? "text-red-600 dark:text-red-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                {isDisableWithdrawalsThresholdEnabled ? "ENABLED" : "DISABLED"}
              </span>
              <button
                onClick={handleToggleDisableWithdrawalsThreshold}
                disabled={isSavingDisableWithdrawalsThresholdToggle}
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isDisableWithdrawalsThresholdEnabled ? "bg-red-500" : "bg-black/20 dark:bg-white/20"}`}
              >
                <span className="sr-only">Toggle Disable Withdrawals Threshold</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isDisableWithdrawalsThresholdEnabled ? "translate-x-3" : "-translate-x-3"}`}
                />
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2F3E46]/50 dark:text-white/40 font-bold">₱</span>
              <input
                type="number"
                value={disableWithdrawalsThreshold}
                onChange={(e) => setDisableWithdrawalsThreshold(e.target.value)}
                className="w-32 pl-8 pr-4 py-2 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl text-[#0D1B2A] dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="1250"
              />
            </div>
            <button
              onClick={handleSaveDisableWithdrawalsThreshold}
              disabled={isSavingDisableWithdrawalsThreshold}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                isSavingDisableWithdrawalsThreshold
                  ? "bg-red-500/50 text-white cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-600 text-white hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              {isSavingDisableWithdrawalsThreshold ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="border-t border-black/10 dark:border-white/10 pt-6 mt-2">
            <h4 className="text-md font-bold text-[#0D1B2A] dark:text-white mb-2">Override for 'Labeler' Role</h4>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mb-4">When ENABLED, this specific disable withdrawals threshold will be used for 'labeler' users instead of the global threshold above.</p>
            <div className="shrink-0 flex flex-wrap items-center gap-4">
              <div className="shrink-0 flex items-center gap-4 mr-4">
                <span className={`text-sm font-bold transition-colors ${isDisableWithdrawalsLabelerEnabled ? "text-red-600 dark:text-red-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                  {isDisableWithdrawalsLabelerEnabled ? "ENABLED" : "DISABLED"}
                </span>
                <button
                  onClick={handleToggleDisableWithdrawalsLabeler}
                  disabled={isSavingDisableWithdrawalsLabelerToggle}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isDisableWithdrawalsLabelerEnabled ? "bg-red-500" : "bg-black/20 dark:bg-white/20"}`}
                >
                  <span className="sr-only">Toggle Labeler Disable Withdrawals Threshold</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isDisableWithdrawalsLabelerEnabled ? "translate-x-3" : "-translate-x-3"}`}
                  />
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2F3E46]/50 dark:text-white/40 font-bold">₱</span>
                <input
                  type="number"
                  value={disableWithdrawalsLabelerThreshold}
                  onChange={(e) => setDisableWithdrawalsLabelerThreshold(e.target.value)}
                  className="w-32 pl-8 pr-4 py-2 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl text-[#0D1B2A] dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="1250"
                />
              </div>
              <button
                onClick={handleSaveDisableWithdrawalsLabeler}
                disabled={isSavingDisableWithdrawalsLabeler}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  isSavingDisableWithdrawalsLabeler
                    ? "bg-red-500/50 text-white cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600 text-white hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                {isSavingDisableWithdrawalsLabeler ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="border-t border-black/10 dark:border-white/10 pt-6 mt-2">
            <h4 className="text-md font-bold text-[#0D1B2A] dark:text-white mb-2">Override for 'Old-Labeler' Role</h4>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mb-4">When ENABLED, this specific disable withdrawals threshold will be used for 'old-labeler' users instead of the global threshold above.</p>
            <div className="shrink-0 flex flex-wrap items-center gap-4">
              <div className="shrink-0 flex items-center gap-4 mr-4">
                <span className={`text-sm font-bold transition-colors ${isDisableWithdrawalsOldLabelerEnabled ? "text-red-600 dark:text-red-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                  {isDisableWithdrawalsOldLabelerEnabled ? "ENABLED" : "DISABLED"}
                </span>
                <button
                  onClick={handleToggleDisableWithdrawalsOldLabeler}
                  disabled={isSavingDisableWithdrawalsOldLabelerToggle}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isDisableWithdrawalsOldLabelerEnabled ? "bg-red-500" : "bg-black/20 dark:bg-white/20"}`}
                >
                  <span className="sr-only">Toggle Old Labeler Disable Withdrawals Threshold</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isDisableWithdrawalsOldLabelerEnabled ? "translate-x-3" : "-translate-x-3"}`}
                  />
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2F3E46]/50 dark:text-white/40 font-bold">₱</span>
                <input
                  type="number"
                  value={disableWithdrawalsOldLabelerThreshold}
                  onChange={(e) => setDisableWithdrawalsOldLabelerThreshold(e.target.value)}
                  className="w-32 pl-8 pr-4 py-2 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl text-[#0D1B2A] dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  placeholder="1250"
                />
              </div>
              <button
                onClick={handleSaveDisableWithdrawalsOldLabeler}
                disabled={isSavingDisableWithdrawalsOldLabeler}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  isSavingDisableWithdrawalsOldLabeler
                    ? "bg-red-500/50 text-white cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600 text-white hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                {isSavingDisableWithdrawalsOldLabeler ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-500" />
              Hide Salaries for New Users (&lt; 15 Days Old)
            </h3>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2">
              Automatically hide salaries (displayed as ₱0.00) for users whose accounts were created less than 15 days ago.
            </p>
          </div>
          
          <div className="shrink-0 flex items-center gap-4">
            <span className={`text-sm font-bold transition-colors ${isNewUserSalariesDisabled ? "text-indigo-600 dark:text-indigo-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
              {isNewUserSalariesDisabled ? "ENABLED" : "DISABLED"}
            </span>
            <button
              onClick={handleToggleNewUserSalaries}
              disabled={isSavingNewUserSalaries}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isNewUserSalariesDisabled ? "bg-indigo-500" : "bg-black/20 dark:bg-white/20"}`}
            >
              <span className="sr-only">Toggle Hide Salaries for New Users</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isNewUserSalariesDisabled ? "translate-x-3" : "-translate-x-3"}`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Send Payout Announcement */}
      <section className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-amber-500" />
              Send Payout Announcement
            </h3>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/60 mt-2">
              Instantly notify selected roles that payout rates have been updated. Online users will see a{" "}
              <span className="text-red-500 font-semibold">red dot</span> on their notification bell. Offline users will see it on next login.
            </p>
          </div>

          {/* Premade announcement preview */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">Announcement Preview</p>
            <p className="text-sm font-semibold text-[#0D1B2A] dark:text-white">📢 Payout Update</p>
            <p className="text-sm text-[#2F3E46]/80 dark:text-white/70">
              Payout rates have been updated. Please check your wallet for the latest payout information.
            </p>
          </div>

          {/* Role targeting — same toggle card style as other sections */}
          <div>
            <p className="text-sm font-semibold text-[#0D1B2A] dark:text-white mb-3">Send to roles:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {AVAILABLE_ROLES.map((displayRole) => {
                const isSelected = announcementTargetRoles.includes(displayRole);
                return (
                  <div key={displayRole} className="flex items-center justify-between p-4 rounded-xl border border-black/10 dark:border-white/10 bg-white/30 dark:bg-black/30">
                    <span className="font-semibold capitalize text-[#0D1B2A] dark:text-white">{displayRole}</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase transition-colors ${isSelected ? "text-amber-500 dark:text-amber-400" : "text-[#2F3E46]/50 dark:text-white/40"}`}>
                        {isSelected ? "SELECTED" : "SKIP"}
                      </span>
                      <button
                        onClick={() => handleToggleAnnouncementRole(displayRole)}
                        className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isSelected ? "bg-amber-500" : "bg-black/20 dark:bg-white/20"}`}
                      >
                        <span className="sr-only">Toggle {displayRole}</span>
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${isSelected ? "translate-x-2" : "-translate-x-2"}`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {announcementTargetRoles.length === 0 && (
              <div className="mt-4 p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-start gap-3 text-[#2F3E46] dark:text-[#E0E1DD] text-sm animate-in fade-in slide-in-from-top-2">
                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">No roles selected</p>
                  <p className="mt-1 opacity-90">Please select at least one role to send the announcement.</p>
                </div>
              </div>
            )}
            {announcementTargetRoles.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3 text-[#2F3E46] dark:text-[#E0E1DD] text-sm animate-in fade-in slide-in-from-top-2">
                <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-bold">Sending to {announcementTargetRoles.length} role(s)</p>
                  <p className="mt-1 opacity-90">{announcementTargetRoles.join(", ")}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-black/10 dark:border-white/10 mt-2">
            <button
              id="send-payout-announcement-btn"
              onClick={handleSendAnnouncement}
              disabled={isSendingAnnouncement || announcementSent || announcementTargetRoles.length === 0}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                announcementSent
                  ? "bg-[#1F7A1F] dark:bg-[#55f761] text-white dark:text-[#0D1B2A] cursor-default"
                  : isSendingAnnouncement
                  ? "bg-amber-500/60 text-white cursor-not-allowed"
                  : announcementTargetRoles.length === 0
                  ? "bg-black/20 dark:bg-white/20 text-[#2F3E46]/50 dark:text-white/40 cursor-not-allowed"
                  : "bg-amber-500 hover:bg-amber-600 text-white cursor-pointer hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              {announcementSent ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Sent!
                </>
              ) : isSendingAnnouncement ? (
                 <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Megaphone className="w-4 h-4" />
                  Send Payout Announcement
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
