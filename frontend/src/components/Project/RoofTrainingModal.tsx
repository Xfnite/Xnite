"use client";

import { useState } from "react";

interface RoofTrainingModalProps {
  isOpen: boolean;
  training: any;
  onClose: () => void;
  onComplete: () => void;
}

export function RoofTrainingModal({ isOpen, training, onClose, onComplete }: RoofTrainingModalProps) {
  const [step, setStep] = useState(1);

  if (!isOpen || !training) return null;

  const handleStartTraining = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-[240px] z-[10010] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#060D14] rounded-2xl w-full max-w-2xl shadow-2xl border border-black/10 dark:border-white/10 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              Roof Training
              <span className="text-[10px] bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full font-black tracking-wider uppercase">
                Step {step} of 2
              </span>
            </h3>
            <p className="text-sm text-[#2F3E46] dark:text-white/60">
              {training.annotate_sub_project_name || training.annotate_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-8 flex-1 min-h-0 relative overflow-hidden flex items-center">
          <div
            className="w-full flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${(step - 1) * 100}%)` }}
          >
            {/* Step 1: Guide & Software */}
            <div className="w-full shrink-0 flex flex-col items-center justify-center space-y-4 px-2">
              <h4 className="font-semibold text-2xl text-[#0D1B2A] dark:text-white text-center mb-1">
                Training Resources
              </h4>
              <p className="text-[#2F3E46] dark:text-white/70 max-w-md mx-auto leading-relaxed text-center text-sm mb-2">
                Please carefully review the guidelines and software before continuing.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl">
                {/* Training Guide Card */}
                <div className="bg-[#0B1524] p-6 rounded-3xl border border-[#18263E] flex flex-col items-center text-center justify-between hover:border-blue-500/30 transition-all">
                  <div>
                    <div className="w-14 h-14 bg-[#132A4B] text-[#2B7FFF] rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 1 2 2z" /><line x1="12" y1="10" x2="12" y2="16" /><line x1="9" y1="13" x2="15" y2="13" /></svg>
                    </div>
                    <h5 className="font-bold text-lg text-white mb-2 tracking-wide">Training Guide</h5>
                    <p className="text-xs text-gray-400 leading-relaxed mb-6">
                      Access all the latest roof training documents and guidelines from this shared folder.
                    </p>
                  </div>
                  <a
                    href="https://docs.google.com/document/d/1FfGpQ7xgb7QLTkc4l6OICqpU8fhUNknCq-5G1XbLAcY/edit?tab=t.5r1ob59i57jt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#1B65FF] hover:bg-[#1253E0] text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-blue-500/25 w-full cursor-pointer"
                  >
                    Open Guide
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                  </a>
                </div>

                {/* 3D Roof Errors Card */}
                <div className="bg-[#0B1524] p-6 rounded-3xl border border-[#18263E] flex flex-col items-center text-center justify-between hover:border-red-500/30 transition-all">
                  <div>
                    <div className="w-14 h-14 bg-[#3B151A] text-[#EF4444] rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    </div>
                    <h5 className="font-bold text-lg text-white mb-2 tracking-wide">3D Roof Errors</h5>
                    <p className="text-xs text-gray-400 leading-relaxed mb-6">
                      View solutions for common errors and crash issues during 3D Roof training.
                    </p>
                  </div>
                  <a
                    href="https://docs.google.com/document/d/1cmx6GA8Mz2T22Rp62U9xHkdDR9cGmzO-3jZZfzrplVU/edit?tab=t.0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-red-500/25 w-full cursor-pointer"
                  >
                    Open Errors Guide
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                  </a>
                </div>

                {/* Software Card */}
                <div className="bg-[#0B1524] p-6 rounded-3xl border border-[#18263E] flex flex-col items-center text-center justify-between hover:border-purple-500/30 transition-all">
                  <div>
                    <div className="w-14 h-14 bg-[#2B174B] text-[#A855F7] rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    </div>
                    <h5 className="font-bold text-lg text-white mb-2 tracking-wide">Software</h5>
                    <p className="text-xs text-gray-400 leading-relaxed mb-6">
                      Download the latest Ginger software package required for roof training.
                    </p>
                  </div>
                  <a
                    href="https://drive.google.com/file/d/1lncommiFW0arF6roKybTJwiM2-To_Wus/view?usp=drivesdk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#9D17FF] hover:bg-[#850EE6] text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-purple-500/25 w-full cursor-pointer"
                  >
                    Download Software
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Step 2: Message */}
            <div className="w-full shrink-0 flex flex-col items-center justify-center space-y-6 px-4">
              <div className="w-20 h-20 bg-green-500/10 dark:bg-green-400/10 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="m9 12 2 2 4-4" /></svg>
              </div>
              <h4 className="font-semibold text-2xl text-[#0D1B2A] dark:text-white text-center">
                Great job, Challenger!
              </h4>

              <div className="relative w-full max-w-xl mx-auto">
                <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white dark:from-[#060D14] to-transparent z-10 pointer-events-none"></div>
                <div className="max-h-[140px] overflow-y-auto hide-scrollbar px-2 py-4">
                  <div className="text-[#2F3E46] dark:text-white/70 leading-relaxed text-center space-y-4 text-sm">
                    <p>It's now time to begin Roof Training. This stage requires high precision and focus, so accuracy is very important.</p>
                    <p>Please review the guides carefully before submitting your work.</p>
                    <p>Take your time, follow the guidelines, and do your best.</p>
                    <p className="font-bold text-[#1F7A1F] dark:text-[#55f761]">Good luck, Challenger! 🚀</p>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white dark:from-[#060D14] to-transparent z-10 pointer-events-none"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30 flex justify-between items-center flex-shrink-0">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm font-bold rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back
            </button>
          ) : (
            <div></div>
          )}

          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-8 py-2.5 text-sm font-bold rounded-lg flex items-center gap-2 transition-all bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 border border-[#55f761]/20 cursor-pointer hover:scale-105 active:scale-95"
            >
              Next Step
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          ) : (
            <button
              onClick={handleStartTraining}
              className="px-8 py-2.5 text-sm font-bold rounded-lg flex items-center gap-2 transition-all bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 border border-[#55f761]/20 cursor-pointer hover:scale-105 active:scale-95"
            >
              Start Training
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
