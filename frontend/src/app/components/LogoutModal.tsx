import React from 'react';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0D1B2A]/60 dark:bg-[#060D14]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0D1B2A] rounded-xl w-full max-w-sm shadow-xl border dark:border-[#E0E1DD]/10 overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold tracking-tight text-[#0D1B2A] dark:text-[#E0E1DD] mb-2">
            Confirm Logout
          </h2>
          <p className="text-sm text-[#2F3E46] dark:text-[#E0E1DD]/70">
            Are you sure you want to log out of your account?
          </p>
        </div>
        <div className="border-t border-[#1B263B]/10 dark:border-[#E0E1DD]/10 p-4 flex justify-end gap-3 bg-gray-50 dark:bg-[#060D14]">
          <button
            onClick={onClose}
            className="rounded-md border border-[#1B263B]/20 dark:border-[#E0E1DD]/20 bg-white dark:bg-[#1B263B] px-4 py-2 text-sm font-medium text-[#0D1B2A] dark:text-[#E0E1DD] hover:bg-gray-50 dark:hover:bg-[#1B263B]/80 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-md bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors shadow-sm"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
