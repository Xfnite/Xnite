"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import ConfirmPaymentModal from "@/app/components/ConfirmPaymentModal";
import { getSessionUser } from "@/app/actions/auth";
import { decodeSessionEmailUnsafe } from "@/lib/decodeSessionEmail";
import { QrCode, Upload, ExternalLink, X as XIcon } from "lucide-react";
import { toUserFacingError } from "@/lib/userFacingError";
import { splitFullName } from "@/lib/nameUtils";

const PAYMENT_PROVIDERS = [
  {
    id: "gcash",
    name: "GCash",
    icon: (
      <img
        src="/gcash.png"
        alt="GCash"
        className="w-10 h-10 object-contain dark:bg-white dark:p-1 dark:rounded-md"
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
        className="w-14 h-10 object-contain scale-[1.3] translate-y-1.5"
      />
    ),
  },
  {
    id: "binance",
    name: "Binance",
    icon: (
      <img
        src="/binance.svg"
        alt="Binance"
        className="w-10 h-10 object-contain"
      />
    ),
  },
  {
    id: "paypal",
    name: "PayPal",
    icon: (
      <img
        src="/paypal.svg"
        alt="PayPal"
        className="w-10 h-10 object-contain"
      />
    ),
  },
  {
    id: "bank_bpi",
    name: "BPI",
    icon: (
      <img
        src="/BPI.svg"
        alt="BPI"
        className="w-10 h-10 object-contain"
      />
    ),
  },
  {
    id: "bank_bdo",
    name: "BDO",
    icon: (
      <img
        src="/BDO.svg"
        alt="BDO"
        className="w-10 h-10 object-contain"
      />
    ),
  },
  {
    id: "bank_securitybank",
    name: "Security Bank",
    icon: (
      <img
        src="/securitybank.jpeg"
        alt="Security Bank"
        className="w-10 h-10 object-contain rounded-md"
      />
    ),
  },
  {
    id: "bank_gotyme",
    name: "GoTyme",
    icon: (
      <img
        src="/GoTyme.svg"
        alt="GoTyme"
        className="w-10 h-10 object-contain"
      />
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
    id: "bank_metrobank",
    name: "Metrobank",
    icon: (
      <img
        src="/Metrobank.svg"
        alt="Metrobank"
        className="w-10 h-10 object-contain"
      />
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

export default function PaymentMethodPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [paymentStep, setPaymentStep] = useState<1 | 2>(1);
  const [payeeName, setPayeeName] = useState("");
  const [payeeLastName, setPayeeLastName] = useState("");
  const [payeeUid, setPayeeUid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  
  // Temporary editing states (used inside modals during configuration)
  const [editingMethod, setEditingMethod] = useState("");
  const [editingPayeeName, setEditingPayeeName] = useState("");
  const [editingPayeeLastName, setEditingPayeeLastName] = useState("");
  const [editingPayeeUid, setEditingPayeeUid] = useState("");
  const [editingConfirmPayeeUid, setEditingConfirmPayeeUid] = useState("");
  const [editingCustomBank, setEditingCustomBank] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [userLastName, setUserLastName] = useState("");

  // QR Upload States
  const [savedQrUrl, setSavedQrUrl] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [isDraggingQr, setIsDraggingQr] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  // OTP Verification States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if user has changed personal details (name, number, or payment provider)
  const resolvedEditingMethod = editingMethod === "bank_other" ? `bank_other_${editingCustomBank}` : editingMethod;
  const hasExistingPayment = Boolean(paymentMethod && payeeUid);

  const isNameChanged = hasExistingPayment && (
    editingPayeeName.trim().toLowerCase() !== payeeName.trim().toLowerCase() ||
    editingPayeeLastName.trim().toLowerCase() !== payeeLastName.trim().toLowerCase()
  );

  const isNumberChanged = hasExistingPayment && (
    editingPayeeUid.trim() !== payeeUid.trim()
  );

  const isMethodChanged = hasExistingPayment && (
    resolvedEditingMethod !== paymentMethod
  );

  // If ANY account detail (name, number, or provider) changed from the saved record,
  // require a brand new QR code because QR code is the primary mode of sending salaries.
  const hasAccountDetailsChanged = isNameChanged || isNumberChanged || isMethodChanged;

  const isQrValid = qrFile !== null || (!hasAccountDetailsChanged && Boolean(savedQrUrl && (qrLink === savedQrUrl || qrPreview === savedQrUrl)));

  useEffect(() => {
    setMounted(true);
    
    // Prioritize getting primary email from session, then cookie, then ginger scraped data fallback
    getSessionUser().then(async (user) => {
      let userEmail = user?.email || "";
      let resolvedLastName = user?.lastName || "";
      
      try {
        const accRes = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const accData = await accRes.json();
        if (accData.success) {
          const kDetails = accData.data?.koala_user_details || accData.koala_user_details;
          if (kDetails) {
            resolvedLastName = kDetails.db_lastName || kDetails.lastName || resolvedLastName;
          }
        }
      } catch (e) {
        console.error("Failed to fetch /api/account for last name check", e);
      }

      if (resolvedLastName) {
        setUserLastName(resolvedLastName);
      } else if (user?.name) {
        const split = splitFullName(user.name);
        if (split.lastName) {
          setUserLastName(split.lastName);
        }
      }
      
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

  // OTP Countdown timer
  useEffect(() => {
    if (showOtpModal) {
      setOtpCountdown(5 * 60); // 5 minutes in seconds
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      otpTimerRef.current = setInterval(() => {
        setOtpCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(otpTimerRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      setOtpCountdown(0);
    }
    return () => {
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    };
  }, [showOtpModal]);

  const fetchData = async (userEmail: string) => {
    setIsLoading(true);
    try {
      const payRes = await fetch(`/api/user/payment?email=${encodeURIComponent(userEmail)}`);
      const payData = await payRes.json();
      if (payData.success && payData.data && payData.data.paymentMethod) {
        setPaymentMethod(payData.data.paymentMethod || "");
        setPayeeName(payData.data.payeeName || "");
        setPayeeLastName(payData.data.lastName || "");
        setPayeeUid(payData.data.payeeUid || "");
        setSavedQrUrl(payData.data.qrImageUrl || null);
        setQrPreview(payData.data.qrImageUrl || null);
        setQrLink(payData.data.qrImageUrl || null);

        const dbMethod = payData.data.paymentMethod;
        if (dbMethod.startsWith("bank_")) {
          if (dbMethod.startsWith("bank_other_")) {
            setPaymentMethod("bank_other");
            setCustomBankName(dbMethod.substring(11));
          } else {
            setPaymentMethod(dbMethod);
            setCustomBankName("");
          }
        } else {
          setPaymentMethod(dbMethod);
          setCustomBankName("");
        }

        setPaymentStep(2);
        setIsEditing(false);
      } else {
        setPayeeName("");
        setPayeeLastName("");
        setPayeeUid("");
        setSavedQrUrl(null);
        setQrPreview(null);
        setQrLink(null);
        setPaymentMethod("");
        setCustomBankName("");
        setPaymentStep(1);
        setIsEditing(false);
      }
    } catch (err) {
      toast.error("Failed to load payment data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMethod = (methodId: string) => {
    setEditingMethod(methodId);

    // If the selected method is the one saved in DB, load saved details, otherwise empty them
    const isCurrentlySaved =
      methodId === paymentMethod ||
      (methodId === "bank_other" && paymentMethod.startsWith("bank_other_"));

    if (isCurrentlySaved) {
      setEditingMethod(paymentMethod);
      setEditingPayeeName(payeeName);
      setEditingPayeeLastName(payeeLastName);
      setEditingPayeeUid(payeeUid);
      setEditingConfirmPayeeUid(payeeUid);
      setEditingCustomBank(customBankName);
      setQrFile(null);
      setQrPreview(savedQrUrl);
      setQrLink(savedQrUrl);
    } else {
      setEditingMethod(methodId);
      setEditingPayeeName("");
      setEditingPayeeLastName("");
      setEditingPayeeUid("");
      setEditingConfirmPayeeUid("");
      setEditingCustomBank("");
      setQrFile(null);
      setQrPreview(null);
      setQrLink(null);
    }

    setPaymentStep(2); // Go straight to enter details
    setIsEditing(true); // Ensure details modal stays open
  };

  const acceptQrFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file.");
      return;
    }
    setQrFile(file);
    setQrLink(null);
    const reader = new FileReader();
    reader.onload = (ev) => setQrPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptQrFile(e.target.files?.[0]);
  };

  const handleQrDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingQr(true);
  };

  const handleQrDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingQr(false);
  };

  const handleQrDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingQr(false);
    acceptQrFile(e.dataTransfer.files?.[0]);
  };

  const handleQrUpload = async (): Promise<string | null> => {
    if (!qrFile || !email) return null;
    setQrUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", qrFile);

      const res = await fetch("/api/user/payment/qr-upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed with status ${res.status}`);
      }

      const data = await res.json();
      if (!data.success || !data.url) {
        throw new Error(data.error || "No URL returned from upload endpoint.");
      }

      setQrLink(data.url);
      toast.success("QR code uploaded successfully!");
      return data.url;
    } catch (err: any) {
      toast.error(toUserFacingError(err, "QR upload failed. Please try again."));
      return null;
    } finally {
      setQrUploading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await fetch("/api/user/payment/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, otp: otpCode }),
      });
      const data = await res.json();
      if (data.success && data.verified) {
        toast.success("OTP verified successfully!");
        
        // Upload QR first (if one was selected but not yet uploaded)
        let resolvedQrLink = qrLink;
        if (qrFile && !qrLink) {
          resolvedQrLink = await handleQrUpload();
        }
        if (!resolvedQrLink) {
          toast.error("A payment QR code is required to save payment details.");
          setIsSaving(false);
          setOtpLoading(false);
          return;
        }

        if (hasAccountDetailsChanged && resolvedQrLink === savedQrUrl) {
          toast.error("A new QR code is required whenever you change your name or account number.");
          setIsSaving(false);
          setOtpLoading(false);
          return;
        }

        // Save the payment details to the database now
        setIsSaving(true);
        let finalMethod = editingMethod;
        if (editingMethod === "bank_other") {
          finalMethod = `bank_other_${editingCustomBank}`;
        }

        const saveRes = await fetch("/api/user/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            payeeName: editingPayeeName,
            lastName: editingPayeeLastName,
            payeeUid: editingPayeeUid,
            paymentMethod: finalMethod,
            ...(resolvedQrLink && { qrImageUrl: resolvedQrLink }),
          }),
        });
        const saveData = await saveRes.json();
        
        if (saveData.success) {
          toast.success("Payment details saved successfully!");
          window.dispatchEvent(new Event("wallet_payment_updated"));
          
          // Sync editing state to active state
          setPaymentMethod(finalMethod);
          setPayeeName(editingPayeeName);
          setPayeeLastName(editingPayeeLastName);
          setPayeeUid(editingPayeeUid);
          setCustomBankName(editingMethod === "bank_other" ? editingCustomBank : "");
          setSavedQrUrl(resolvedQrLink);
          setQrFile(null);
          setQrPreview(resolvedQrLink);
          setQrLink(resolvedQrLink);

          setShowOtpModal(false);
          setIsEditing(false);
        } else {
          setOtpError(saveData.error || "Failed to update payment details");
        }
        setIsSaving(false);
      } else {
        setOtpError(data.error || "Invalid OTP code");
      }
    } catch (err) {
      setOtpError("Verification failed");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCancelOtp = () => {
    setShowOtpModal(false);
    setIsEditing(true);
    setPaymentStep(2); // Go back to the enter details step
  };

  const handleInitiateSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error("User email not found");

    if (hasAccountDetailsChanged && !qrFile) {
      return toast.error("You changed your account details (name or number). Please upload a new QR code as it is the primary mode of sending salaries.");
    }

    if (!qrFile && !qrLink && !qrPreview) {
      return toast.error("Please upload your payment QR code before saving.");
    }
    
    // Validate last name before opening confirm modal
    if (!editingPayeeLastName || (userLastName && editingPayeeLastName.trim().toLowerCase() !== userLastName.trim().toLowerCase())) {
      setShowMismatchModal(true);
      return;
    }

    let finalMethod = editingMethod;
    if (editingMethod === "bank_other") {
      finalMethod = `bank_other_${editingCustomBank}`;
    }

    const hasChanged = 
      finalMethod !== paymentMethod ||
      editingPayeeName !== payeeName ||
      editingPayeeLastName !== payeeLastName ||
      editingPayeeUid !== payeeUid ||
      qrFile !== null;

    if (!hasChanged) {
      toast.info("No changes to save.");
      setIsEditing(false);
      return;
    }

    setIsEditing(false); // Close current details pop up
    setShowConfirmModal(true); // Show confirm modal
  };

  const executeSavePayment = async () => {
    setShowConfirmModal(false);
    setShowOtpModal(true);
    setOtpError("");
    setOtpCode("");
    
    try {
      const res = await fetch("/api/user/payment/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("OTP sent to your email!");
      } else {
        setOtpError(data.error || "Failed to send OTP");
      }
    } catch (err) {
      setOtpError("Failed to initiate OTP request");
    }
  };

  const selectedProvider = PAYMENT_PROVIDERS.find(
    (p) => p.id === paymentMethod || (p.id === "bank_other" && paymentMethod.startsWith("bank_other_"))
  );

  const selectedEditingProvider = PAYMENT_PROVIDERS.find(
    (p) => p.id === editingMethod || (p.id === "bank_other" && editingMethod.startsWith("bank_other_"))
  );

  const filteredProviders = PAYMENT_PROVIDERS.filter((p) =>
    p.name.toLowerCase().includes(providerSearch.toLowerCase())
  );

  const renderPortal = (content: React.ReactNode) => {
    if (!mounted || typeof document === "undefined") return null;
    return createPortal(content, document.body);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[#2F3E46] dark:text-white/60">
        <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-3"></div>
        Loading data...
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-full">
      {/* 1. Base Content on Page */}
      {paymentMethod && payeeUid ? (
        // Saved View
        <div className="animate-in fade-in duration-200">
          <div className="flex justify-between items-center mb-4 lg:mb-6 w-full">
            <div className="text-sm font-semibold text-[#0D1B2A] dark:text-white">
              Current Payment Method
            </div>
            <button
              id="wallet-tour-change-btn"
              onClick={() => {
                setIsEditing(true);
                setPaymentStep(1);
                setProviderSearch("");
                setEditingMethod(paymentMethod);
              }}
              className="text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
            >
              Change Payment Method
            </button>
          </div>

          <div className="flex flex-col gap-6">
            <div className={`w-full max-w-sm h-[240px] rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl transition-all duration-500 hover:scale-[1.01] flex flex-col justify-between ${
            paymentMethod === "gcash" ? "bg-gradient-to-br from-[#0057E7] to-[#0080FF] shadow-[#0057E7]/20" :
            paymentMethod === "maya" ? "bg-gradient-to-br from-[#00E676] to-[#00B0FF] shadow-[#00E676]/20" :
            paymentMethod === "binance" ? "bg-gradient-to-br from-[#121212] to-[#2D2D2D] border border-yellow-500/30 shadow-black/40" :
            paymentMethod === "paypal" ? "bg-gradient-to-br from-[#003087] to-[#0079C1] shadow-[#003087]/20" :
            paymentMethod === "bank_bpi" ? "bg-gradient-to-br from-[#B31942] to-[#E63946] shadow-[#B31942]/20" :
            paymentMethod === "bank_bdo" ? "bg-gradient-to-br from-[#0038A8] to-[#1E40AF] shadow-[#0038A8]/20" :
            paymentMethod === "bank_securitybank" ? "bg-gradient-to-br from-[#00A859] to-[#047857] shadow-[#00A859]/20" :
            paymentMethod === "bank_gotyme" ? "bg-gradient-to-br from-[#0F172A] to-[#1E293B] border border-[#10B981]/30 shadow-[#10B981]/10" :
            paymentMethod === "bank_landbank" ? "bg-gradient-to-br from-[#15803D] to-[#166534] shadow-[#15803D]/20" :
            paymentMethod === "bank_metrobank" ? "bg-gradient-to-br from-[#003893] to-[#00529B] shadow-[#003893]/20" :
            "bg-gradient-to-br from-[#2F3E46] to-[#354F52] shadow-slate-500/20"
          }`}>
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -translate-y-10 translate-x-10 pointer-events-none"></div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/70 font-semibold">
                  {paymentMethod.startsWith("bank_") ? "Bank Transfer" : "Digital Wallet"}
                </p>
                <h4 className="text-xl font-black tracking-tight mt-1">
                  {paymentMethod.startsWith("bank_")
                    ? (paymentMethod.startsWith("bank_other_") ? customBankName : selectedProvider?.name)
                    : selectedProvider?.name}
                </h4>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center justify-center">
                {selectedProvider?.icon}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-1">Account Name</p>
                <p className="text-base font-bold tracking-tight truncate">{payeeName}{payeeLastName ? ` ${payeeLastName}` : ""}</p>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-white/60">
                    Account Number
                  </p>
                  <p className="text-sm font-mono tracking-wider truncate max-w-[240px]">{payeeUid}</p>
                </div>
                <span className="text-[10px] font-bold text-white/90 bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">
                  Default
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : (
        // Empty View
        <div className="animate-in fade-in duration-200">
          <div className="flex justify-between items-center mb-6">
            <div className="text-sm font-semibold text-[#2F3E46] dark:text-white/60 uppercase tracking-wider">
              no payment method
            </div>
            <button
              id="wallet-tour-change-btn"
              onClick={() => {
                setIsEditing(true);
                setPaymentStep(1);
                setProviderSearch("");
                setEditingMethod("");
              }}
              className="text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 px-4 py-2 rounded-full transition-colors border border-[#1F7A1F]/20 dark:border-[#55f761]/20 shadow-md shadow-[#1F7A1F]/5 dark:shadow-[#55f761]/5 hover:scale-105 active:scale-95 cursor-pointer"
            >
              Add Payment Method
            </button>
          </div>

          <div className="bg-black/5 dark:bg-white/5 border border-dashed border-black/20 dark:border-white/20 rounded-2xl p-10 text-center flex flex-col items-center justify-center min-h-[220px]">
            <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-[#2F3E46]/60 dark:text-white/40"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[#0D1B2A] dark:text-white mb-1">
              No Payout Method Linked
            </p>
            <p className="text-xs text-[#2F3E46]/60 dark:text-white/40 max-w-sm leading-relaxed">
              Configure your preferred payout method to start withdrawing your earnings.
            </p>
          </div>
        </div>
      )}

      {/* 2. Select Payment Provider Modal pop-up (with blurred background) */}
      {isEditing && paymentStep === 1 && renderPortal(
        <div className="fixed inset-0 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex justify-center items-center z-[9999] animate-in fade-in duration-200">
          <div className="relative bg-white/95 dark:bg-[#060D14]/95 backdrop-blur-2xl rounded-tr-3xl rounded-bl-3xl w-full max-w-4xl shadow-2xl border border-black/10 dark:border-white/10 p-6 sm:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">
                Select Payment Provider
              </h2>
              <button
                onClick={() => setIsEditing(false)}
                className="text-[#2F3E46]/50 hover:text-[#0D1B2A] dark:text-white/50 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-black/40 dark:text-white/40">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </span>
                <input
                  type="text"
                  className="w-full bg-black/5 dark:bg-white/5 text-xs font-bold text-[#0D1B2A] dark:text-white border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:text-black/30 dark:placeholder:text-white/30"
                  placeholder="Search payment provider..."
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                />
              </div>
            </div>

            <div id="wallet-tour-provider-list" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {filteredProviders.map((provider) => (
                <button
                  key={provider.id}
                  id={`wallet-tour-provider-${provider.id}`}
                  onClick={() => handleSelectMethod(provider.id)}
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md cursor-pointer ${
                    editingMethod === provider.id
                      ? "bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border-[#1F7A1F] dark:border-[#55f761] ring-2 ring-[#1F7A1F]/20 dark:ring-[#55f761]/20"
                      : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30"
                  }`}
                >
                  <div className="text-[#0D1B2A] dark:text-white mb-3 opacity-90 h-10 flex items-center justify-center">
                    {provider.icon}
                  </div>
                  <span className="text-xs font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider text-center">
                    {provider.name}
                  </span>
                </button>
              ))}
            </div>
            {filteredProviders.length === 0 && (
              <div className="text-center py-8 text-sm text-[#2F3E46]/60 dark:text-white/40 italic">
                No payment providers found matching "{providerSearch}"
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-6 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. OTP Verification Modal */}
      {showOtpModal && renderPortal(
        <div className="fixed inset-0 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex justify-center items-center z-[9999] animate-in fade-in duration-200">
          <div className="relative bg-white/95 dark:bg-[#060D14]/95 backdrop-blur-2xl rounded-tr-3xl rounded-bl-3xl w-full max-w-md shadow-2xl border border-black/10 dark:border-white/10 p-6 sm:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-black/10 dark:border-white/10 pb-4">
              <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">
                Verify OTP
              </h2>
              <button
                onClick={handleCancelOtp}
                className="text-[#2F3E46]/50 hover:text-[#0D1B2A] dark:text-white/50 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <p className="text-xs text-[#2F3E46] dark:text-white/60 leading-relaxed">
                We sent a 6-digit One-Time Password (OTP) to your email <strong>{email}</strong>. Please check your inbox (including your spam or promotions folder). Enter the code below to confirm changing your payment method.
              </p>

              {/* Countdown Timer */}
              <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold tabular-nums transition-colors ${
                otpCountdown === 0
                  ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-500"
                  : otpCountdown <= 60
                  ? "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20 text-orange-500"
                  : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-[#2F3E46] dark:text-white/60"
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                {otpCountdown === 0 ? (
                  <span>OTP Expired — please request a new one</span>
                ) : (
                  <span>
                    Expires in{" "}
                    <span className={otpCountdown <= 60 ? "text-orange-500" : ""}>
                      {String(Math.floor(otpCountdown / 60)).padStart(2, "0")}:{String(otpCountdown % 60).padStart(2, "0")}
                    </span>
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <input
                  className="w-full bg-transparent text-center text-xl font-mono font-bold tracking-[8px] text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:text-sm placeholder:tracking-normal placeholder:opacity-50 disabled:opacity-50"
                  type="text"
                  required
                  maxLength={6}
                  disabled={otpCountdown === 0}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter OTP"
                />
                <p className="text-[11px] text-[#2F3E46]/70 dark:text-white/40 text-center">
                  Check Spam or Promotions Tab if not visible in your Primary Inbox
                </p>
                {otpError && (
                  <p className="text-xs text-red-500 font-semibold text-center">{otpError}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelOtp}
                  className="px-6 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length !== 6 || otpCountdown === 0}
                  className="px-8 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {otpLoading ? "Verifying..." : "Verify OTP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Payment Option Details Modal pop-up (with blurred background) */}
      {isEditing && paymentStep === 2 && renderPortal(
        <div className="fixed inset-0 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex justify-center items-center z-[9999] animate-in fade-in duration-200">
          <div className="relative bg-white/95 dark:bg-[#060D14]/95 backdrop-blur-2xl rounded-tr-3xl rounded-bl-3xl w-full max-w-2xl shadow-2xl border border-black/10 dark:border-white/10 p-6 sm:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-black/10 dark:border-white/10 pb-4">
              <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white">
                Enter Payment Details
              </h2>
              <button
                onClick={() => setIsEditing(false)}
                className="text-[#2F3E46]/50 hover:text-[#0D1B2A] dark:text-white/50 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleInitiateSave} className="space-y-6">
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6">
                <div className="flex justify-between items-center mb-6 border-b border-black/10 dark:border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[#0D1B2A] dark:text-white opacity-80 scale-90">
                      {selectedEditingProvider?.icon}
                    </span>
                    <span className="text-sm font-bold text-[#0D1B2A] dark:text-white">
                      {selectedEditingProvider?.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentStep(1)}
                    className="text-xs font-bold uppercase tracking-wider text-[#1F7A1F] dark:text-[#55f761] hover:bg-[#1F7A1F]/10 dark:hover:bg-[#55f761]/10 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div id="wallet-tour-form-inputs" className="space-y-5">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60">
                          First Name
                        </label>
                        <span className="text-[9px] font-bold text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-1.5 py-0.5 rounded uppercase">Required</span>
                      </div>
                      <input
                        className="w-full bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                        type="text"
                        required
                        value={editingPayeeName}
                        onChange={(e) => setEditingPayeeName(e.target.value)}
                        placeholder="e.g. John"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60">
                          Last Name
                        </label>
                        <span className="text-[9px] font-bold text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-1.5 py-0.5 rounded uppercase">Required</span>
                      </div>
                      <input
                        className="w-full bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                        type="text"
                        required
                        value={editingPayeeLastName}
                        onChange={(e) => setEditingPayeeLastName(e.target.value)}
                        placeholder="e.g. Doe"
                      />
                    </div>
                  </div>

                  {editingMethod === "bank_other" && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60">
                          Specify Bank Name
                        </label>
                        <span className="text-[9px] font-bold text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-1.5 py-0.5 rounded uppercase">Required</span>
                      </div>
                      <input
                        className="w-full bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                        type="text"
                        required
                        value={editingCustomBank}
                        onChange={(e) => setEditingCustomBank(e.target.value)}
                        placeholder="e.g. UnionBank"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60">
                        Account Number
                      </label>
                      <span className="text-[9px] font-bold text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-1.5 py-0.5 rounded uppercase">Required</span>
                    </div>
                    <input
                      className="w-full bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                      type="text"
                      required
                      onCopy={(e) => e.preventDefault()}
                      onPaste={(e) => e.preventDefault()}
                      value={editingPayeeUid}
                      onChange={(e) => setEditingPayeeUid(e.target.value.replace(/\D/g, ""))}
                      placeholder="e.g. 1234567890"
                    />
                    <p className="text-xs text-[#2F3E46]/60 dark:text-white/40 mt-2 flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Carefully verify this number to avoid transfer failures.
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60">
                        Confirm Account Number
                      </label>
                      <span className="text-[9px] font-bold text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 px-1.5 py-0.5 rounded uppercase">Required</span>
                    </div>
                    <input
                      className="w-full bg-transparent text-sm font-bold text-[#0D1B2A] dark:text-white border border-black/20 dark:border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow placeholder:font-normal placeholder:opacity-50"
                      type="text"
                      required
                      onCopy={(e) => e.preventDefault()}
                      onPaste={(e) => e.preventDefault()}
                      value={editingConfirmPayeeUid}
                      onChange={(e) => setEditingConfirmPayeeUid(e.target.value.replace(/\D/g, ""))}
                      placeholder="Re-enter your account number"
                    />
                    {editingPayeeUid && editingConfirmPayeeUid && editingPayeeUid !== editingConfirmPayeeUid && (
                      <p className="text-xs text-red-500 font-semibold mt-2">
                        Account details do not match.
                      </p>
                    )}
                  </div>

                  {/* QR Code Upload Section */}
                  <div id="wallet-tour-qr-upload" className="border-t border-black/10 dark:border-white/10 pt-5 mt-2">
                    <div className="flex justify-between items-center mb-2">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[#2F3E46] dark:text-white/60">
                        <QrCode className="w-3.5 h-3.5" />
                        QR Code
                      </label>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        hasAccountDetailsChanged && !qrFile
                          ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                          : "text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10"
                      }`}>
                        {hasAccountDetailsChanged && !qrFile ? "New QR Required" : "Required"}
                      </span>
                    </div>

                    {hasAccountDetailsChanged && !qrFile ? (
                      <div className="mb-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400">
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <div>
                          <p className="font-bold">Account details updated — New QR required</p>
                          <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                            Because you updated your {[isNameChanged && "name", isNumberChanged && "number", isMethodChanged && "payment provider"].filter(Boolean).join(" & ")}, you must upload a new QR code matching your updated details before saving. QR code is the primary mode of sending salaries.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#2F3E46]/60 dark:text-white/40 mb-3 leading-relaxed">
                        Upload your payment QR code so we can send your salary faster.
                      </p>
                    )}

                    {(!qrPreview || (hasAccountDetailsChanged && !qrFile)) ? (
                      <div
                        onClick={() => qrInputRef.current?.click()}
                        onDragOver={handleQrDragOver}
                        onDragLeave={handleQrDragLeave}
                        onDrop={handleQrDrop}
                        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all duration-200 group ${
                          isDraggingQr
                            ? "border-[#1F7A1F] dark:border-[#55f761] bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 scale-[1.01]"
                            : hasAccountDetailsChanged && !qrFile
                            ? "border-amber-500/50 bg-amber-500/5 hover:border-amber-500 hover:bg-amber-500/10"
                            : "border-black/15 dark:border-white/15 hover:border-[#1F7A1F] dark:hover:border-[#55f761] hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/5"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                          hasAccountDetailsChanged && !qrFile
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500/25"
                            : "bg-black/5 dark:bg-white/5 group-hover:bg-[#1F7A1F]/10 dark:group-hover:bg-[#55f761]/10 text-[#2F3E46]/50 dark:text-white/40 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761]"
                        }`}>
                          <Upload className="w-4 h-4" />
                        </div>
                        <span className={`text-xs font-bold transition-colors ${
                          hasAccountDetailsChanged && !qrFile
                            ? "text-amber-700 dark:text-amber-300"
                            : isDraggingQr
                            ? "text-[#1F7A1F] dark:text-[#55f761]"
                            : "text-[#2F3E46]/70 dark:text-white/50 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761]"
                        }`}>
                          {isDraggingQr
                            ? "Drop new QR image here"
                            : hasAccountDetailsChanged && !qrFile
                            ? "Upload new QR code matching your updated details"
                            : "Click or drag & drop QR image"}
                        </span>
                        <span className="text-[10px] text-[#2F3E46]/40 dark:text-white/30 mt-0.5">PNG, JPG, WEBP (Max 5MB)</span>
                      </div>
                    ) : (
                      <div id="wallet-tour-qr-preview-box" className="relative w-full h-48 rounded-xl overflow-hidden border border-black/20 dark:border-white/20 shadow-sm group">
                        <img src={qrPreview} alt="QR Preview" className="w-full h-full object-contain bg-black/5 dark:bg-white/5 p-2" />
                        
                        {/* Status Badge */}
                        <div className="absolute top-2 left-2 pointer-events-none">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md backdrop-blur-md flex items-center gap-1 ${
                            qrFile
                              ? "bg-[#1F7A1F] text-white dark:bg-[#55f761] dark:text-[#060D14]"
                              : "bg-black/70 text-white"
                          }`}>
                            {qrFile ? "✓ New QR Code Attached" : "Current QR Code"}
                          </span>
                        </div>

                        {/* Overlay with Actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]">
                          <button
                            type="button"
                            onClick={() => qrInputRef.current?.click()}
                            className="bg-white text-[#0D1B2A] px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors shadow-lg cursor-pointer"
                          >
                            Change Image
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setQrFile(null);
                              setQrPreview(null);
                              setQrLink(null);
                              if (qrInputRef.current) qrInputRef.current.value = "";
                            }}
                            className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 transition-colors shadow-lg cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                    <input
                      ref={qrInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleQrFileChange}
                    />
                    <p className="text-[10px] text-[#2F3E46]/40 dark:text-white/30 mt-2">
                      QR will be auto-uploaded when you save your payment details.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="wallet-tour-save-btn"
                  type="submit"
                  disabled={isSaving || !editingPayeeUid || editingPayeeUid !== editingConfirmPayeeUid || !isQrValid}
                  className="px-8 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Saving..." : (hasAccountDetailsChanged && !qrFile) ? "New QR Code Required" : "Save Details"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Confirm Modal */}
      {showConfirmModal && renderPortal(
        <ConfirmPaymentModal
          isOpen={showConfirmModal}
          onClose={() => {
            setShowConfirmModal(false);
            setIsEditing(true);
          }}
          onConfirm={executeSavePayment}
          providerName={
            editingMethod.startsWith("bank_")
              ? (editingMethod === "bank_other" ? editingCustomBank : PAYMENT_PROVIDERS.find(p => p.id === editingMethod)?.name)
              : selectedEditingProvider?.name
          }
          payeeName={editingPayeeName}
          payeeLastName={editingPayeeLastName}
          payeeUid={editingPayeeUid}
          qrPreview={qrPreview}
          isQrUpdated={qrFile !== null}
        />
      )}

      {/* 6. Mismatch Modal */}
      {showMismatchModal && renderPortal(
        <div className="fixed inset-0 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex justify-center items-center z-[99999] animate-in fade-in duration-200">
          <div className="relative bg-white/95 dark:bg-[#060D14]/95 backdrop-blur-2xl rounded-tr-3xl rounded-bl-3xl w-full max-w-md shadow-2xl border border-black/10 dark:border-white/10 p-6 sm:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-black/10 dark:border-white/10 pb-4">
              <h2 className="text-lg font-bold text-red-500">
                Payment Account Mismatch
              </h2>
              <button
                onClick={() => setShowMismatchModal(false)}
                className="text-[#2F3E46]/50 hover:text-[#0D1B2A] dark:text-white/50 dark:hover:text-white transition-colors bg-black/5 dark:bg-white/5 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            
            <div className="space-y-6">
              <p className="text-sm text-[#2F3E46] dark:text-white/80 leading-relaxed font-semibold">
                The name on the payment method provided does not match the name on this xfnite.cloud account. Please ensure all payment details belong to you or an immediate family member.
              </p>
              
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMismatchModal(false)}
                  className="px-8 py-2.5 bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#060D14] text-sm font-bold rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
                >
                  I Understand
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}
