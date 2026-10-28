import { Wrench, Settings, Hammer, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Under Maintenance | XFnite",
  description: "Our platform is currently undergoing scheduled maintenance.",
};

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-[#E0E1DD] dark:bg-[#060D14] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ornaments */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 dark:bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 dark:bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="max-w-2xl w-full bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-white/20 dark:border-white/10 p-10 md:p-16 rounded-3xl shadow-2xl text-center relative z-10">
        
        {/* Animated Icons Section */}
        <div className="flex justify-center items-center gap-6 mb-10">
          <div className="bg-blue-100 dark:bg-blue-900/40 p-4 rounded-2xl shadow-inner animate-[bounce_3s_infinite]">
            <Wrench className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="bg-purple-100 dark:bg-purple-900/40 p-5 rounded-full shadow-lg animate-[spin_4s_linear_infinite]">
            <Settings className="w-14 h-14 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="bg-amber-100 dark:bg-amber-900/40 p-4 rounded-2xl shadow-inner animate-[bounce_3s_infinite_100ms]">
            <Hammer className="w-10 h-10 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Text Content */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 font-semibold text-sm tracking-wide uppercase mb-6 shadow-sm">
          <ShieldAlert className="w-4 h-4" />
          System Maintenance
        </div>
        
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#0D1B2A] dark:text-white tracking-tight mb-6 leading-tight">
          We are upgrading our systems
        </h1>
        
        <p className="text-lg md:text-xl text-gray-700 dark:text-gray-300 mb-8 leading-relaxed max-w-lg mx-auto">
          XFnite is currently undergoing scheduled maintenance to improve performance and reliability. 
          To ensure data integrity, access is temporarily paused.
        </p>

        {/* Status Indicator */}
        <div className="flex items-center justify-center gap-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          Engineers are actively working on it
        </div>
      </div>
      
      {/* Footer */}
      <div className="absolute bottom-6 text-sm text-gray-500 dark:text-gray-500 font-medium z-10">
        &copy; {new Date().getFullYear()} XFnite. All rights reserved.
      </div>
    </div>
  );
}
