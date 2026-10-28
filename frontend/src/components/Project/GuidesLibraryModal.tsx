"use client";

import { useState } from "react";
import { LAND_COVER_VIDEOS } from "./LandCoverTrainingModal";

interface GuidesLibraryModalProps {
  isOpen: boolean;
  trainingType: "landcover" | "transportation" | "roof" | null;
  onClose: () => void;
}

export function GuidesLibraryModal({ isOpen, trainingType, onClose }: GuidesLibraryModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen || !trainingType) return null;

  const filteredLandCover = LAND_COVER_VIDEOS.filter(video =>
    video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    video.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-[240px] z-[10010] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#060D14] rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl border border-black/10 dark:border-white/10 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex flex-col gap-4 bg-[#E0E1DD]/30 dark:bg-[#0D1B2A]/30 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold text-[#0D1B2A] dark:text-white">
                {trainingType === 'landcover' ? "Land Cover Guides Library" : trainingType === 'roof' ? "Roof Guides Library" : "Transportation Guides Library"}
              </h3>
              <p className="text-sm text-[#2F3E46] dark:text-white/60">
                Search and review all training materials.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>

          {trainingType === 'landcover' && (
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                type="text"
                placeholder="Search videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-[#0D1B2A] dark:text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761]"
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 bg-gray-50 dark:bg-black/20">
          {trainingType === 'landcover' ? (
            filteredLandCover.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLandCover.map((video, index) => (
                  <a
                    key={video.id}
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group bg-white dark:bg-[#0D1B2A] rounded-xl border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col"
                  >
                    <div className="aspect-video w-full bg-black relative">
                      <img
                        src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                        alt={video.title}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white ml-1"><path d="M5 3l14 9-14 9V3z" /></svg>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h4 className="font-semibold text-sm text-[#0D1B2A] dark:text-white line-clamp-2 mb-2 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761] transition-colors">
                        {video.title}
                      </h4>
                      <div className="mt-auto flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          Video {index + 1}
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 group-hover:text-[#1F7A1F] dark:group-hover:text-[#55f761]"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <p>No guides found matching "{searchQuery}"</p>
              </div>
            )
          ) : trainingType === 'roof' ? (
            // Roof
            <div className="h-full flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-6 p-4">
              {/* Training Guide Card */}
              <div className="bg-[#0B1524] dark:bg-[#0B1524] p-8 rounded-3xl border border-[#18263E] shadow-xl max-w-sm w-full text-center flex flex-col justify-between hover:border-blue-500/30 transition-all">
                <div>
                  <div className="w-16 h-16 bg-[#132A4B] text-[#2B7FFF] rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 1 2 2z" /><line x1="12" y1="10" x2="12" y2="16" /><line x1="9" y1="13" x2="15" y2="13" /></svg>
                  </div>
                  <h4 className="font-bold text-2xl text-white mb-3 tracking-wide">Training Guide</h4>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-[280px] mx-auto mb-8">
                    Access all the latest roof training documents and guidelines from this shared folder.
                  </p>
                </div>
                <a
                  href="https://docs.google.com/document/d/1FfGpQ7xgb7QLTkc4l6OICqpU8fhUNknCq-5G1XbLAcY/edit?tab=t.5r1ob59i57jt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#1B65FF] hover:bg-[#1253E0] text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-500/25 w-full cursor-pointer"
                >
                  Open Guide
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                </a>
              </div>

              {/* 3D Roof Errors Card */}
              <div className="bg-[#0B1524] dark:bg-[#0B1524] p-8 rounded-3xl border border-[#18263E] shadow-xl max-w-sm w-full text-center flex flex-col justify-between hover:border-red-500/30 transition-all">
                <div>
                  <div className="w-16 h-16 bg-[#3B151A] text-[#EF4444] rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  </div>
                  <h4 className="font-bold text-2xl text-white mb-3 tracking-wide">3D Roof Errors</h4>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-[280px] mx-auto mb-8">
                    View solutions for common errors and crash issues during 3D Roof training.
                  </p>
                </div>
                <a
                  href="https://docs.google.com/document/d/1cmx6GA8Mz2T22Rp62U9xHkdDR9cGmzO-3jZZfzrplVU/edit?tab=t.0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-500/25 w-full cursor-pointer"
                >
                  Open Errors Guide
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                </a>
              </div>

              {/* Software Card */}
              <div className="bg-[#0B1524] dark:bg-[#0B1524] p-8 rounded-3xl border border-[#18263E] shadow-xl max-w-sm w-full text-center flex flex-col justify-between hover:border-purple-500/30 transition-all">
                <div>
                  <div className="w-16 h-16 bg-[#2B174B] text-[#A855F7] rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  </div>
                  <h4 className="font-bold text-2xl text-white mb-3 tracking-wide">Software</h4>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-[280px] mx-auto mb-8">
                    Download the latest Ginger software package required for roof training.
                  </p>
                </div>
                <a
                  href="https://drive.google.com/file/d/1lncommiFW0arF6roKybTJwiM2-To_Wus/view"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#9D17FF] hover:bg-[#850EE6] text-white rounded-2xl font-bold transition-all shadow-lg shadow-purple-500/25 w-full cursor-pointer"
                >
                  Download Software
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                </a>
              </div>
            </div>
          ) : (
            // Transportation
            <div className="h-full flex flex-col sm:flex-row items-center justify-center gap-6 p-4">
              {/* Guide Card */}
              <div className="bg-white dark:bg-[#0D1B2A] p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-sm max-w-sm w-full text-center flex flex-col h-full max-h-[350px] hover:shadow-md transition-shadow">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.8c.55 0 1.07.24 1.4.65L12 6h8a2 2 0 0 1 2 2v.4z" /><path d="M10 14h4" /><path d="M12 12v4" /></svg>
                </div>
                <h4 className="font-bold text-xl text-[#0D1B2A] dark:text-white mb-2">Training Guide</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 flex-1">
                  Access all the latest transportation training documents and guidelines from this shared folder.
                </p>
                <a
                  href="https://drive.google.com/drive/folders/1YCFhZedmramOMdjIh8mlWpzUgwKRoHVU"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-md shadow-blue-500/20 w-full mt-auto"
                >
                  Open Guide
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                </a>
              </div>

              {/* Answer Key Card */}
              <div className="bg-white dark:bg-[#0D1B2A] p-8 rounded-2xl border border-black/10 dark:border-white/10 shadow-sm max-w-sm w-full text-center flex flex-col h-full max-h-[350px] hover:shadow-md transition-shadow">
                <div className="w-16 h-16 bg-purple-50 dark:bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-600 dark:text-purple-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                </div>
                <h4 className="font-bold text-xl text-[#0D1B2A] dark:text-white mb-2">Answer Key</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 flex-1">
                  Review the answer key to understand common mistakes and improve your labeling accuracy.
                </p>
                <a
                  href="https://docs.google.com/document/d/1ebqNINjbzUdsvr2gPqeKnYSMXL1Ff1910oHcfCh-N0k/edit?usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors shadow-md shadow-purple-500/20 w-full mt-auto"
                >
                  Open Answer Key
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
