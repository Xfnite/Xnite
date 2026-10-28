"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";

const AGREE_COOLDOWN_SECONDS = 10;

interface WelcomeTermsModalProps {
  isOpen: boolean;
  onAgreed: () => void;
}

export default function WelcomeTermsModal({ isOpen, onAgreed }: WelcomeTermsModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(AGREE_COOLDOWN_SECONDS);

  // Count down only while the modal is showing
  useEffect(() => {
    if (!isOpen || cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [isOpen, cooldown]);

  if (!isOpen) return null;

  const handleAgree = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/user/agree-terms", {
        method: "POST",
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success("Thank you for agreeing to the terms.");
        // The header and chat widget only hear about new messages from the socket server,
        // which doesn't know about this one until the next reconnect — hand it over directly.
        if (data.message) {
          window.dispatchEvent(new CustomEvent("welcome_message_created", { detail: data.message }));
        }
        onAgreed();
      } else {
        toast.error(data.error || "Failed to submit agreement. Please try again.");
        setIsSubmitting(false);
      }
    } catch (error) {
      toast.error("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0D1B2A] border border-[#1B263B]/10 dark:border-[#E0E1DD]/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <h2 className="text-2xl font-black text-[#0D1B2A] dark:text-white">Welcome to Xfnite</h2>
          <p className="text-sm text-gray-500 mt-2">
            Before you begin working on the platform, please take a moment to understand the following:
          </p>
        </div>
        
        <div className="p-6 overflow-y-auto text-sm text-[#2F3E46] dark:text-[#E0E1DD]/90 leading-relaxed space-y-6">
          <div>
            <h3 className="font-bold text-lg text-[#0D1B2A] dark:text-white mb-2">Platform & Processing Fees</h3>
            <p>
              Xfnite has operated with platform and processing fees since 2017. Platform fees (4%) help cover development and platform maintenance, while processing fees (12% + fixed $2) cover the costs and risks associated with handling payments. These fees help us maintain the platform and continue providing job opportunities to thousands of labelers.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-lg text-[#0D1B2A] dark:text-white mb-2">About Benchmark Rates</h3>
            <p>
              Xfnite only pays for correctly completed work, as stated in our Rules & Guidelines. Your benchmark rate may start lower while the system evaluates your work and accuracy.
            </p>
            <p className="mt-2">
              If your current rate does not meet your expectations, you are free to stop and explore other opportunities. However, if you continue improving your accuracy and consistency, your rate may improve over time. Many labelers have increased their rates through experience, and some have been working with us for years.
            </p>
          </div>
          
          <p className="pt-4 border-t border-[#1B263B]/10 dark:border-[#E0E1DD]/10 italic font-medium">
            By clicking “Agree & Continue,” you acknowledge that you have read and understood these guidelines, including the platform and processing fees and the benchmark-rate system.
          </p>
          
          <p className="font-bold text-[#1F7A1F] dark:text-[#55f761]">
            Thank you for being part of Xfnite.
          </p>
        </div>
        
        <div className="p-4 border-t border-[#1B263B]/10 dark:border-[#E0E1DD]/10 bg-black/[0.02] dark:bg-white/[0.02] flex justify-end">
          <button
            onClick={handleAgree}
            disabled={isSubmitting || cooldown > 0}
            className="px-6 py-3 bg-[#1F7A1F] hover:bg-[#145214] text-white rounded-xl font-bold transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : null}
            {cooldown > 0 ? (
              <>
                <Clock className="w-4 h-4 animate-pulse" />
                Wait {cooldown}s
              </>
            ) : (
              "Agree & Continue"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
