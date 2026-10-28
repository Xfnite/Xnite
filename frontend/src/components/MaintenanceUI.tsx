import { Clock, Settings } from "lucide-react";

interface MaintenanceUIProps {
  estimatedTime?: string;
}

export function MaintenanceUI({ estimatedTime }: MaintenanceUIProps) {
  return (
    <div className="min-h-screen bg-[#060D14] flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      
      {/* Background Ornaments (Gradient Mesh) */}
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-[#39FF14]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#0D4017]/30 rounded-full blur-[100px] pointer-events-none" />

      {/* Central Content */}
      <div className="flex flex-col items-center max-w-lg text-center animate-in fade-in zoom-in duration-700 w-full relative z-10">
        
        {/* Large Green Icon Circle */}
        <div className="w-24 h-24 bg-[#39FF14] rounded-full flex items-center justify-center mb-8 shadow-sm">
          <Settings className="w-12 h-12 text-[#060D14] animate-[spin_4s_linear_infinite]" />
        </div>
        
        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-6 drop-shadow-md">
          System Maintenance
        </h1>
        
        {/* Description */}
        <p className="text-[#A0AAB5] text-lg md:text-xl mb-12 leading-relaxed font-medium">
          XFnite is currently undergoing scheduled maintenance to improve performance and reliability. Access is temporarily paused to ensure data integrity.
        </p>

        {/* Estimated Time Indicator */}
        {estimatedTime && (
          <div className="flex items-center gap-3 font-bold mt-2">
            <Clock className="w-6 h-6 text-[#39FF14]" />
            <span className="text-gray-300 tracking-wide text-sm md:text-base">SYSTEM WILL RESUME AROUND <strong className="text-[#39FF14] ml-1">{estimatedTime}</strong></span>
          </div>
        )}

      </div>

    </div>
  );
}
