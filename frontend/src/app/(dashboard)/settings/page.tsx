"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateSettingsAction, deleteAccountAction } from "@/app/actions/auth";
import { toast } from "sonner";
import { gingerLogin } from "@/lib/ginger";

export default function SettingsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingGinger, setIsSavingGinger] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initialFirstName, setInitialFirstName] = useState("");
  const [initialLastName, setInitialLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [initialPhone, setInitialPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [facebook, setFacebook] = useState("");
  const [initialFacebook, setInitialFacebook] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gingerEmail, setGingerEmail] = useState("");
  const [initialGingerEmail, setInitialGingerEmail] = useState("");
  const [gingerPassword, setGingerPassword] = useState("");
  const [initialGingerPassword, setInitialGingerPassword] = useState("");
  // Kept to block a second submission while one is under review — the status
  // banners themselves now live in the header announcements bell.
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  // One-time change allowance — enforced server-side, mirrored here for the UI
  const [nameChangeUsed, setNameChangeUsed] = useState(false);
  const [facebookChangeUsed, setFacebookChangeUsed] = useState(false);

  // Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showGingerPassword, setShowGingerPassword] = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Forced read time on the one-time-change warnings, then an explicit ack
  const [ackCountdown, setAckCountdown] = useState(10);
  const [hasReadWarning, setHasReadWarning] = useState(false);

  // Delete account state
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "delete") {
      toast.error("Please type 'delete' to confirm.");
      return;
    }
    if (!deletePassword) {
      toast.error("Please enter the delete password.");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteAccountAction(deletePassword);
      if (result.success) {
        toast.success("Account deleted successfully.");
        router.replace("/login");
      } else {
        toast.error(result.error || "Failed to delete account.");
      }
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const fetchSettingsData = async () => {
      try {
        const response = await fetch('/api/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const koalaDetails = result.data?.koala_user_details || result.koala_user_details;
          const role = result.data?.db_role || result.db_role || koalaDetails?.db_role || result.data?.role || koalaDetails?.role;
          setUserData(koalaDetails);
          const initFn = koalaDetails.db_firstName || koalaDetails.firstName || "";
          const initLn = koalaDetails.db_lastName || koalaDetails.lastName || "";
          const initFb = koalaDetails.db_facebook || koalaDetails.facebook || "";
          setFirstName(initFn);
          setInitialFirstName(initFn);
          setLastName(initLn);
          setInitialLastName(initLn);
          let initPhone = koalaDetails.db_phone || koalaDetails.phone || "";
          if (initPhone.startsWith("+63")) initPhone = initPhone.substring(3);
          if (initPhone.startsWith("0")) initPhone = initPhone.substring(1);
          setPhone(initPhone);
          setInitialPhone(initPhone);
          setFacebook(initFb);
          setInitialFacebook(initFb);
          setGingerEmail(koalaDetails.db_gingerEmail || "");
          setInitialGingerEmail(koalaDetails.db_gingerEmail || "");
          setGingerPassword(koalaDetails.db_gingerPassword || "");
          setInitialGingerPassword(koalaDetails.db_gingerPassword || "");
          setPendingRequest(result.data?.pendingProfileChangeRequest || koalaDetails?.pendingProfileChangeRequest || null);
          setNameChangeUsed(!!(result.data?.nameChangeUsed ?? koalaDetails?.nameChangeUsed));
          setFacebookChangeUsed(!!(result.data?.facebookChangeUsed ?? koalaDetails?.facebookChangeUsed));
        } else {
          setError(result.error || "Failed to load settings details");
        }
      } catch (err) {
        setError("An unexpected error occurred while fetching settings.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettingsData();
  }, []);

  const verifyGingerCredentials = async (): Promise<boolean> => {
    if (!gingerEmail.trim() || !gingerPassword.trim()) {
      toast.error("Please enter both Ginger email and password.");
      return false;
    }

    try {
      const loginRes = await gingerLogin(gingerEmail.trim(), gingerPassword.trim());
      if (!loginRes.ok || !loginRes.data?.credential?.access_token) {
        toast.error("Ginger login failed: Invalid email or password. Please verify your credentials.");
        return false;
      }
      // Save fresh session token to localStorage
      localStorage.setItem("scrapedGingerData", JSON.stringify(loginRes.data));
      toast.success("Ginger credentials verified successfully!");
      return true;
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred while verifying Ginger account.");
      return false;
    }
  };

  const executeUpdate = async () => {
    setIsSaving(true);
    try {
      // Only re-verify Ginger when those credentials actually changed
      if (isGingerChanged) {
        const isGingerValid = await verifyGingerCredentials();
        if (!isGingerValid) {
          setIsSaving(false);
          setShowConfirmModal(false);
          return;
        }
      }

      // Send only the fields the user actually edited so untouched values stay as-is
      const payload: Parameters<typeof updateSettingsAction>[0] = {};
      if (isFirstNameChanged) payload.firstName = firstName;
      if (isLastNameChanged) payload.lastName = lastName;
      if (isFacebookChanged) payload.facebook = facebook;
      if (isPhoneChanged) {
        payload.phone = phone && phone.length === 10 ? `+63${phone}` : phone;
      }
      if (isPasswordChanged) payload.password = password;
      if (isGingerEmailChanged) payload.gingerEmail = gingerEmail;
      if (isGingerPasswordChanged) payload.gingerPassword = gingerPassword;

      const result = await updateSettingsAction(payload);

      if (result.success) {
        if (result.isPendingApproval) {
          toast.success(result.message || "Profile change request submitted for admin approval.");
          setPendingRequest({
            requestedFirstName: isNameChanged ? firstName : null,
            requestedLastName: isNameChanged ? lastName : null,
            requestedFacebook: isFacebookChanged ? facebook : null,
            status: "PENDING",
          });
          // Submitting consumes the one-time allowance straight away
          if (isNameChanged) setNameChangeUsed(true);
          if (isFacebookChanged) setFacebookChangeUsed(true);
        } else {
          toast.success("Settings updated successfully!");
          setInitialFirstName(firstName);
          setInitialLastName(lastName);
          setInitialFacebook(facebook);
        }
        // Phone / password / ginger are applied immediately even when the
        // name & facebook changes are queued for approval.
        setInitialPhone(phone);
        setPassword("");
        setConfirmPassword("");
        if (isGingerEmailChanged) setInitialGingerEmail(gingerEmail);
        if (isGingerPasswordChanged) setInitialGingerPassword(gingerPassword);
      } else {
        toast.error(result.error || "Failed to update settings");
      }
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setIsSaving(false);
      setShowConfirmModal(false);
    }
  };

  const handleSaveGinger = async () => {
    setIsSavingGinger(true);
    try {
      const isGingerValid = await verifyGingerCredentials();
      if (!isGingerValid) {
        setIsSavingGinger(false);
        return;
      }

      // Save credentials locally in database — ginger fields only
      const result = await updateSettingsAction({
        gingerEmail: gingerEmail || undefined,
        gingerPassword: gingerPassword || undefined,
      });

      if (result.success) {
        toast.success("Ginger credentials saved successfully!");
        setInitialGingerEmail(gingerEmail);
        setInitialGingerPassword(gingerPassword);
      } else {
        toast.error(result.error || "Failed to save Ginger credentials");
      }
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setIsSavingGinger(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!hasChanges) {
      toast.error("No changes to save.");
      return;
    }

    if (pendingRequest && (isNameChanged || isFacebookChanged)) {
      toast.error("You already have a pending profile change request under review by an admin.");
      return;
    }

    if (isNameChanged && isNameLocked) {
      toast.error("You have already used your one-time name change.");
      return;
    }

    if (isFacebookChanged && isFacebookLocked) {
      toast.error("You have already used your one-time Facebook link change.");
      return;
    }

    if (password && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (facebook && !FACEBOOK_REGEX.test(facebook)) {
      toast.error("Invalid Facebook link format.");
      return;
    }

    if (phone && phone.length < 10) {
      toast.error("Phone number must be exactly 10 digits starting with 9.");
      return;
    }

    setShowConfirmModal(true);
  };

  const FACEBOOK_REGEX = /^(https?:\/\/)?(www\.|m\.)?(facebook\.com|fb\.com|m\.me|messenger\.com(\/t)?)\/.{3,}$/i;

  const handleFacebookChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val && !FACEBOOK_REGEX.test(val)) {
      setFacebookError("Invalid link format. E.g., facebook.com/username, fb.com/username, or messenger.com/t/username");
    } else {
      setFacebookError("");
    }
    setFacebook(val);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, '');

    // Handle pasted values with +63 or 0 prefix
    if (val.startsWith('63')) val = val.substring(2);
    if (val.startsWith('0')) val = val.substring(1);

    // Enforce starting with 9
    if (val.length > 0 && val[0] !== '9') {
      val = '';
    }

    // Enforce 10 characters max
    if (val.length > 10) {
      val = val.substring(0, 10);
    }

    setPhone(val);

    if (val && val.length < 10) {
      setPhoneError("Phone number must be exactly 10 digits starting with 9.");
    } else {
      setPhoneError("");
    }
  };

  // Prevent copy/paste/cut handlers
  const preventCopyPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    toast.error("Copying and pasting is disabled for password security.");
  };

  // A name / facebook change can only be requested once. It is locked while a
  // request is under review, and permanently once one was PENDING or APPROVED.
  const hasPendingName = !!(pendingRequest?.requestedFirstName || pendingRequest?.requestedLastName);
  const hasPendingFacebook = !!pendingRequest?.requestedFacebook;
  const isNameLocked = nameChangeUsed || hasPendingName;
  const isFacebookLocked = facebookChangeUsed || hasPendingFacebook;

  const isFirstNameChanged = firstName.trim() !== initialFirstName.trim();
  const isLastNameChanged = lastName.trim() !== initialLastName.trim();
  const isNameChanged = isFirstNameChanged || isLastNameChanged;
  const isFacebookChanged = (facebook.trim() !== initialFacebook.trim());
  const isPhoneChanged = (phone.trim() !== initialPhone.trim());
  const isPasswordChanged = password.trim() !== "";

  const roleLower = (userData?.db_role || "").trim().toLowerCase();
  const isOldLabeler = roleLower === "old-labeler" || roleLower === "old-laber" || roleLower === "old labeler";
  const showGingerCredentials = isOldLabeler || roleLower === "checker" || roleLower === "judger" || roleLower === "recruiter" || roleLower === "recruiters" || roleLower === "admin";

  const isGingerEmailChanged = showGingerCredentials && gingerEmail.trim() !== initialGingerEmail.trim();
  const isGingerPasswordChanged = showGingerCredentials && gingerPassword.trim() !== initialGingerPassword.trim();
  const isGingerChanged = isGingerEmailChanged || isGingerPasswordChanged;

  const hasChanges = isNameChanged || isFacebookChanged || isPhoneChanged || isPasswordChanged || isGingerChanged;

  // Name / facebook changes are irreversible, so the warning must be on screen
  // for 10s before it can be acknowledged.
  const requiresAcknowledgement = isNameChanged || isFacebookChanged;
  const canProceed = !requiresAcknowledgement || (ackCountdown === 0 && hasReadWarning);

  useEffect(() => {
    if (!showConfirmModal || !requiresAcknowledgement) return;

    setAckCountdown(10);
    setHasReadWarning(false);

    const interval = setInterval(() => {
      setAckCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showConfirmModal, requiresAcknowledgement]);

  return (
    <div className="relative w-full min-h-full">
      {/* Mesh Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '40vw', height: '40vw', top: '-10%', left: '-10%' }}></div>
        <div className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15" style={{ width: '50vw', height: '50vw', top: '40%', right: '-20%' }}></div>
      </div>

      <div className="relative space-y-6 lg:space-y-8 w-full max-w-2xl mx-auto pt-4 pb-12 z-10">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[#0D1B2A] dark:text-white mb-1">User Settings</h1>
          <p className="text-sm text-[#2F3E46] dark:text-white/60">
            Manage your Facebook profile link and update your account password.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-sm rounded-xl">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-12 flex flex-col items-center justify-center text-[#2F3E46] dark:text-white/60 shadow-xl">
            <div className="w-8 h-8 border-2 border-[#1F7A1F] border-t-transparent rounded-full animate-spin mb-3"></div>
            Loading settings...
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-6 lg:p-8 shadow-xl space-y-6">
            <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white border-b border-black/10 dark:border-white/10 pb-3">Personal Profile</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">
                  First Name {isNameLocked && <span className="normal-case text-[#2F3E46]/50 dark:text-white/30">(Locked)</span>}
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isNameLocked}
                  placeholder="First Name"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-[#2F3E46]/60 dark:disabled:text-white/40 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">
                  Last Name {isNameLocked && <span className="normal-case text-[#2F3E46]/50 dark:text-white/30">(Locked)</span>}
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isNameLocked}
                  placeholder="Last Name"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-[#2F3E46]/60 dark:disabled:text-white/40 disabled:cursor-not-allowed"
                />
              </div>
              {isNameLocked && (
                <p className="sm:col-span-2 -mt-1 text-xs text-[#2F3E46]/70 dark:text-white/50">
                  {hasPendingName
                    ? "Your name change request is under review and cannot be edited until an admin decides."
                    : "You have already used your one-time name change. Contact support if this needs to be corrected."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#2F3E46]/60 dark:text-white/40 mb-1.5 uppercase">Email Address (Read Only)</label>
                <input
                  type="email"
                  value={userData?.db_email || userData?.user_email || ""}
                  disabled
                  className="w-full px-4 py-2.5 rounded-xl border border-black/5 dark:border-white/5 bg-black/10 dark:bg-white/10 text-[#2F3E46]/60 dark:text-white/40 text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">Phone Number</label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-[#2F3E46]/60 dark:text-white/40 text-sm font-semibold pointer-events-none">+63</span>
                  <input
                    type="text"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="9XXXXXXXXX"
                    className={`w-full pl-12 pr-4 py-2.5 rounded-xl border bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 transition-all ${phoneError ? "border-red-400 dark:border-red-500 focus:ring-red-300 dark:focus:ring-red-500/40" : "border-black/10 dark:border-white/10 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"}`}
                  />
                </div>
                {phoneError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{phoneError}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">
                Facebook Profile Link {isFacebookLocked && <span className="normal-case text-[#2F3E46]/50 dark:text-white/30">(Locked)</span>}
              </label>
              <input
                type="text"
                value={facebook}
                onChange={handleFacebookChange}
                disabled={isFacebookLocked}
                placeholder="https://facebook.com/username"
                className={`w-full px-4 py-2.5 rounded-xl border bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 transition-all disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-[#2F3E46]/60 dark:disabled:text-white/40 disabled:cursor-not-allowed ${facebookError ? "border-red-400 dark:border-red-500 focus:ring-red-300 dark:focus:ring-red-500/40" : "border-black/10 dark:border-white/10 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"}`}
              />
              {facebookError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{facebookError}</p>}
              {isFacebookLocked && (
                <p className="text-xs text-[#2F3E46]/70 dark:text-white/50 mt-1">
                  {hasPendingFacebook
                    ? "Your Facebook link change request is under review and cannot be edited until an admin decides."
                    : "You have already used your one-time Facebook link change. Contact support if this needs to be corrected."}
                </p>
              )}
            </div>

            <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white border-b border-black/10 dark:border-white/10 pb-3 pt-4">Security</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">New Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onCopy={preventCopyPaste}
                  onPaste={preventCopyPaste}
                  onCut={preventCopyPaste}
                  placeholder="Leave blank to keep current"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[34px] text-[#2F3E46] dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
              <div className="relative">
                <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">Confirm Password</label>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onCopy={preventCopyPaste}
                  onPaste={preventCopyPaste}
                  onCut={preventCopyPaste}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-[34px] text-[#2F3E46] dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>


            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving || !hasChanges}
                className="px-6 py-2.5 bg-[#1F7A1F] hover:bg-[#155215] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#0D1B2A] rounded-xl text-sm font-bold shadow-md shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        )}

        {/* Ginger Credentials — separate card, outside the main form to avoid nested form HTML */}
        {!isLoading && showGingerCredentials && (
          <div className="bg-white/60 dark:bg-black/40 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-tr-3xl rounded-bl-3xl p-6 lg:p-8 shadow-xl space-y-6">
            <h2 className="text-lg font-bold text-[#0D1B2A] dark:text-white border-b border-black/10 dark:border-white/10 pb-3">Ginger Credentials</h2>

            <p className="text-xs text-[#2F3E46]/70 dark:text-white/50 -mt-2">
              Store your Ginger email and password. Saving will automatically verify your credentials against the Ginger server before saving.
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">Ginger Email</label>
              <input
                type="email"
                value={gingerEmail}
                onChange={(e) => setGingerEmail(e.target.value)}
                placeholder="your-ginger-email@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all"
              />
            </div>

            <div className="relative">
              <label className="block text-xs font-semibold text-[#2F3E46] dark:text-white/60 mb-1.5 uppercase">Ginger Password</label>
              <input
                type={showGingerPassword ? "text" : "password"}
                value={gingerPassword}
                onChange={(e) => setGingerPassword(e.target.value)}
                placeholder="Ginger account password"
                className="w-full px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[#0D1B2A] dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-all pr-10"
              />
              <button
                type="button"
                onClick={() => setShowGingerPassword(!showGingerPassword)}
                className="absolute right-3 top-[34px] text-[#2F3E46] dark:text-white/60 hover:text-[#1F7A1F] dark:hover:text-[#55f761] transition-colors cursor-pointer"
              >
                {showGingerPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveGinger}
                disabled={isSavingGinger}
                className="px-6 py-2.5 bg-[#1F7A1F] hover:bg-[#155215] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#0D1B2A] rounded-xl text-sm font-bold shadow-md shadow-[#1F7A1F]/10 dark:shadow-[#55f761]/10 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSavingGinger ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    Verifying & Saving...
                  </>
                ) : (
                  "Save Ginger Credentials"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Delete Account */}
        {!isLoading && (
          <div className="bg-red-500/10 dark:bg-red-500/5 border border-red-500/20 rounded-tr-3xl rounded-bl-3xl p-6 lg:p-8 shadow-xl space-y-6 mt-6">
            <div>
              <h2 className="text-lg font-bold text-red-600 dark:text-red-500 border-b border-red-500/20 pb-3">Danger Zone</h2>
              <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-2">
                Permanently delete your account and all of your data. This action cannot be undone.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-red-600/80 dark:text-red-400/80 mb-1.5 uppercase">Type "delete" to confirm</label>
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="delete"
                  className="w-full px-4 py-2.5 rounded-xl border border-red-500/20 bg-white/50 dark:bg-black/20 text-red-600 dark:text-red-400 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-red-600/80 dark:text-red-400/80 mb-1.5 uppercase">Delete Password</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter delete password"
                  className="w-full px-4 py-2.5 rounded-xl border border-red-500/20 bg-white/50 dark:bg-black/20 text-red-600 dark:text-red-400 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmation !== "delete" || !deletePassword}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    Deleting...
                  </>
                ) : (
                  "Delete Account"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg p-6 bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl space-y-4 animate-scale-up">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Confirm Profile Changes</h3>

            {isNameChanged && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-600 dark:text-amber-400">
                  <span>⚠️</span> You only have one opportunity to request a name change.
                </div>
                <p className="text-xs leading-relaxed text-[#2F3E46] dark:text-white/80">
                  We do not process payouts to dummy, fake, alias, or placeholder names. Using an incorrect name may put your earnings at risk.
                </p>
              </div>
            )}

            {isFacebookChanged && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-600 dark:text-amber-400">
                  <span>⚠️</span> You only have one opportunity to request a Facebook link change.
                </div>
                <p className="text-xs leading-relaxed text-[#2F3E46] dark:text-white/80">
                  Please make sure you provide your actual Facebook profile.<br /><br />
                  We may use it for account verification and support. Fake, inactive, or incorrect Facebook accounts may delay verification or put your earnings at risk.
                </p>
              </div>
            )}

            {!isNameChanged && !isFacebookChanged ? (
              <p className="text-sm text-[#2F3E46] dark:text-white/60 leading-relaxed">
                Are you sure you want to save these changes to your profile and security settings?
              </p>
            ) : (
              <p className="text-sm font-semibold text-[#0D1B2A] dark:text-white pt-1">
                Do you wish to proceed?
              </p>
            )}

            {requiresAcknowledgement && (
              <label
                htmlFor="ack-warning-checkbox"
                className={`flex items-start gap-3 pt-1 group ${ackCountdown > 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    id="ack-warning-checkbox"
                    checked={hasReadWarning}
                    disabled={ackCountdown > 0}
                    onChange={(e) => setHasReadWarning(e.target.checked)}
                    className="peer w-5 h-5 rounded-md border-2 border-black/20 dark:border-white/20 appearance-none checked:border-[#1F7A1F] dark:checked:border-[#55f761] checked:bg-[#1F7A1F] dark:checked:bg-[#55f761] transition-all cursor-pointer disabled:cursor-not-allowed"
                  />
                  <svg className="absolute w-3 h-3 text-white dark:text-[#0D1B2A] opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#2F3E46] dark:text-white/80 leading-snug">
                  I have read and understand the warning above, and confirm the details I entered are correct.
                  {ackCountdown > 0 && (
                    <span className="block font-normal text-[#2F3E46]/60 dark:text-white/50 mt-0.5">
                      Available in {ackCountdown}s please read the warning carefully.
                    </span>
                  )}
                </span>
              </label>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-black/10 dark:border-white/10 rounded-xl text-sm font-semibold text-[#2F3E46] dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeUpdate}
                disabled={isSaving || !canProceed}
                className="px-5 py-2 bg-[#1F7A1F] hover:bg-[#155215] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#0D1B2A] rounded-xl text-sm font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    Submitting...
                  </>
                ) : requiresAcknowledgement && ackCountdown > 0 ? (
                  <>
                    <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Wait {ackCountdown}s
                  </>
                ) : (
                  "Yes, Proceed"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
