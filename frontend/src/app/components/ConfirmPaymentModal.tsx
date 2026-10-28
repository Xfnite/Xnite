"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CreditCard } from "lucide-react";

interface ConfirmPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  providerName?: string;
  payeeName: string;
  payeeLastName?: string;
  payeeUid: string;
  qrPreview?: string | null;
  isQrUpdated?: boolean;
}

export default function ConfirmPaymentModal({ isOpen, onClose, onConfirm, providerName, payeeName, payeeLastName, payeeUid, qrPreview, isQrUpdated }: ConfirmPaymentModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div id="confirm-payment-modal" className="fixed inset-0 z-[100002] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#060D14] rounded-[2rem] shadow-[0_0_40px_rgba(31,122,31,0.15)] dark:shadow-[0_0_40px_rgba(85,247,97,0.1)] w-full max-w-sm border border-black/10 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 pb-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 rounded-full flex items-center justify-center mb-6 ring-4 ring-[#1F7A1F]/5 dark:ring-[#55f761]/5">
            <CreditCard className="w-8 h-8 text-[#1F7A1F] dark:text-[#55f761]" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-[#0D1B2A] dark:text-white mb-2">
            Confirm Payment Details
          </h2>
          <p className="text-sm text-[#2F3E46] dark:text-white/60 mb-6">
            Please verify that your account information is correct. Incorrect details may result in payout delays or lost funds.
          </p>
          
          <div className="w-full bg-black/5 dark:bg-white/5 rounded-2xl p-5 border border-black/5 dark:border-white/5 text-left flex flex-col gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-1">Method</p>
              <p className="text-sm font-black text-[#0D1B2A] dark:text-white">{providerName || 'Not Selected'}</p>
            </div>
            
            <div className="h-px w-full bg-black/5 dark:bg-white/5"></div>
            
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-1">Account Name</p>
              <p className="text-sm font-bold text-[#0D1B2A] dark:text-white">{payeeName || '-'}{payeeLastName ? ` ${payeeLastName}` : ''}</p>
            </div>
            
            <div className="h-px w-full bg-black/5 dark:bg-white/5"></div>
            
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-1">Account Details / UID</p>
              <p className="text-sm font-bold text-[#0D1B2A] dark:text-white break-all">{payeeUid || '-'}</p>
            </div>

            {qrPreview && (
              <>
                <div className="h-px w-full bg-black/5 dark:bg-white/5"></div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2F3E46]/60 dark:text-white/40 mb-1">Payment QR Code</p>
                    <p className={`text-xs font-bold ${isQrUpdated ? 'text-[#1F7A1F] dark:text-[#55f761]' : 'text-[#2F3E46]/80 dark:text-white/70'}`}>
                      {isQrUpdated ? "✓ Updated New QR" : "Current QR Maintained"}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl border border-black/10 dark:border-white/10 overflow-hidden bg-black/5 dark:bg-white/5 shrink-0 flex items-center justify-center p-0.5">
                    <img src={qrPreview} alt="QR Thumbnail" className="w-full h-full object-contain" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        
        <div className="px-8 pb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 px-4 py-3.5 text-sm font-bold text-[#0D1B2A] dark:text-white transition-all duration-200"
          >
            Review Again
          </button>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event('wallet_walkthrough_complete'));
              onConfirm();
            }}
            className="flex-1 rounded-xl bg-[#1F7A1F] hover:bg-[#145214] dark:bg-[#55f761] dark:hover:bg-[#3de34a] px-4 py-3.5 text-sm font-bold text-white dark:text-[#060D14] transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
          >
            Confirm & Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
