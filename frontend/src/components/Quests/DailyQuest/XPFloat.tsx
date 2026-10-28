import React from "react";

interface XPFloatProps {
  floatingXPs: { id: number; text: string; label: string }[];
}

// Small spark burst around the number: angle (deg), travel distance (px).
const SPARKS = Array.from({ length: 8 }, (_, i) => ({
  angle: 45 * i + 22.5,
  distance: 70 + (i % 2) * 20,
}));

export default function XPFloat({ floatingXPs }: XPFloatProps) {
  // Total runtime is ~1.8s; useQuests removes the overlay at 2s.
  const xpStyles = `
    /* Number pops in with a small overshoot, holds, then floats up and fades */
    @keyframes xpPop {
      0%   { opacity: 0; transform: translateY(12px) scale(1.6); }
      15%  { opacity: 1; transform: translateY(0) scale(0.95); }
      24%  { transform: scale(1.04); }
      32%  { transform: scale(1); }
      75%  { opacity: 1; transform: translateY(0) scale(1); }
      100% { opacity: 0; transform: translateY(-40px) scale(0.95); }
    }
    /* Single highlight sweep across the text */
    @keyframes xpShine {
      0%, 20% { background-position: 200% 0; }
      50%, 100% { background-position: -100% 0; }
    }
    @keyframes xpBanner {
      0%, 10% { opacity: 0; letter-spacing: 0.6em; }
      30%     { opacity: 1; letter-spacing: 0.3em; }
      75%     { opacity: 1; transform: translateY(0); }
      100%    { opacity: 0; transform: translateY(-40px); }
    }
    @keyframes xpRing {
      0%   { opacity: 0.9; transform: translate(-50%, -50%) scale(0.3); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(2.2); }
    }
    @keyframes xpSpark {
      0%   { opacity: 0; transform: translate(-50%, -50%) rotate(var(--a)) translateX(10px); }
      20%  { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--a)) translateX(var(--d)); }
    }

    .xp-pop    { animation: xpPop 1.8s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
    .xp-text {
      background: linear-gradient(110deg, #55f761 0%, #55f761 38%, #eaffec 48%, #55f761 58%, #55f761 100%);
      background-size: 250% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: xpShine 1.8s ease-out forwards;
      filter: drop-shadow(0 0 10px rgba(85, 247, 97, 0.6)) drop-shadow(0 2px 0 rgba(13, 61, 13, 0.9));
    }
    .xp-banner { animation: xpBanner 1.8s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
    .xp-ring   { animation: xpRing 0.6s ease-out 0.15s forwards; }
    .xp-spark  { animation: xpSpark 0.7s ease-out 0.15s forwards; }

    @media (prefers-reduced-motion: reduce) {
      .xp-ring, .xp-spark { display: none; }
      .xp-text { animation: none; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: xpStyles }} />
      {floatingXPs.map((xp) => (
        <div
          key={xp.id}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none select-none font-sans"
        >
          {/* Ring + sparks, centred behind the number */}
          <div className="relative w-0 h-0">
            <div className="xp-ring absolute left-1/2 top-1/2 w-32 h-32 rounded-full border-2 border-[#55f761] shadow-[0_0_14px_rgba(85,247,97,0.6)] opacity-0" />
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="xp-spark absolute left-1/2 top-1/2 w-1.5 h-1.5 rotate-45 bg-[#55f761] shadow-[0_0_6px_#55f761] opacity-0"
                style={{
                  ["--a" as string]: `${s.angle}deg`,
                  ["--d" as string]: `${s.distance}px`,
                } as React.CSSProperties}
              />
            ))}
          </div>

          <div className="absolute flex flex-col items-center">
            <div className="xp-banner mb-0.5 text-[10px] font-black uppercase text-[#ffd166] drop-shadow-[0_0_6px_rgba(255,209,102,0.6)] opacity-0">
              {xp.label}
            </div>
            <div className="xp-pop opacity-0">
              <span className="xp-text block text-5xl sm:text-6xl font-black tracking-wider italic">
                {xp.text}
              </span>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
