"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { getSessionUser } from "@/app/actions/auth";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function decodeSessionEmailUnsafe(jwtString: string) {
  if (!jwtString) return null;
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.email || null;
  } catch (e) {
    return null;
  }
}

export default function WalletWalkthroughProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [shouldRun, setShouldRun] = useState(false);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [isNameWalkthroughMode, setIsNameWalkthroughMode] = useState(false);

  useEffect(() => {
    getSessionUser().then((user) => {
      let userEmail = user?.email || "";
      if (!userEmail) {
        userEmail = decodeSessionEmailUnsafe(getCookie("xnite_session") || "") || "";
      }
      if (userEmail) {
        setEmail(userEmail);
      }
    });
  }, []);

  useEffect(() => {
    if (!email) return;

    // Listen for manual triggers from admin or successful payment saves
    const handleUpdate = () => {
      checkSettings();
    };
    // The salaries toggle is broadcast to every open page at once; spread the
    // re-checks over a few seconds so they don't all hit the server together.
    let salariesUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    const handleSalariesUpdate = () => {
      if (salariesUpdateTimer) clearTimeout(salariesUpdateTimer);
      salariesUpdateTimer = setTimeout(checkSettings, Math.random() * 10000);
    };
    const handleComplete = () => {
      setShouldRun(false);
    };
    window.addEventListener("trigger_wallet_walkthrough", handleUpdate);
    window.addEventListener("salaries_updated", handleSalariesUpdate);
    window.addEventListener("wallet_payment_updated", handleUpdate);
    window.addEventListener("wallet_walkthrough_complete", handleComplete);

    checkSettings();

    function checkSettings() {
      fetch("/api/system-settings?keys=wallet_walkthrough_enabled,wallet_name_walkthrough_enabled,salaries_disabled,salaries_disabled_roles")
        .then(res => res.json())
        .then(async (settingsRes) => {
        const values: Record<string, string | null> = settingsRes?.success ? settingsRes.values : {};
        const isEnabled = values.wallet_walkthrough_enabled === "true";
        const isNameEnabled = values.wallet_name_walkthrough_enabled === "true";
        let salariesDisabled = false;

        // Both walkthroughs off (the usual case): nothing else needs looking up.
        if (!isEnabled && !isNameEnabled) {
          setShouldRun(false);
          return;
        }

        const [paymentRes, user] = await Promise.all([
          fetch(`/api/user/payment?email=${encodeURIComponent(email)}`).then(res => res.json()),
          getSessionUser(),
        ]);

        if (values.salaries_disabled === "true") {
          salariesDisabled = true;
        } else if (values.salaries_disabled_roles && user?.role) {
          try {
            const disabledRoles = JSON.parse(values.salaries_disabled_roles);
            if (Array.isArray(disabledRoles) && disabledRoles.includes(user.role.toLowerCase())) {
              salariesDisabled = true;
            }
          } catch (e) {
            // ignore
          }
        }

        const hasQrImage = paymentRes?.data?.qrImageUrl && paymentRes.data.qrImageUrl.trim() !== "";
        const paymentMethod = paymentRes?.data?.paymentMethod;
        setCurrentPaymentMethod(paymentMethod || null);
        let isLabelerUnder15Days = false;
        let isApplicant = false;
        if (user && user.role) {
          if (user.role.toLowerCase() === 'applicant') {
            isApplicant = true;
          } else if (user.role.toLowerCase() === 'labeler' && user.createdAt) {
            const createdDate = new Date(user.createdAt);
            const now = new Date();
            const diffTime = now.getTime() - createdDate.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            if (diffDays < 15) {
              isLabelerUnder15Days = true;
            }
          }
        }

        const paymentLastName = paymentRes?.data?.lastName || "";
        let resolvedUserLastName = user?.lastName || (user as any)?.db_lastName || "";
        if (!resolvedUserLastName && user?.name) {
          const parts = user.name.trim().split(" ");
          if (parts.length > 1) {
            resolvedUserLastName = parts[parts.length - 1];
          }
        }

        const isNameMismatch = !paymentLastName || (paymentLastName.trim().toLowerCase() !== resolvedUserLastName.trim().toLowerCase());

        if (isEnabled && !salariesDisabled && !isLabelerUnder15Days && !isApplicant && (!hasQrImage || !paymentMethod)) {
          setIsNameWalkthroughMode(false);
          setShouldRun(true);
        } else if (isNameEnabled && !salariesDisabled && !isLabelerUnder15Days && !isApplicant && isNameMismatch) {
          setIsNameWalkthroughMode(true);
          setShouldRun(true);
        } else {
          setShouldRun(false);
        }
      }).catch(console.error);
    }

    return () => {
      if (salariesUpdateTimer) clearTimeout(salariesUpdateTimer);
      window.removeEventListener("trigger_wallet_walkthrough", handleUpdate);
      window.removeEventListener("salaries_updated", handleSalariesUpdate);
      window.removeEventListener("wallet_payment_updated", handleUpdate);
      window.removeEventListener("wallet_walkthrough_complete", handleComplete);
    };
    // currentPaymentMethod is set by checkSettings itself, so it isn't a dependency:
    // listing it re-ran every request a second time on each page load.
  }, [email]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (shouldRun) {
        document.body.classList.add('wallet-walkthrough-active');
      } else {
        document.body.classList.remove('wallet-walkthrough-active');
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('wallet-walkthrough-active');
      }
    };
  }, [shouldRun]);

  useEffect(() => {
    if (!shouldRun || isNameWalkthroughMode) return;

    const driverObj = driver({
      showProgress: false,
      animate: true,
      allowClose: false,
      allowKeyboardControl: false,
      showButtons: [],
      popoverClass: 'driverjs-theme-xnite',
      steps: [
        {
          element: '#wallet-tour-sidebar',
          popover: {
            title: 'Action Required',
            description: 'You need to update your payment method and upload a QR image. Click here to open your wallet.',
            side: "right",
            align: 'start'
          }
        },
        {
          element: '#wallet-tour-payment-tab',
          popover: {
            title: 'Payment Method',
            description: 'Go to your payment settings.',
            side: "bottom",
            align: 'start'
          }
        },
        {
          element: '#wallet-tour-change-btn',
          popover: {
            title: currentPaymentMethod ? 'Update Payment Method' : 'Add Payment Method',
            description: currentPaymentMethod ? 'Click here to update your payment method and upload your QR code.' : 'Click here to set up your payment method and upload your QR code.',
            side: "left",
            align: 'start'
          }
        },
        {
          element: currentPaymentMethod ? `#wallet-tour-provider-${currentPaymentMethod}` : '#wallet-tour-provider-list',
          popover: {
            title: currentPaymentMethod ? 'Confirm Provider' : 'Select Provider',
            description: currentPaymentMethod ? 'Click your current payment provider to proceed to the upload form.' : 'Choose the payment method you would like to use.',
            side: "bottom",
            align: 'center'
          }
        },
        {
          element: '#wallet-tour-form-inputs',
          popover: {
            title: 'Enter Payment Details',
            description: 'Fill in your account details and upload a clear screenshot of your QR code.',
            side: "left",
            align: 'start'
          }
        },
        {
          element: '#wallet-tour-save-btn',
          popover: {
            title: 'Save Details',
            description: 'Awesome! Now just click Save Details to finish updating your payment method.',
            side: "top",
            align: 'end'
          }
        }
      ]
    });

    // Smart Polling: Continuously check the DOM for elements and drive to the appropriate step automatically!
    let checkInterval: NodeJS.Timeout;
    let currentStep = -1;
    let driverHidden = false;
    let lastImageSrc: string | null = null;

    checkInterval = setInterval(() => {
      // If the confirmation modal is open, hide the walkthrough so it doesn't overlap
      if (document.querySelector('#confirm-payment-modal')) {
        if (!driverHidden) {
          driverHidden = true;
          try { driverObj.destroy(); } catch (_) { }
        }
        return;
      }
      // If we were hidden and the modal closed, re-initialize
      if (driverHidden) {
        driverHidden = false;
        currentStep = -1; // force re-drive on next tick
      }

      let targetStep = currentStep;
      const providerSelector = currentPaymentMethod ? `#wallet-tour-provider-${currentPaymentMethod}` : '#wallet-tour-provider-list';

      const imageEl = document.querySelector('#wallet-tour-qr-preview-box img');
      const currentImageSrc = imageEl ? imageEl.getAttribute('src') : null;
      const hasImage = !!currentImageSrc;
      const imageJustUploaded = hasImage && currentImageSrc !== lastImageSrc;
      lastImageSrc = currentImageSrc;

      if (hasImage) {
        if (currentStep < 4) {
          targetStep = 5;
        } else if (currentStep === 4 && imageJustUploaded) {
          targetStep = 5;
        } else {
          targetStep = currentStep;
        }
      } else if (document.querySelector('#wallet-tour-form-inputs')) {
        targetStep = 4;
      } else if (document.querySelector(providerSelector)) {
        targetStep = 3;
      } else if (pathname === "/wallet/payment-method" && document.querySelector('#wallet-tour-change-btn')) {
        targetStep = 2;
      } else if (pathname === "/wallet" && document.querySelector('#wallet-tour-payment-tab')) {
        targetStep = 1;
      } else {
        targetStep = 0;
      }

      if (targetStep !== currentStep) {
        currentStep = targetStep;
        try {
          driverObj.drive(targetStep);
        } catch (err) {
          console.error("Driver.js Error:", err);
        }
      }
    }, 500);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      driverObj.destroy();
    };
  }, [shouldRun, pathname, currentPaymentMethod, isNameWalkthroughMode]);

  // Determine if user is allowed to view the current page when restricted by name mismatch
  const isAllowedPage = pathname.startsWith("/wallet") || pathname.startsWith("/settings");

  return (
    <>
      {shouldRun && (
        <style dangerouslySetInnerHTML={{
          __html: `
          /* LIGHT MODE DEFAULT */
          .driverjs-theme-xnite {
            background-color: #E0E1DD !important;
            color: #0D1B2A !important;
            border: 1px solid #1F7A1F !important;
            border-radius: 12px !important;
            box-shadow: 0 10px 25px -5px rgba(31, 122, 31, 0.3) !important;
            padding: 24px !important;
          }
          .driverjs-theme-xnite .driver-popover-title {
            color: #1F7A1F !important;
            font-weight: 800 !important;
            font-size: 1.1rem !important;
            margin-bottom: 8px !important;
          }
          .driverjs-theme-xnite .driver-popover-description {
            color: rgba(13, 27, 42, 0.8) !important;
            font-size: 0.9rem !important;
            line-height: 1.5 !important;
          }
          .driverjs-theme-xnite:not(.show-footer-step) .driver-popover-footer {
            display: none !important;
          }
          .driverjs-theme-xnite .driver-popover-footer button {
            background-color: rgba(31, 122, 31, 0.1) !important;
            color: #1F7A1F !important;
            text-shadow: none !important;
            border: 1px solid rgba(31, 122, 31, 0.3) !important;
            border-radius: 8px !important;
            padding: 6px 12px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            font-size: 0.75rem !important;
            transition: all 0.2s ease !important;
            cursor: pointer !important;
          }
          .driverjs-theme-xnite .driver-popover-footer button:hover {
            background-color: rgba(31, 122, 31, 0.2) !important;
            border-color: #1F7A1F !important;
          }

          /* DARK MODE OVERRIDES */
          html.dark .driverjs-theme-xnite {
            background-color: #0D1B2A !important;
            color: #E0E1DD !important;
            box-shadow: 0 10px 25px -5px rgba(85, 247, 97, 0.2) !important;
          }
          html.dark .driverjs-theme-xnite .driver-popover-title {
            color: #55f761 !important;
          }
          html.dark .driverjs-theme-xnite .driver-popover-description {
            color: rgba(224, 225, 221, 0.8) !important;
          }
          html.dark .driverjs-theme-xnite .driver-popover-footer button {
            background-color: rgba(85, 247, 97, 0.1) !important;
            color: #55f761 !important;
            border-color: rgba(85, 247, 97, 0.3) !important;
          }
          html.dark .driverjs-theme-xnite .driver-popover-footer button:hover {
            background-color: rgba(85, 247, 97, 0.2) !important;
            border-color: #55f761 !important;
          }
          body.wallet-walkthrough-active aside nav a:not([href^="/wallet"]),
          body.wallet-walkthrough-active aside nav button,
          body.wallet-walkthrough-active aside nav div.cursor-not-allowed,
          body.wallet-walkthrough-active aside nav div[title="Click to edit banner video"] {
            pointer-events: none !important;
            opacity: 0.3 !important;
            filter: grayscale(100%) !important;
          }
        `}} />
      )}

      {shouldRun && isNameWalkthroughMode && !isAllowedPage && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
          <div className="bg-white dark:bg-[#0B1520] p-8 rounded-2xl max-w-md w-full shadow-2xl border border-[#1F7A1F]/20 dark:border-[#55f761]/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#1F7A1F] dark:bg-[#55f761]"></div>
            <h2 className="text-2xl font-bold text-[#0D1B2A] dark:text-white mb-3 flex items-center justify-center gap-2">
              <span>⚠️</span> Action Required
            </h2>
            <p className="text-[#2F3E46] dark:text-white/70 mb-6 text-sm leading-relaxed">
              Your Payment Method last name does not match your Account last name. Please ensure both names match exactly to continue. You can only access your User Settings and Wallet until this is resolved.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/wallet/payment-method" className="w-full px-4 py-3 bg-[#1F7A1F] hover:bg-[#155215] dark:bg-[#55f761] dark:hover:bg-[#3de34a] text-white dark:text-[#0D1B2A] rounded-xl font-bold transition-all text-sm block">
                Update Wallet Payment
              </Link>
              <Link href="/settings" className="w-full px-4 py-3 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#0D1B2A] dark:text-white rounded-xl font-bold transition-all text-sm block">
                Update Account Settings
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}

      {shouldRun && isNameWalkthroughMode && isAllowedPage && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 left-6 max-w-sm z-[99999] bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 p-4 rounded-xl shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="font-bold text-sm mb-1">Action Required</h3>
              <p className="text-xs opacity-90 leading-relaxed text-black dark:text-white">
                Please update your Wallet Payment details to match your Account's Last Name.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {children}
    </>
  );
}
