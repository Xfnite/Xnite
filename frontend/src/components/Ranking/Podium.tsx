"use client";

import React from "react";

interface TopPlayer {
  rank: number;
  name: string;
  wager: string;
  avatar: string;
}

interface PodiumProps {
  topPlayers: TopPlayer[];
  showUnredacted?: boolean;
}

function maskWager(wager: string): string {
  const parts = wager.split(".");
  let whole = parts[0];
  
  let digitCount = 0;
  for (let i = whole.length - 1; i >= 0; i--) {
    if (/[0-9]/.test(whole[i])) {
      digitCount++;
      if (digitCount > 3) {
        whole = whole.substring(0, i) + "*" + whole.substring(i + 1);
      }
    }
  }
  
  return parts.length > 1 ? `${whole}.${parts[1]}` : whole;
}

export default function Podium({ topPlayers, showUnredacted = false }: PodiumProps) {
  const first = topPlayers.find(p => p.rank === 1) || { name: "PlayerOne", wager: "₱12,500.00", avatar: "" };
  const second = topPlayers.find(p => p.rank === 2) || { name: "PlayerTwo", wager: "₱9,200.00", avatar: "" };
  const third = topPlayers.find(p => p.rank === 3) || { name: "PlayerThree", wager: "₱7,800.00", avatar: "" };

  return (
    <div className="flex flex-col items-center w-full select-none py-4">
      {/* SVG Gradients definitions */}
      <svg className="absolute w-0 h-0">
        <defs>
          {/* Gold gradients */}
          <linearGradient id="goldTopGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ca8a04" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
          <linearGradient id="goldBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#78350f" />
            <stop offset="35%" stopColor="#ca8a04" />
            <stop offset="55%" stopColor="#fef08a" />
            <stop offset="70%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#854d0e" />
          </linearGradient>
          
          {/* Teal gradients */}
          <linearGradient id="tealTopGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#115e59" />
          </linearGradient>
          <linearGradient id="tealBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#042f2e" />
            <stop offset="35%" stopColor="#115e59" />
            <stop offset="55%" stopColor="#2dd4bf" />
            <stop offset="75%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#115e59" />
          </linearGradient>
        </defs>
      </svg>

      {/* 3D Podium Container */}
      <div className="flex items-end justify-center w-full max-w-4xl px-4 mt-8 gap-6 sm:gap-12 md:gap-16">
        
        {/* SECOND PLACE (LEFT) */}
        <div className="flex flex-col items-center z-10 animate-in fade-in slide-in-from-bottom duration-700 delay-100">
          {/* Avatar and Info */}
          <div className="flex flex-col items-center mb-6 text-center">
            {/* Pentagon Medal Wrapper (Silver) */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 filter drop-shadow-[0_0_10px_rgba(226,232,240,0.5)] transition-transform duration-300 hover:scale-105 cursor-pointer mb-3">
              <div 
                className="w-full h-full bg-gradient-to-b from-[#E2E8F0] to-[#94A3B8] flex items-center justify-center"
                style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
              >
                <div 
                  className="w-[90%] h-[90%] bg-[#0B0F19] flex items-center justify-center"
                  style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                >
                  <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFFFF] to-[#CBD5E1] drop-shadow-[0_2px_4px_rgba(255,255,255,0.4)] select-none">
                    2
                  </span>
                </div>
              </div>
            </div>
            {/* Name and wager */}
            <span className="text-xs sm:text-sm font-bold text-[#0D1B2A] dark:text-white truncate max-w-[90px] sm:max-w-[120px]">
              {second.name}
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-yellow-600 dark:text-[#EAB308] mt-0.5">
              {showUnredacted ? second.wager : maskWager(second.wager)}
            </span>
          </div>

          {/* 3D Cylinder Render */}
          <div className="relative flex justify-center w-[110px] sm:w-[145px] md:w-[180px]">
            {/* Badge "2" sitting on front edge */}
            <div className="absolute -top-4 sm:-top-5 left-1/2 -translate-x-1/2 z-30">
              <svg width="34" height="34" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_3px_5px_rgba(0,0,0,0.35)] sm:w-[38px] sm:h-[38px]">
                <path d="M50 5 L63 20 L80 15 L80 33 L95 45 L80 57 L80 75 L63 80 L50 95 L37 80 L20 75 L20 57 L5 45 L20 33 L20 15 L37 20 Z" fill="#94a3b8" stroke="#f1f5f9" strokeWidth="6" />
                <path d="M50 15 L59 27 L72 23 L72 37 L83 45 L72 53 L72 67 L59 73 L50 85 L41 73 L28 67 L28 53 L17 45 L28 37 L28 23 L41 27 Z" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                <text x="50" y="60" textAnchor="middle" fill="#0f172a" fontSize="38" fontWeight="extrabold" fontFamily="sans-serif">2</text>
              </svg>
            </div>

            {/* Cylinder SVG (Width: 160, Height: 120, Top Ellipse: ry=16, cx=80, cy=16) */}
            <svg 
              width="100%" 
              viewBox="0 0 160 120" 
              fill="none" 
              className="z-10 overflow-visible"
              style={{
                WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)",
                maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)"
              }}
            >
              {/* Cylinder Body Path with curved bottom arc */}
              <path d="M 0,16 L 0,90 A 80,16 0 0,0 160,90 L 160,16 Z" fill="url(#tealBodyGrad)" />
              {/* Cylinder Top Ellipse */}
              <ellipse cx="80" cy="16" rx="80" ry="16" fill="url(#tealTopGrad)" stroke="#2dd4bf" strokeWidth="0.5" />
            </svg>
          </div>
        </div>

        {/* FIRST PLACE (CENTER - TALLER & FOREGROUND) */}
        <div className="flex flex-col items-center z-20 animate-in fade-in slide-in-from-bottom duration-700">
          {/* Avatar and Info */}
          <div className="flex flex-col items-center mb-8 text-center">
            {/* Pentagon Medal Wrapper (Gold) */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 filter drop-shadow-[0_0_15px_rgba(251,191,36,0.6)] transition-transform duration-300 hover:scale-105 cursor-pointer mb-2">
              <div 
                className="w-full h-full bg-gradient-to-b from-[#FFE259] to-[#FFA751] flex items-center justify-center"
                style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
              >
                <div 
                  className="w-[90%] h-[90%] bg-[#0B0F19] flex items-center justify-center"
                  style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                >
                  <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFFFF] to-[#FFE259] drop-shadow-[0_2px_6px_rgba(255,226,89,0.6)] select-none">
                    1
                  </span>
                </div>
              </div>
            </div>
            {/* Name and wager */}
            <span className="text-xs sm:text-base font-bold text-[#0D1B2A] dark:text-white truncate max-w-[110px] sm:max-w-[150px]">
              {first.name}
            </span>
            <span className="text-xs sm:text-sm font-bold text-yellow-600 dark:text-[#EAB308] mt-0.5">
              {showUnredacted ? first.wager : maskWager(first.wager)}
            </span>
          </div>

          {/* 3D Cylinder Render */}
          <div className="relative flex justify-center w-[140px] sm:w-[185px] md:w-[230px]">
            {/* Badge "1" sitting on front edge */}
            <div className="absolute -top-5 sm:-top-6 left-1/2 -translate-x-1/2 z-30">
              <svg width="38" height="38" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)] sm:w-[42px] sm:h-[42px]">
                <polygon points="50,5 90,28 90,72 50,95 10,72 10,28" fill="#e06c13" stroke="#f59e0b" strokeWidth="6" />
                <polygon points="50,15 80,33 80,67 50,85 20,67 20,33" fill="none" stroke="#fef08a" strokeWidth="2" />
                <text x="50" y="65" textAnchor="middle" fill="#ffffff" fontSize="42" fontWeight="extrabold" fontFamily="sans-serif">1</text>
              </svg>
            </div>

            {/* Cylinder SVG (Width: 200, Height: 155, Top Ellipse: ry=20, cx=100, cy=20) */}
            <svg 
              width="100%" 
              viewBox="0 0 200 155" 
              fill="none" 
              className="z-10 overflow-visible"
              style={{
                WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)",
                maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)"
              }}
            >
              {/* Cylinder Body Path with curved bottom arc */}
              <path d="M 0,20 L 0,130 A 100,20 0 0,0 200,130 L 200,20 Z" fill="url(#goldBodyGrad)" />
              {/* Cylinder Top Ellipse */}
              <ellipse cx="100" cy="20" rx="100" ry="20" fill="url(#goldTopGrad)" stroke="#fef08a" strokeWidth="0.5" />
            </svg>
          </div>
        </div>

        {/* THIRD PLACE (RIGHT) */}
        <div className="flex flex-col items-center z-10 animate-in fade-in slide-in-from-bottom duration-700 delay-200">
          {/* Avatar and Info */}
          <div className="flex flex-col items-center mb-6 text-center">
            {/* Pentagon Medal Wrapper (Bronze) */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 filter drop-shadow-[0_0_10px_rgba(180,83,9,0.5)] transition-transform duration-300 hover:scale-105 cursor-pointer mb-3">
              <div 
                className="w-full h-full bg-gradient-to-b from-[#F59E0B] to-[#B45309] flex items-center justify-center"
                style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
              >
                <div 
                  className="w-[90%] h-[90%] bg-[#0B0F19] flex items-center justify-center"
                  style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
                >
                  <span className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#FFFFFF] to-[#F59E0B] drop-shadow-[0_2px_4px_rgba(245,158,11,0.4)] select-none">
                    3
                  </span>
                </div>
              </div>
            </div>
            {/* Name and wager */}
            <span className="text-xs sm:text-sm font-bold text-[#0D1B2A] dark:text-white truncate max-w-[90px] sm:max-w-[120px]">
              {third.name}
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-yellow-600 dark:text-[#EAB308] mt-0.5">
              {showUnredacted ? third.wager : maskWager(third.wager)}
            </span>
          </div>

          {/* 3D Cylinder Render */}
          <div className="relative flex justify-center w-[110px] sm:w-[145px] md:w-[180px]">
            {/* Badge "3" sitting on front edge */}
            <div className="absolute -top-4 sm:-top-5 left-1/2 -translate-x-1/2 z-30">
              <svg width="34" height="34" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_3px_5px_rgba(0,0,0,0.35)] sm:w-[38px] sm:h-[38px]">
                <path d="M50 5 L63 20 L80 15 L80 33 L95 45 L80 57 L80 75 L63 80 L50 95 L37 80 L20 75 L20 57 L5 45 L20 33 L20 15 L37 20 Z" fill="#94a3b8" stroke="#f1f5f9" strokeWidth="6" />
                <path d="M50 15 L59 27 L72 23 L72 37 L83 45 L72 53 L72 67 L59 73 L50 85 L41 73 L28 67 L28 53 L17 45 L28 37 L28 23 L41 27 Z" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                <text x="50" y="60" textAnchor="middle" fill="#0f172a" fontSize="38" fontWeight="extrabold" fontFamily="sans-serif">3</text>
              </svg>
            </div>

            {/* Cylinder SVG (Width: 160, Height: 120, Top Ellipse: ry=16, cx=80, cy=16) - Slightly shorter body */}
            <svg 
              width="100%" 
              viewBox="0 0 160 120" 
              fill="none" 
              className="z-10 overflow-visible"
              style={{
                WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)",
                maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 13%, rgba(0,0,0,0) 100%)"
              }}
            >
              {/* Cylinder Body Path with curved bottom arc */}
              <path d="M 0,16 L 0,72 A 80,16 0 0,0 160,72 L 160,16 Z" fill="url(#tealBodyGrad)" />
              {/* Cylinder Top Ellipse */}
              <ellipse cx="80" cy="16" rx="80" ry="16" fill="url(#tealTopGrad)" stroke="#2dd4bf" strokeWidth="0.5" />
            </svg>
          </div>
        </div>

      </div>
    </div>
  );
}
