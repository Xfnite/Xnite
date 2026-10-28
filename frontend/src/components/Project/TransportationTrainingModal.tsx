"use client";

import { useState, useEffect } from "react";
import { getTransportationProgressAction, saveTransportationProgressAction } from "@/app/actions/project";

interface TransportationTrainingModalProps {
  isOpen: boolean;
  training: any;
  onClose: () => void;
  onComplete: () => void;
}

export function TransportationTrainingModal({ isOpen, training, onClose, onComplete }: TransportationTrainingModalProps) {
  const [isCompleted, setIsCompleted] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setStep(1); // Reset step when modal opens
      const localData = localStorage.getItem("transportation_training_progress");
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (parsed.completed) setIsCompleted(true);
        } catch (e) {
          console.error("Failed to parse local transportation progress:", e);
        }
      }

      const fetchProgress = async () => {
        try {
          const serverProgress = await getTransportationProgressAction();
          if (serverProgress) {
            setIsCompleted(serverProgress.completed);
            localStorage.setItem("transportation_training_progress", JSON.stringify(serverProgress));
          } else if (localData) {
            const parsed = JSON.parse(localData);
            await saveTransportationProgressAction(parsed, true);
          }
        } catch (err) {
          console.error("Failed to sync transportation progress with server:", err);
        }
      };
      fetchProgress();
    }
  }, [isOpen]);

  const handleStartTraining = async () => {
    const progressObj = { completed: true };
    localStorage.setItem("transportation_training_progress", JSON.stringify(progressObj));
    try {
      await saveTransportationProgressAction(progressObj, true);
    } catch (e) {
      console.error("Failed to save transportation progress to server:", e);
    }
    onComplete();
  };

  if (!isOpen || !training) return null;

  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-[240px] z-[10010] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#060D14] rounded-2xl w-full max-w-2xl shadow-2xl border border-black/10 dark:border-white/10 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white flex items-center gap-2">
              Transportation Training
              <span className="text-[10px] bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-full font-black tracking-wider uppercase">
                Step {step} of 3
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
            {/* Step 1: Guide */}
            <div className="w-full shrink-0 flex flex-col items-center justify-center space-y-6 px-4">
              <div className="w-20 h-20 bg-blue-500/10 dark:bg-blue-400/10 rounded-full flex items-center justify-center mx-auto text-blue-600 dark:text-blue-400 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.8c.55 0 1.07.24 1.4.65L12 6h8a2 2 0 0 1 2 2v.4z"/><path d="M10 14h4"/><path d="M12 12v4"/></svg>
              </div>
              <h4 className="font-semibold text-2xl text-[#0D1B2A] dark:text-white text-center">
                Training Guide
              </h4>
              <p className="text-[#2F3E46] dark:text-white/70 max-w-md mx-auto leading-relaxed text-center">
                Please carefully read and review the transportation guidelines document in the Google Drive folder before continuing.
              </p>
              
              <a 
                href="https://drive.google.com/drive/folders/1YCFhZedmramOMdjIh8mlWpzUgwKRoHVU"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3 bg-[#E0E1DD] dark:bg-[#1A2634] hover:bg-gray-300 dark:hover:bg-gray-700 text-[#0D1B2A] dark:text-white rounded-xl font-medium transition-colors shadow-sm cursor-pointer mt-4"
              >
                Open Training Guide
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
              </a>
            </div>

            {/* Step 2: Answer Key */}
            <div className="w-full shrink-0 flex flex-col items-center justify-center space-y-6 px-4">
              <div className="w-20 h-20 bg-purple-500/10 dark:bg-purple-400/10 rounded-full flex items-center justify-center mx-auto text-purple-600 dark:text-purple-400 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <h4 className="font-semibold text-2xl text-[#0D1B2A] dark:text-white text-center">
                Answer Key
              </h4>
              <p className="text-[#2F3E46] dark:text-white/70 max-w-md mx-auto leading-relaxed text-center">
                Review the answer key to understand common mistakes and improve your labeling accuracy before starting.
              </p>
              
              <a 
                href="https://docs.google.com/document/d/1ebqNINjbzUdsvr2gPqeKnYSMXL1Ff1910oHcfCh-N0k/edit?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3 bg-[#E0E1DD] dark:bg-[#1A2634] hover:bg-gray-300 dark:hover:bg-gray-700 text-[#0D1B2A] dark:text-white rounded-xl font-medium transition-colors shadow-sm cursor-pointer mt-4"
              >
                Open Answer Key
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
              </a>
            </div>

            {/* Step 3: Message */}
            <div className="w-full shrink-0 flex flex-col items-center justify-center space-y-6 px-4">
              <div className="w-20 h-20 bg-green-500/10 dark:bg-green-400/10 rounded-full flex items-center justify-center mx-auto text-green-600 dark:text-green-400 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <h4 className="font-semibold text-2xl text-[#0D1B2A] dark:text-white text-center">
                Great job, Challenger!
              </h4>
              
              <div className="relative w-full max-w-xl mx-auto">
                <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white dark:from-[#060D14] to-transparent z-10 pointer-events-none"></div>
                <div className="max-h-[140px] overflow-y-auto hide-scrollbar px-2 py-4">
                  <div className="text-[#2F3E46] dark:text-white/70 leading-relaxed text-center space-y-4 text-sm">
                    <p>It's now time to begin Transportation Training. This stage is more challenging, so accuracy is very important.</p>
                    <p>During this training, you are only allowed <strong className="text-red-600 dark:text-red-400 font-bold">5 major-error</strong> pushbacks. A pushback happens when a Checker returns your training task because it contains significant mistakes.</p>
                    <p>Please review the guides and answer keys carefully before submitting your work. If you repeatedly submit severely incorrect training tasks, your training may be reset, requiring you to start over from the beginning, including the 22+ Hands-On Training tasks.</p>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Back
            </button>
          ) : (
            <div></div>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-8 py-2.5 text-sm font-bold rounded-lg flex items-center gap-2 transition-all bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] shadow-md shadow-[#1F7A1F]/30 dark:shadow-[#55f761]/30 border border-[#55f761]/20 cursor-pointer hover:scale-105 active:scale-95"
            >
              Next Step
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
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
