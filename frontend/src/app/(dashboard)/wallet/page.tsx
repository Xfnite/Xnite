"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import ConfirmPaymentModal from "@/app/components/ConfirmPaymentModal";
import { ArrowUp, ArrowDown, Wallet } from "lucide-react";
import { getSessionUser } from "@/app/actions/auth";
import { decodeSessionEmailUnsafe } from "@/lib/decodeSessionEmail";
import { createPortal } from "react-dom";
import RawComputationModal from "@/app/components/RawComputationModal";

const PAYMENT_PROVIDERS = [
  {
    id: "gcash",
    name: "GCash",
    icon: (
      <img
        src="/gcash.png"
        alt="GCash"
        className="w-8 h-8 object-contain dark:bg-white dark:p-1 dark:rounded-md"
      />
    ),
  },
  {
    id: "maya",
    name: "Maya",
    icon: (
      <img
        src="/maya.png"
        alt="Maya"
        className="w-12 h-8 object-contain scale-[1.3] translate-y-1.5"
      />
    ),
  },
  {
    id: "binance",
    name: "Binance",
    icon: (
      <svg
        className="w-8 h-8 text-[#F3BA2F]"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="currentColor" fillOpacity="0.2" />
        <path d="M12 6L16 10L12 14L8 10L12 6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 18L14 16M12 18L10 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "paypal",
    name: "PayPal",
    icon: (
      <svg
        className="w-8 h-8 text-[#0079C1] dark:text-[#009CDE]"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14 6H9C8.44772 6 8 6.44772 8 7V17H11.5L12.5 12H15.5C17.433 12 19 10.433 19 8.5C19 6.567 17.433 6 15.5 6H14Z" fill="currentColor" fillOpacity="0.2" />
        <path d="M14 6H9C8.44772 6 8 6.44772 8 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.5 17L12.5 12H15.5C17.433 12 19 10.433 19 8.5C19 6.567 17.433 6 15.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "bank_bpi",
    name: "BPI",
    icon: (
      <div className="w-10 h-7 bg-[#B31942] text-white flex items-center justify-center rounded font-bold text-xs tracking-tight select-none">
        BPI
      </div>
    ),
  },
  {
    id: "bank_bdo",
    name: "BDO",
    icon: (
      <div className="w-10 h-7 bg-[#0038A8] text-[#FFC72C] flex items-center justify-center rounded font-black text-xs tracking-tight select-none">
        BDO
      </div>
    ),
  },
  {
    id: "bank_securitybank",
    name: "Security Bank",
    icon: (
      <div className="w-10 h-7 bg-[#00A859] text-white flex items-center justify-center rounded font-bold text-[9px] leading-none text-center tracking-tighter select-none p-0.5">
        Security Bank
      </div>
    ),
  },
  {
    id: "bank_gotyme",
    name: "GoTyme",
    icon: (
      <div className="w-10 h-7 bg-[#1E293B] text-[#10B981] flex items-center justify-center rounded font-black text-[10px] tracking-tight select-none border border-[#10B981]/30">
        GoTyme
      </div>
    ),
  },
  {
    id: "bank_landbank",
    name: "Landbank",
    icon: (
      <div className="w-10 h-7 bg-[#15803D] text-[#FEF08A] flex items-center justify-center rounded font-bold text-[9px] leading-none text-center tracking-tighter select-none p-0.5">
        Landbank
      </div>
    ),
  },
  {
    id: "bank_other",
    name: "Other Bank",
    icon: (
      <svg
        className="w-8 h-8"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M3 21H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 10H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 3L2 8V10H22V8L12 3Z" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const ERROR_STATUSES = [
  "INVALID/BLURRED QR - Regenerate QR and update MOP",
  "UPDATE MOP IN XFNITE.CLOUD",
  "Payment method name must match account holder or immediate family. UPDATE MOP",
  "CHANGE MOP",
  "GCASH ERROR",
  "NO MOP",
  "DOUBLE ERROR BUG"
].map(s => s.toLowerCase());

export default function EarningsPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // UI State
  const [activeTab, setActiveTab] = useState<"earnings" | "payment">(
    "earnings",
  );
  const [paymentStep, setPaymentStep] = useState<1 | 2>(1);

  // Payment Details State
  const [payeeName, setPayeeName] = useState("");
  const [payeeLastName, setPayeeLastName] = useState("");
  const [payeeUid, setPayeeUid] = useState("");
  const [confirmPayeeUid, setConfirmPayeeUid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showWithdrawConfirmModal, setShowWithdrawConfirmModal] = useState(false);
  const [isCheckingWithdraw, setIsCheckingWithdraw] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showRawModal, setShowRawModal] = useState(false);
  const [selectedRawData, setSelectedRawData] = useState<Record<string, any> | null>(null);
  const [selectedTotalAmount, setSelectedTotalAmount] = useState<number | undefined>(undefined);

  // OTP State
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  // Seconds until "Resend code" unlocks (mirrors the server's wait between sends).
  // Counted from a deadline, not by ticking down, so a long wait stays right after the
  // tab has been in the background.
  const [resendAt, setResendAt] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const startResendWait = (seconds: number) => {
    setResendAt(Date.now() + seconds * 1000);
    setResendIn(seconds);
  };
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendIn(left);
      if (left === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  // Income State
  const [currentIncome, setCurrentIncome] = useState<any>(null);
  const [incomeHistory, setIncomeHistory] = useState<any[]>([]);
  const [queueInfo, setQueueInfo] = useState<{ position: number | null, total: number } | null>(null);
  const [globalLastUpdatedAt, setGlobalLastUpdatedAt] = useState<string | null>(null);

  // Investment State
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [stakedBalance, setStakedBalance] = useState<number>(0);
  const [userRole, setUserRole] = useState("");

  // System Settings State
  const [hideSalariesEnabled, setHideSalariesEnabled] = useState(false);
  const [hideSalariesThreshold, setHideSalariesThreshold] = useState(1250);
  const [disableWithdrawalsEnabled, setDisableWithdrawalsEnabled] = useState(true);
  const [disableWithdrawalsThreshold, setDisableWithdrawalsThreshold] = useState(1500);
  const [disableWithdrawalsLabelerEnabled, setDisableWithdrawalsLabelerEnabled] = useState(false);
  const [disableWithdrawalsLabelerThreshold, setDisableWithdrawalsLabelerThreshold] = useState(1500);
  const [disableWithdrawalsOldLabelerEnabled, setDisableWithdrawalsOldLabelerEnabled] = useState(false);
  const [disableWithdrawalsOldLabelerThreshold, setDisableWithdrawalsOldLabelerThreshold] = useState(1500);

  // Load from local storage on mount to persist earnings across refreshes
  useEffect(() => {
    const savedWallet = localStorage.getItem("xfnite_walletBalance_v3");
    const savedStaked = localStorage.getItem("xfnite_stakedBalance_v3");
    if (savedWallet) setWalletBalance(parseFloat(savedWallet));
    if (savedStaked) setStakedBalance(parseFloat(savedStaked));

    // Fetch dynamic system settings
    const fetchSettings = async () => {
      try {
        const res = await fetch(
          "/api/system-settings?keys=" + [
            "minimum_balance_threshold_enabled",
            "minimum_balance_threshold",
            "disable_withdrawals_balance_enabled",
            "disable_withdrawals_balance_threshold",
            "disable_withdrawals_balance_labeler_enabled",
            "disable_withdrawals_balance_labeler",
            "disable_withdrawals_balance_old_labeler_enabled",
            "disable_withdrawals_balance_old_labeler",
          ].join(",")
        );
        const data = await res.json();
        if (!data.success) return;
        const v: Record<string, string | null> = data.values;

        if (v.minimum_balance_threshold_enabled != null) {
          setHideSalariesEnabled(v.minimum_balance_threshold_enabled === 'true');
        }
        if (v.minimum_balance_threshold != null) {
          setHideSalariesThreshold(Number(v.minimum_balance_threshold) || 1250);
        }
        if (v.disable_withdrawals_balance_enabled != null) {
          setDisableWithdrawalsEnabled(v.disable_withdrawals_balance_enabled === 'true');
        }
        if (v.disable_withdrawals_balance_threshold != null) {
          setDisableWithdrawalsThreshold(Number(v.disable_withdrawals_balance_threshold) || 1500);
        }
        if (v.disable_withdrawals_balance_labeler_enabled != null) {
          setDisableWithdrawalsLabelerEnabled(v.disable_withdrawals_balance_labeler_enabled === 'true');
        }
        if (v.disable_withdrawals_balance_labeler != null) {
          setDisableWithdrawalsLabelerThreshold(Number(v.disable_withdrawals_balance_labeler) || 1500);
        }
        if (v.disable_withdrawals_balance_old_labeler_enabled != null) {
          setDisableWithdrawalsOldLabelerEnabled(v.disable_withdrawals_balance_old_labeler_enabled === 'true');
        }
        if (v.disable_withdrawals_balance_old_labeler != null) {
          setDisableWithdrawalsOldLabelerThreshold(Number(v.disable_withdrawals_balance_old_labeler) || 1500);
        }
      } catch (err) {
        console.error("Failed to load system settings", err);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const handleSalariesUpdate = (e: CustomEvent) => {
      const disabled = e.detail?.disabled;
      if (disabled) {
        setWalletBalance(0);
        setStakedBalance(0);
        setCurrentIncome((prev: any) => prev ? { ...prev, estimatedAmount: 0 } : null);
      } else if (email) {
        fetchData(email);
      }
    };

    window.addEventListener("salaries_updated", handleSalariesUpdate as EventListener);
    return () => window.removeEventListener("salaries_updated", handleSalariesUpdate as EventListener);
  }, [email]);



  useEffect(() => {
    // Prioritize getting primary email from session, then cookie, then ginger scraped data fallback
    getSessionUser().then((user) => {
      if (user?.role) setUserRole(user.role);
      let userEmail = user?.email || "";
      if (!userEmail) {
        userEmail = decodeSessionEmailUnsafe(getCookie("xnite_session") || "") || "";
      }
      if (!userEmail) {
        const data = localStorage.getItem("scrapedGingerData");
        if (data) {
          try {
            const parsed = JSON.parse(data);
            userEmail = parsed?.user?.email || parsed?.email || "";
          } catch (e) {
            console.error("Failed to parse user data", e);
          }
        }
      }

      if (userEmail) {
        setEmail(userEmail);
        fetchData(userEmail);
      } else {
        setIsLoading(false);
      }
    }).catch((err) => {
      console.error("Failed to get session user on mount:", err);
      let userEmail = decodeSessionEmailUnsafe(getCookie("xnite_session") || "") || "";
      if (!userEmail) {
        const data = localStorage.getItem("scrapedGingerData");
        if (data) {
          try {
            const parsed = JSON.parse(data);
            userEmail = parsed?.user?.email || parsed?.email || "";
          } catch (e) {
            console.error("Failed to parse user data", e);
          }
        }
      }
      if (userEmail) {
        setEmail(userEmail);
        fetchData(userEmail);
      } else {
        setIsLoading(false);
      }
    });
  }, []);

  const fetchData = async (userEmail: string) => {
    setIsLoading(true);
    try {
      const payRes = await fetch(
        `/api/user/payment?email=${encodeURIComponent(userEmail)}`,
      );
      const payData = await payRes.json();
      if (payData.success && payData.data) {
        setPayeeName(payData.data.payeeName || "");
        setPayeeLastName(payData.data.lastName || "");
        setPayeeUid(payData.data.payeeUid || "");
        setConfirmPayeeUid(payData.data.payeeUid || "");

        if (payData.data.paymentMethod) {
          setPaymentMethod(payData.data.paymentMethod);
          setPaymentStep(2);
          setIsEditing(false);
        } else {
          setIsEditing(true);
        }
      } else {
        setIsEditing(true);
      }

      const incRes = await fetch(
        `/api/user/income?email=${encodeURIComponent(userEmail)}`,
      );
      const incData = await incRes.json();
      if (incData.success && incData.data) {
        setCurrentIncome(incData.data.current);
        setIncomeHistory(incData.data.history || []);
        if (incData.data.queueInfo) setQueueInfo(incData.data.queueInfo);
        if (incData.data.globalLastUpdatedAt) setGlobalLastUpdatedAt(incData.data.globalLastUpdatedAt);
      }
    } catch (err) {
      toast.error("Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMethod = (methodId: string) => {
    const isCurrentlySaved = methodId === paymentMethod || (methodId === "bank_other" && paymentMethod.startsWith("bank_other_"));
    setPaymentMethod(methodId);
    setPaymentStep(2);
    if (!isCurrentlySaved) {
      setPayeeName("");
      setPayeeLastName("");
      setPayeeUid("");
      setConfirmPayeeUid("");
    } else {
      setConfirmPayeeUid(payeeUid);
    }
  };

  const handleInitiateSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error("User email not found");
    setShowConfirmModal(true);
  };

  const executeSavePayment = async () => {
    setShowConfirmModal(false);
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          payeeName,
          lastName: payeeLastName,
          payeeUid,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Payment details saved successfully!");
        setIsEditing(false);
      } else {
        toast.error(data.error || "Failed to update payment details");
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  // Tell the user up front when withdrawals are closed, instead of after they confirm.
  const handleWithdrawClick = async () => {
    setIsCheckingWithdraw(true);
    try {
      const data = await (await fetch("/api/user/withdraw", { cache: "no-store" })).json();
      if (!data.success) return toast.error(data.error || "Failed to process withdrawal");
      setShowWithdrawConfirmModal(true);
    } catch (err) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsCheckingWithdraw(false);
    }
  };

  const handleInitiateWithdraw = async () => {
    if (!email) return toast.error("User email not found");
    setIsRequestingOtp(true);
    const toastId = toast.loading("Sending OTP...");
    try {
      const res = await fetch("/api/user/payment/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email, purpose: "withdraw" }),
      });
      const data = await res.json();
      if (data.success && data.alreadyVerified) {
        // An OTP verified in an earlier attempt still covers this withdrawal.
        toast.success("OTP already verified. Tap Withdraw to finish.", { id: toastId });
        setOtpVerified(true);
      } else if (data.success) {
        toast.success("OTP sent to your email", { id: toastId });
        setShowOtpInput(true);
        setOtpValue(""); // a resend replaces the previous code
        startResendWait(data.retryAfter ?? 120);
      } else if (data.otpPending) {
        // The earlier code is still valid — let them enter it instead of waiting.
        toast.info("An OTP was already sent to your email. Enter it to continue.", { id: toastId });
        setShowOtpInput(true);
        startResendWait(data.retryAfter ?? 0);
      } else {
        if (data.retryAfter) startResendWait(data.retryAfter);
        toast.error(data.error || "Failed to send OTP", { id: toastId });
      }
    } catch (err) {
      toast.error("An unexpected error occurred", { id: toastId });
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleVerifyAndWithdraw = async () => {
    if (!email) return toast.error("User email not found");
    if (!otpVerified && (!otpValue || otpValue.length < 6)) return toast.error("Please enter a valid OTP");
    
    setIsVerifyingOtp(true);
    const toastId = toast.loading(otpVerified ? "Processing withdrawal..." : "Verifying OTP & Processing withdrawal...");
    try {
      // First verify OTP (skipped on a retry — the code is single-use and already verified)
      const otpData = otpVerified ? { success: true } : await (await fetch("/api/user/payment/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, otp: otpValue, purpose: "withdraw" }),
      })).json();
      
      if (!otpData.success) {
        if (otpData.otpExpired) {
          // Code is gone — go back to the step that requests a new one.
          setShowOtpInput(false);
          setOtpValue("");
        }
        setIsVerifyingOtp(false);
        return toast.error(otpData.error || "Invalid OTP", { id: toastId });
      }
      setOtpVerified(true);
      
      // If verified, proceed with withdrawal
      const res = await fetch("/api/user/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Withdrawal submitted & sending", {
          id: toastId,
          description: "Your withdrawal request has been received and is being processed.",
          duration: 5000,
        });
        // Refresh data to show updated income and history
        fetchData(email);
        setShowWithdrawConfirmModal(false);
        setShowOtpInput(false);
        setOtpValue("");
        setOtpVerified(false);
      } else {
        if (data.otpRequired) {
          // The verified pass expired — a new OTP is needed.
          setOtpVerified(false);
          setShowOtpInput(false);
          setOtpValue("");
        }
        toast.error(data.error || "Failed to process withdrawal", { id: toastId });
      }
    } catch (err) {
      toast.error("An unexpected error occurred", { id: toastId });
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const selectedProvider = PAYMENT_PROVIDERS.find(
    (p) => p.id === paymentMethod || (p.id === "bank_other" && paymentMethod.startsWith("bank_other_"))
  );

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60">
        <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-3"></div>
        Loading data...
      </div>
    );
  }

  const validStatuses = ["Fill-out claim form", "can be claimed next cut-off", "Sent"];
  const isStatusValid = validStatuses.includes(currentIncome?.status || "") || (currentIncome?.status || "").toLowerCase().includes("claim");
  const rawDisplayAmount = isStatusValid ? (currentIncome?.actualEstimatedAmount ?? currentIncome?.estimatedAmount ?? 0) : 0;

  // Apply "Hide Salaries" logic based on dynamic threshold
  const isSalaryHidden = (currentIncome?.isHiddenReason === "threshold" || currentIncome?.isHiddenReason === "new_user" || currentIncome?.isHiddenReason === "role") && rawDisplayAmount > 0;
  const displayAmount = isStatusValid ? (currentIncome?.estimatedAmount ?? 0) : 0;

  let finalWithdrawDisabledEnabled = disableWithdrawalsEnabled;
  let finalWithdrawDisabledThreshold = disableWithdrawalsThreshold;

  if (userRole === 'labeler' && disableWithdrawalsLabelerEnabled) {
    finalWithdrawDisabledEnabled = true;
    finalWithdrawDisabledThreshold = disableWithdrawalsLabelerThreshold;
  } else if (userRole === 'old-labeler' && disableWithdrawalsOldLabelerEnabled) {
    finalWithdrawDisabledEnabled = true;
    finalWithdrawDisabledThreshold = disableWithdrawalsOldLabelerThreshold;
  }

  // Apply "Disable Withdrawals" logic based on dynamic threshold
  const isWithdrawDisabled = finalWithdrawDisabledEnabled ? (rawDisplayAmount < finalWithdrawDisabledThreshold) : false;

  const canViewComputation = ['labeler', 'old-labeler', 'recruiter', 'checker', 'admin', 'judger'].includes(userRole);
  const hasRawComputation = currentIncome?.rawComputation && Object.keys(currentIncome.rawComputation).length > 0;
  const canViewCurrentComputation = canViewComputation && (rawDisplayAmount > 0 || hasRawComputation);

  let queueUI = null;
  if (isSalaryHidden && currentIncome?.isHiddenReason === "role") {
    const aheadOfYou = queueInfo && queueInfo.position !== null ? Math.max(0, queueInfo.position - 1) : 0;
    const baseMins = aheadOfYou * 10;
    const baseHours = baseMins / 60;
    
    let minH = Math.round(baseHours);
    let maxH = Math.round(baseHours * 1.5);
    
    if (baseHours < 12) {
      minH = 12;
      maxH = 18;
    }
    
    const percentage = queueInfo ? Math.max(5, 100 - ((aheadOfYou) / Math.max(1, queueInfo.total - 1)) * 100) : 5;

    queueUI = (
      <div className="flex flex-col gap-2 mt-3 w-full min-w-[280px]">
        <div className="flex justify-between items-end gap-4">
          <span className="text-sm font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
            {aheadOfYou} <span className="text-xs text-[#2F3E46]/50 dark:text-white/40 font-normal normal-case tracking-normal">people ahead of you</span>
          </span>
          <span className="text-xs font-bold text-[#2F3E46]/70 dark:text-white/60 tracking-tight">
            est ~{minH} to {maxH} Hours
          </span>
        </div>
        <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-orange-500 h-full rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        {/* EARNINGS TAB */}
        {activeTab === "earnings" && (
          <div className="space-y-8">
            {/* Current Income Row */}
            <div
              onClick={() => {
                if (canViewCurrentComputation && currentIncome?.rawComputation) {
                  setSelectedRawData(currentIncome.rawComputation);
                  setSelectedTotalAmount(rawDisplayAmount);
                  setShowRawModal(true);
                }
              }}
              title={canViewCurrentComputation ? "Show calculation" : undefined}
              className={`bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${canViewCurrentComputation ? 'group hover:scale-[1.01] active:scale-[0.995] hover:border-black/20 dark:hover:border-white/20 hover:shadow-lg hover:shadow-black/5 cursor-pointer' : ''}`}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full blur-2xl -translate-y-12 translate-x-12"></div>
              <div className="flex items-center justify-between gap-6 relative z-10">
                <div>
                  <div className="text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-2">
                    Final Payment
                  </div>
                  <div className="flex items-center gap-3 mb-0">
                    <span className="text-4xl font-black text-[#0D1B2A] dark:text-white tracking-tighter">
                      {isSalaryHidden ? (
                        queueUI ? (
                          <div className="flex flex-col">
                            <span className="text-orange-500 text-3xl mb-1">Processing...</span>
                            {queueUI}
                          </div>
                        ) : (
                          <span className="text-orange-500">Processing... <p className="text-xs font-medium text-[#0D1B2A] dark:text-white tracking-[0.5px] mt-2"> Please wait for next cut-off</p></span>
                        )
                      ) : (
                        <>
                          ₱
                          {displayAmount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleWithdrawClick();
                    }}
                    disabled={isWithdrawDisabled || !paymentMethod || !payeeUid || isSalaryHidden || isCheckingWithdraw}
                    className="px-6 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
                  >
                    Withdraw
                  </button>
                  <div className="text-xs font-medium text-[#2F3E46]/80 dark:text-white/60">
                    {!paymentMethod || !payeeUid ? "Please set a payment method first" : (finalWithdrawDisabledEnabled && !isWithdrawDisabled ? `Min. ₱${finalWithdrawDisabledThreshold.toLocaleString("en-US", { minimumFractionDigits: 2 })} to withdraw` : "")}
                  </div>
                </div>
              </div>
            </div>

            {/* History Section */}
            <div>
              <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white mb-4">
                Payout History
              </h2>
              {incomeHistory.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {incomeHistory.slice((currentPage - 1) * 10, currentPage * 10).map((history, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        const canViewThisHistory = canViewComputation && (history.amountPaid || 0) > 0;
                        if (canViewThisHistory && history.rawComputation) {
                          setSelectedRawData(history.rawComputation);
                          setSelectedTotalAmount(history.amountPaid);
                          setShowRawModal(true);
                        }
                      }}
                      title={canViewComputation && (history.amountPaid || 0) > 0 ? "Show calculation" : undefined}
                      className={`flex flex-col bg-white/40 dark:bg-black/40 backdrop-blur-md rounded-xl border border-black/10 dark:border-white/5 shadow-sm overflow-hidden transition-colors ${canViewComputation && (history.amountPaid || 0) > 0 ? 'hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 cursor-pointer' : ''}`}
                    >
                      {/* Top Section */}
                      <div className="flex items-start justify-between px-5 py-3 border-b border-black/5 dark:border-white/5">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                            {history.status?.toLowerCase() === 'sent' && history.payoutDate
                              ? new Date(history.payoutDate).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : history.createdAt
                                ? new Date(history.createdAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                : "N/A"
                            }
                          </span>
                          {history.status?.toLowerCase() !== 'sent' && (
                            ERROR_STATUSES.includes((history.status || "").toLowerCase()) ? (
                              <div className="flex flex-col gap-1 mt-0.5 min-w-[140px] w-auto">
                                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider whitespace-nowrap">
                                  Stopped, Please fix issue first.
                                </span>
                              </div>
                            ) : queueInfo && queueInfo.position !== null ? (
                              <div className="flex flex-col gap-1 mt-0.5 min-w-[140px] w-auto">
                                <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider whitespace-nowrap">
                                  {queueInfo.position - 1} <span className="text-[9px] text-[#2F3E46]/50 dark:text-white/40 font-normal">people ahead of you</span>
                                </span>
                                <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1 overflow-hidden">
                                  <div
                                    className="bg-orange-500 h-full rounded-full transition-all duration-1000 ease-out"
                                    style={{ width: `${Math.max(5, 100 - ((queueInfo.position - 1) / Math.max(1, queueInfo.total - 1)) * 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            ) : null
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#0D1B2A] dark:text-white capitalize">
                              {paymentMethod || "Withdrawal"}
                            </span>
                            {history.status?.toLowerCase() === 'sent' ? (
                              <svg className="w-4 h-4 text-[#1F7A1F] dark:text-[#55f761]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            ) : ERROR_STATUSES.includes((history.status || "").toLowerCase()) ? (
                              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                            )}
                          </div>
                          <span className="text-xs text-[#2F3E46]/60 dark:text-white/50 font-mono font-medium">
                            #{history.id ? history.id.split('-')[0].toUpperCase() : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Section (Key-Value Rows) */}
                      <div className="flex flex-col px-5 py-3 gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-[#2F3E46]/80 dark:text-white/70">Total Payout</span>
                          <span className={`text-base font-bold ${history.status?.toLowerCase() === 'sent' ? 'text-[#1F7A1F] dark:text-[#55f761]' : 'text-orange-600 dark:text-orange-400'}`}>
                            ₱{history.amountPaid?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-sm text-[#2F3E46]/80 dark:text-white/70 whitespace-nowrap">Status</span>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-sm font-bold capitalize text-right max-w-xs ${history.status?.toLowerCase() === 'sent' ? 'text-[#1F7A1F] dark:text-[#55f761]' : ERROR_STATUSES.includes((history.status || "").toLowerCase()) ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>
                              {history.status || "Sending"}
                            </span>
                            {globalLastUpdatedAt && history.status?.toLowerCase() !== 'sent' && (
                              <span className="text-[10px] text-[#2F3E46]/50 dark:text-white/40 italic">
                                Status last updated at: {new Date(globalLastUpdatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {incomeHistory.length > 10 && (
                    <div className="flex items-center justify-between mt-4">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 text-xs font-bold bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg disabled:opacity-30 transition-all hover:bg-gray-50 dark:hover:bg-black"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-medium text-[#2F3E46]/70 dark:text-white/50">
                        Page {currentPage} of {Math.ceil(incomeHistory.length / 10)}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(incomeHistory.length / 10), p + 1))}
                        disabled={currentPage === Math.ceil(incomeHistory.length / 10)}
                        className="px-4 py-2 text-xs font-bold bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-lg disabled:opacity-30 transition-all hover:bg-gray-50 dark:hover:bg-black"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-[#2F3E46]/50 dark:text-white/50">
                  No history found
                </div>
              )}
            </div>
          </div>
        )}

        {/* PAYMENT TAB */}
        {activeTab === "payment" && (
          <div className="space-y-6">
            {!isEditing && payeeUid && paymentMethod ? (
              <div>
                <div className="flex justify-between items-center mb-4 w-full max-w-md mx-auto">
                  <div className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
                    Current Payment Method
                  </div>
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setPaymentStep(1);
                    }}
                    className="text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 px-3 py-1.5 rounded-full transition-colors"
                  >
                    Change Payment Method
                  </button>
                </div>

                <div className={`w-full max-w-md h-[240px] rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl transition-all duration-500 hover:scale-[1.01] flex flex-col justify-between mx-auto ${paymentMethod.toLowerCase() === "gcash" ? "bg-gradient-to-br from-[#0057E7] to-[#0080FF] shadow-[#0057E7]/20" :
                  paymentMethod.toLowerCase() === "maya" ? "bg-gradient-to-br from-[#00E676] to-[#00B0FF] shadow-[#00E676]/20" :
                    paymentMethod.toLowerCase() === "binance" ? "bg-gradient-to-br from-[#121212] to-[#2D2D2D] border border-yellow-500/30 shadow-black/40" :
                      paymentMethod.toLowerCase() === "paypal" ? "bg-gradient-to-br from-[#003087] to-[#0079C1] shadow-[#003087]/20" :
                        paymentMethod === "bank_bpi" ? "bg-gradient-to-br from-[#B31942] to-[#E63946] shadow-[#B31942]/20" :
                          paymentMethod === "bank_bdo" ? "bg-gradient-to-br from-[#0038A8] to-[#1E40AF] shadow-[#0038A8]/20" :
                            paymentMethod === "bank_securitybank" ? "bg-gradient-to-br from-[#00A859] to-[#047857] shadow-[#00A859]/20" :
                              paymentMethod === "bank_gotyme" ? "bg-gradient-to-br from-[#0F172A] to-[#1E293B] border border-[#10B981]/30 shadow-[#10B981]/10" :
                                paymentMethod === "bank_landbank" ? "bg-gradient-to-br from-[#15803D] to-[#166534] shadow-[#15803D]/20" :
                                  "bg-gradient-to-br from-[#2F3E46] to-[#354F52] shadow-slate-500/20"
                  }`}>
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -translate-y-10 translate-x-10 pointer-events-none"></div>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/70">
                        {paymentMethod.startsWith("bank_") ? "Bank Transfer" : "Digital Wallet"}
                      </p>
                      <h4 className="text-xl font-black tracking-tight mt-1">
                        {paymentMethod.startsWith("bank_")
                          ? (paymentMethod.startsWith("bank_other_") ? paymentMethod.substring(11) : selectedProvider?.name)
                          : selectedProvider?.name}
                      </h4>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center justify-center">
                      {selectedProvider?.icon}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-white/60">Account Name</p>
                      <p className="text-base font-bold tracking-tight truncate">{payeeName}</p>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-white/60">
                          {paymentMethod.startsWith("bank_") ? "Account Number" : "Details / Number"}
                        </p>
                        <p className="text-sm font-mono tracking-wider truncate max-w-md">{payeeUid}</p>
                      </div>
                      <span className="text-[10px] font-bold text-white/90 bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">
                        Default
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {paymentStep === 1 ? (
                  <div>
                    <div className="text-sm font-semibold text-[#0D1B2A] dark:text-white mb-4">
                      Select Payment Provider
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {PAYMENT_PROVIDERS.map((provider) => (
                        <button
                          key={provider.id}
                          onClick={() =>
                            handleSelectMethod(provider.id)
                          }
                          className={`flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md ${paymentMethod === provider.id
                            ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F] dark:border-[#55f761] ring-2 ring-[#1F7A1F]/20 dark:ring-[#55f761]/20"
                            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30"
                            }`}
                        >
                          <div className="text-[#0D1B2A] dark:text-white mb-3 opacity-90 h-10 flex items-center justify-center">
                            {provider.icon}
                          </div>
                          <span className="text-xs font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider">
                            {provider.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={handleInitiateSave}
                    className="space-y-6"
                  >
                    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden p-6">
                      <div className="flex justify-between items-center mb-6 border-b border-black/10 dark:border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-[#0D1B2A] dark:text-white opacity-80 scale-90">
                            {selectedProvider?.icon}
                          </span>
                          <span className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                            {selectedProvider?.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPaymentStep(1)}
                          className="text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 px-3 py-1.5 rounded-full transition-colors"
                        >
                          Change
                        </button>
                      </div>

                      <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-2">
                              First Name
                            </label>
                            <input
                              className="w-full bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                              type="text"
                              required
                              value={payeeName}
                              onChange={(e) =>
                                setPayeeName(e.target.value)
                              }
                              placeholder="e.g. John"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-2">
                              Last Name
                            </label>
                            <input
                              className="w-full bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                              type="text"
                              required
                              value={payeeLastName}
                              onChange={(e) =>
                                setPayeeLastName(e.target.value)
                              }
                              placeholder="e.g. Doe"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xActive Stakes font-semibold text-[#2F3E46] dark:text-white/60 mb-2">
                            {paymentMethod.startsWith("bank_") ? "Account Number" : "Account Details (Number / UID / Email)"}
                          </label>
                          <input
                            className="w-full max-w-md bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                            type="text"
                            required
                            onCopy={(e) => e.preventDefault()}
                            onPaste={(e) => e.preventDefault()}
                            value={payeeUid}
                            onChange={(e) =>
                              setPayeeUid(e.target.value)
                            }
                            placeholder="Enter your account details"
                          />
                          <p className="text-xs text-[#2F3E46]/60 dark:text-white/40 mt-2 flex items-center gap-1.5">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-yellow-500"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line
                                x1="12"
                                y1="16"
                                x2="12.01"
                                y2="16"
                              />
                            </svg>
                            Carefully verify this number to avoid
                            transfer failures.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-2">
                            {paymentMethod.startsWith("bank_") ? "Confirm Account Number" : "Confirm Account Details"}
                          </label>
                          <input
                            className="w-full max-w-md bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                            type="text"
                            required
                            onCopy={(e) => e.preventDefault()}
                            onPaste={(e) => e.preventDefault()}
                            value={confirmPayeeUid}
                            onChange={(e) =>
                              setConfirmPayeeUid(e.target.value)
                            }
                            placeholder="Re-enter your account details"
                          />
                          {payeeUid && confirmPayeeUid && payeeUid !== confirmPayeeUid && (
                            <p className="text-xs text-red-500 font-semibold mt-2">
                              Account details do not match.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      {payeeUid && (
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="px-6 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white text-sm font-bold rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSaving || !payeeUid || payeeUid !== confirmPayeeUid}
                        className="px-8 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                      >
                        {isSaving ? "Saving..." : "Save Details"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmPaymentModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={executeSavePayment}
        providerName={selectedProvider?.name}
        payeeName={payeeName}
        payeeLastName={payeeLastName}
        payeeUid={payeeUid}
      />

      {/* Withdraw Confirmation Modal */}
      {showWithdrawConfirmModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#060D14] rounded-[2rem] shadow-[0_0_40px_rgba(31,122,31,0.15)] dark:shadow-[0_0_40px_rgba(85,247,97,0.1)] w-full max-w-md border border-black/10 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 pb-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full flex items-center justify-center mb-6 ring-4 ring-[#1F7A1F]/5 dark:ring-[#55f761]/5">
                <Wallet className="w-8 h-8 text-[#1F7A1F] dark:text-[#55f761]" />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-[#0D1B2A] dark:text-white mb-2">
                Withdraw Funds
              </h2>
              <p className="text-sm text-[#2F3E46] dark:text-white/60 mb-6">
                You are about to submit a withdrawal request. Please review your details below.
              </p>

              <div className="w-full bg-black/5 dark:bg-white/5 rounded-2xl p-5 border border-black/5 dark:border-white/5 mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-1">Amount</p>
                <p className="text-3xl font-black text-[#0D1B2A] dark:text-white mb-4">
                  {isSalaryHidden ? "Processing..." : (
                    <>
                      ₱{displayAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </>
                  )}
                </p>

                <div className="h-px w-full bg-black/5 dark:bg-white/5 mb-4"></div>

                <div className="space-y-3 text-left">
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 shrink-0">Payout Method</span>
                    <span className="text-sm font-bold text-[#0D1B2A] dark:text-white text-right truncate">
                      {paymentMethod
                        ? (paymentMethod.startsWith("bank_other_") ? paymentMethod.substring(11) : (selectedProvider?.name || paymentMethod))
                        : 'Not set'}
                    </span>
                  </div>
                  {paymentMethod && (
                    <>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 shrink-0">Account Name</span>
                        <span className="text-sm font-bold text-[#0D1B2A] dark:text-white text-right truncate">{payeeName || '—'}</span>
                      </div>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 shrink-0">
                          {paymentMethod.startsWith("bank_") ? "Account Number" : "Details / Number"}
                        </span>
                        <span className="text-sm font-mono font-bold tracking-wider text-[#0D1B2A] dark:text-white text-right truncate">{payeeUid || '—'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              {showOtpInput && !otpVerified && (
                <div className="w-full mb-6">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-4 text-center">
                    Enter the 6-digit OTP sent to your email to finish your withdrawal
                  </label>
                  <div className="flex justify-center gap-2 sm:gap-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <input
                        key={index}
                        id={`otp-input-${index}`}
                        type="text"
                        maxLength={1}
                        value={otpValue[index] || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          
                          // Handle standard typing
                          const newOtp = otpValue.split("");
                          newOtp[index] = val || "";
                          setOtpValue(newOtp.join("").slice(0, 6));
                          
                          // Auto advance if value was typed
                          if (val && index < 5) {
                            document.getElementById(`otp-input-${index + 1}`)?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace") {
                            // If current box is empty, delete previous and move focus there
                            if (!otpValue[index] && index > 0) {
                              const newOtp = otpValue.split("");
                              newOtp[index - 1] = "";
                              setOtpValue(newOtp.join(""));
                              document.getElementById(`otp-input-${index - 1}`)?.focus();
                            }
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                          if (pasted) {
                            setOtpValue(pasted);
                            const nextIndex = Math.min(pasted.length, 5);
                            document.getElementById(`otp-input-${nextIndex}`)?.focus();
                          }
                        }}
                        className="w-10 h-12 sm:w-12 sm:h-14 bg-black/5 dark:bg-white/5 text-center text-xl sm:text-2xl font-black text-[#0D1B2A] dark:text-white border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all"
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleInitiateWithdraw}
                    disabled={isRequestingOtp || isVerifyingOtp || resendIn > 0}
                    className="mt-4 text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                  >
                    {resendIn > 0 ? `Resend code in ${formatCountdown(resendIn)}` : "Didn't get the code? Resend"}
                  </button>
                </div>
              )}
            </div>

            <div className="px-8 pb-8 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowWithdrawConfirmModal(false);
                  setShowOtpInput(false);
                  setOtpValue("");
                  setOtpVerified(false);
                }}
                className="flex-1 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 px-4 py-3.5 text-sm font-bold text-[#0D1B2A] dark:text-white transition-all duration-200"
              >
                Cancel
              </button>
              {!showOtpInput && !otpVerified ? (
                <button
                  type="button"
                  onClick={handleInitiateWithdraw}
                  disabled={isRequestingOtp}
                  className="flex-1 rounded-xl bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] px-4 py-3.5 text-sm font-bold text-white dark:text-[#060D14] transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRequestingOtp ? "Sending OTP..." : "Confirm"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleVerifyAndWithdraw}
                  disabled={isVerifyingOtp || (!otpVerified && otpValue.length < 6)}
                  className="flex-1 rounded-xl bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] px-4 py-3.5 text-sm font-bold text-white dark:text-[#060D14] transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isVerifyingOtp ? (otpVerified ? "Processing..." : "Verifying...") : (otpVerified ? "Withdraw" : "Verify & Withdraw")}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <RawComputationModal
        isOpen={showRawModal}
        onClose={() => setShowRawModal(false)}
        data={selectedRawData}
        totalAmount={selectedTotalAmount}
        isProcessing={isSalaryHidden}
      />
    </>
  );
}

function ActionButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className="flex flex-col items-center gap-2 lg:gap-3 group">
      <div className="w-[52px] h-[52px] lg:w-[64px] lg:h-[64px] rounded-tr-2xl rounded-bl-2xl bg-white/60 dark:bg-black/60 border border-black/10 dark:border-white/10 shadow-sm flex items-center justify-center text-[#0D1B2A] dark:text-white/80 group-hover:bg-white dark:group-hover:bg-white/10 group-hover:text-[#1F7A1F] dark:group-hover:text-white group-hover:border-black/20 dark:group-hover:border-white/20 hover:scale-105 active:scale-95 transition-all duration-300">
        <div className="scale-100 lg:scale-110">{icon}</div>
      </div>
      <span className="text-[11px] lg:text-xs font-medium text-[#2F3E46] dark:text-white/60 group-hover:text-[#0D1B2A] dark:group-hover:text-white/90 transition-colors">
        {label}
      </span>
    </button>
  );
}

// "45s", "4:59", "23h 59m" — the wait before another OTP can run from seconds to a day.
function formatCountdown(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return `${seconds}s`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

