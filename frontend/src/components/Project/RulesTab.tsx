"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getProjectRulesStatus, acceptProjectRules, saveRulesAndGuidelinesProgress } from "@/app/actions/project";
import { OnboardingHeader } from "@/components/Project/Rules/RulesHeader";
import { DownloadGuidelinesModal } from "@/components/Project/Rules/DownloadGuidelinesModal";
import InlineVideoPlayer from "@/components/Onboarding/InlineVideoPlayer";

const guidelineFiles = [
  {
    name: "rules-part-2.png",
    url: "/guidelines/rules-part-2.png",
    title: "Task Area Guidelines – Part 2.1",
    description: "rules-part-2.png",
  },
  {
    name: "task-area-2.png",
    url: "/guidelines/task-area-2.png",
    title: "Task Area Guidelines – Part 2.2",
    description: "task-area-2.png",
  },
];

const greenMaskFiles = [
  {
    name: "green mask img 1.png",
    url: "/guidelines/green mask img 1.png",
    title: "Green Mask Guidelines – Part 1",
    description: "green mask img 1.png",
  },
  {
    name: "green mask img 2.png",
    url: "/guidelines/green mask img 2.png",
    title: "Green Mask Guidelines – Part 2",
    description: "green mask img 2.png",
  },
];

const finalWorkAreaFiles = [
  {
    name: "FINAL Work Area 1.png",
    url: "/guidelines/FINAL Work Area 1.png",
    title: "Final Work Area – Part 1",
    description: "FINAL Work Area 1.png",
  },
  {
    name: "FINAL Work Area 2.png",
    url: "/guidelines/FINAL Work Area 2.png",
    title: "Final Work Area – Part 2",
    description: "FINAL Work Area 2.png",
  },
];

const basicTechniquesFiles = [
  {
    name: "The 4 Basic Techniques 1.png",
    url: "/guidelines/The 4 Basic Techniques 1.png",
    title: "The 4 Basic Techniques – Technique 1",
    description: "The 4 Basic Techniques 1.png",
  },
  {
    name: "The 4 Basic Techniques 2.png",
    url: "/guidelines/The 4 Basic Techniques 2.png",
    title: "The 4 Basic Techniques – Technique 2",
    description: "The 4 Basic Techniques 2.png",
  },
  {
    name: "The 4 Basic Techniques 3.png",
    url: "/guidelines/The 4 Basic Techniques 3.png",
    title: "The 4 Basic Techniques – Technique 3",
    description: "The 4 Basic Techniques 3.png",
  },
  {
    name: "The 4 Basic Techniques 4.png",
    url: "/guidelines/The 4 Basic Techniques 4.png",
    title: "The 4 Basic Techniques – Technique 4",
    description: "The 4 Basic Techniques 4.png",
  },
  {
    name: "The 4 Basic Techniques 5.jpg",
    url: "/guidelines/The 4 Basic Techniques 5.jpg",
    title: "The 4 Basic Techniques – Technique 5",
    description: "The 4 Basic Techniques 5.jpg",
  },
  {
    name: "The 4 Basic Techniques 6.jpg",
    url: "/guidelines/The 4 Basic Techniques 6.jpg",
    title: "The 4 Basic Techniques – Technique 6",
    description: "The 4 Basic Techniques 6.jpg",
  },
];


const additionalGuidelines1Files = [
  { name: "ADDITIONAL GUIDELINES img1.png", url: "/guidelines/ADDITIONAL GUIDELINES img1.png", title: "Additional Guidelines 1", description: "Additional Guidelines 1" },
  { name: "ADDITIONAL GUIDELINES img2.png", url: "/guidelines/ADDITIONAL GUIDELINES img2.png", title: "Additional Guidelines 2", description: "Additional Guidelines 2" },
];

const identifyGroundsFiles = [
  { name: "HOW TO IDENTIFY GROUNDS img1.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img1.jpg", title: "Identify Grounds A.1", description: "Identify Grounds A.1" },
  { name: "HOW TO IDENTIFY GROUNDS img2.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img2.jpg", title: "Identify Grounds A.2", description: "Identify Grounds A.2" },
  { name: "HOW TO IDENTIFY GROUNDS img3.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img3.jpg", title: "Identify Grounds B.1", description: "Identify Grounds B.1" },
  { name: "HOW TO IDENTIFY GROUNDS img4.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img4.jpg", title: "Identify Grounds B.2", description: "Identify Grounds B.2" },
  { name: "HOW TO IDENTIFY GROUNDS img 5.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img 5.jpg", title: "Identify Grounds C.1", description: "Identify Grounds C.1" },
  { name: "HOW TO IDENTIFY GROUNDS img6.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img6.jpg", title: "Identify Grounds C.2", description: "Identify Grounds C.2" },
  { name: "HOW TO IDENTIFY GROUNDS img 7.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img 7.jpg", title: "Identify Grounds D.1", description: "Identify Grounds D.1" },
  { name: "HOW TO IDENTIFY GROUNDS img8.jpg", url: "/guidelines/HOW TO IDENTIFY GROUNDS img8.jpg", title: "Identify Grounds D.2", description: "Identify Grounds D.2" },
  { name: "HOW TO IDENTIFY GROUNDS img9.png", url: "/guidelines/HOW TO IDENTIFY GROUNDS img9.png", title: "Identify Grounds Yard", description: "Identify Grounds Yard" },
  { name: "HOW TO IDENTIFY GROUNDS img10.png", url: "/guidelines/HOW TO IDENTIFY GROUNDS img10.png", title: "Identify Grounds Color", description: "Identify Grounds Color" },
];

const commonErrorsFiles = [
  { name: "COMMON ERRORS img1.jpg", url: "/guidelines/COMMON ERRORS img1.jpg", title: "Common Errors 1", description: "Common Errors 1" },
  { name: "COMMON ERRORS img2.png", url: "/guidelines/COMMON ERRORS img2.png", title: "Common Errors 2", description: "Common Errors 2" },
  { name: "COMMON ERRORS img3.png", url: "/guidelines/COMMON ERRORS img3.png", title: "Common Errors 3", description: "Common Errors 3" },
];

const dontDoThisFiles = [
  { name: "DON'T DO THIS img1.png", url: "/guidelines/DON'T DO THIS img1.png", title: "Don't Do This 1", description: "Don't Do This 1" },
  { name: "DON'T DO THIS img2.png", url: "/guidelines/DON'T DO THIS img2.png", title: "Don't Do This 2", description: "Don't Do This 2" },
  { name: "DON'T DO THIS img3.png", url: "/guidelines/DON'T DO THIS img3.png", title: "Don't Do This 3", description: "Don't Do This 3" },
  { name: "DON'T DO THIS img4.png", url: "/guidelines/DON'T DO THIS img4.png", title: "Don't Do This 4", description: "Don't Do This 4" },
  { name: "DON'T DO THIS img5.png", url: "/guidelines/DON'T DO THIS img5.png", title: "Don't Do This 5", description: "Don't Do This 5" },
  { name: "DON'T DO THIS img6.png", url: "/guidelines/DON'T DO THIS img6.png", title: "Don't Do This 6", description: "Don't Do This 6" },
  { name: "DON'T DO THIS img7.png", url: "/guidelines/DON'T DO THIS img7.png", title: "Don't Do This 7", description: "Don't Do This 7" },
  { name: "DON'T DO THIS img8.png", url: "/guidelines/DON'T DO THIS img8.png", title: "Don't Do This 8", description: "Don't Do This 8" },
  { name: "DON'T DO THIS img9.jpg", url: "/guidelines/DON'T DO THIS img9.jpg", title: "Don't Do This 9", description: "Don't Do This 9" },
  { name: "DON'T DO THIS img10.png", url: "/guidelines/DON'T DO THIS img10.png", title: "Don't Do This 10", description: "Don't Do This 10" },
  { name: "DON'T DO THIS img11.png", url: "/guidelines/DON'T DO THIS img11.png", title: "Don't Do This 11", description: "Don't Do This 11" },
  { name: "DON'T DO THIS img12.png", url: "/guidelines/DON'T DO THIS img12.png", title: "Don't Do This 12", description: "Don't Do This 12" },
  { name: "DON'T DO THIS img13.png", url: "/guidelines/DON'T DO THIS img13.png", title: "Don't Do This 13", description: "Don't Do This 13" },
  { name: "DON'T DO THIS img14.png", url: "/guidelines/DON'T DO THIS img14.png", title: "Don't Do This 14", description: "Don't Do This 14" },
];

const highQualityLabelingFiles = [
  { name: "EXAMPLE OF HIGH QUALITY LABELING img1.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img1.png", title: "HQ Labeling 1", description: "HQ Labeling 1" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img2.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img2.png", title: "HQ Labeling 2", description: "HQ Labeling 2" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img3.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img3.png", title: "HQ Labeling 3", description: "HQ Labeling 3" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img4.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img4.png", title: "HQ Labeling 4", description: "HQ Labeling 4" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img5.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img5.png", title: "HQ Labeling 5", description: "HQ Labeling 5" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img6.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img6.png", title: "HQ Labeling 6", description: "HQ Labeling 6" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img7.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img7.png", title: "HQ Labeling 7", description: "HQ Labeling 7" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img8.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img8.png", title: "HQ Labeling 8", description: "HQ Labeling 8" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img9.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img9.png", title: "HQ Labeling 9", description: "HQ Labeling 9" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img10.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img10.png", title: "HQ Labeling 10", description: "HQ Labeling 10" },
  { name: "EXAMPLE OF HIGH QUALITY LABELING img11.png", url: "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img11.png", title: "HQ Labeling 11", description: "HQ Labeling 11" },
];

const additionalGuidelines2Files = [
  { name: "ADDITIONAL GUIDELINES img3.png", url: "/guidelines/ADDITIONAL GUIDELINES img3.png", title: "Additional Guidelines 3", description: "Additional Guidelines 3" },
  { name: "ADDITIONAL GUIDELINES img4.jpg", url: "/guidelines/ADDITIONAL GUIDELINES img4.jpg", title: "Additional Guidelines 4", description: "Additional Guidelines 4" },
  { name: "ADDITIONAL GUIDELINES img5.jpg", url: "/guidelines/ADDITIONAL GUIDELINES img5.jpg", title: "Additional Guidelines 5", description: "Additional Guidelines 5" },
];

const guidelines = [
  {
    title: "Road & Connected Features",
    content:
      "For road and road connected landcover features, turn on the 3rd product type, and edit from there. Minimize editing on roads unless they are significantly incorrect.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <path d="M7 22v-4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" />
        <path d="M12 10v6" />
      </svg>
    ),
  },
  {
    title: "Efficient Categorization",
    content:
      "Use group category features and right click to change category quickly. This speeds up labeling times significantly.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    title: "Region Closure Guidelines",
    content:
      "Understand the definition and precise requirement of how to close a region properly to avoid boundary discrepancies.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="m22 2-7.5 7.5" />
        <path d="M12 6v6l3 3" />
      </svg>
    ),
  },
  {
    title: "Natural Feature Exclusions",
    content:
      "No need to edit nature features unless specifically requested in the individual sub-project prompt.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]">
        <path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M12 3a9 9 0 0 0-9 9c0 1.42.33 2.76.92 3.96L3 21l5.04-1.08c1.2.59 2.54.92 3.96.92a9 9 0 0 0 9-9 9 9 0 0 0-9-9z" />
      </svg>
    ),
  },
  {
    title: "Topology Errors Handling",
    content:
      "Understand each topology error meaning and use the proper tool in the software to resolve them quickly and systematically.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    title: "Reporting Protocol",
    content:
      "Before reporting neighbor conflicts, ensure you understand who is at fault. Always fix errors in your own tasks first, insert necessary comments, and then report to avoid endless cycles.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "Tree Canopy Boundaries",
    content:
      "If neighbor connecting errors are from a tree canopy boundary, do not report them. Directly fix and connect them within your own task area.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1F7A1F] dark:text-[#55f761]">
        <path d="M12 22V12" />
        <path d="M17 12a5 5 0 0 0-10 0v1a4 4 0 0 0 8 0v-1z" />
        <path d="M12 2a5 5 0 0 0-5 5v3h10V7a5 5 0 0 0-5-5z" />
      </svg>
    ),
  },
];

interface RulesModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export function RulesModal({ isOpen, onClose, onSuccess }: RulesModalProps) {
  const router = useRouter();
  const isDev = process.env.NEXT_PUBLIC_APP_ENV === "development" || (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_APP_ENV !== "production");
  const [accepted, setAccepted] = useState<boolean | null>(null); // null = loading
  const [reviewMode, setReviewMode] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(1);
  const [countdownTimer, setCountdownTimer] = useState<number>(0);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isGreenMaskDownloadOpen, setIsGreenMaskDownloadOpen] = useState(false);
  const [isWorkAreaDownloadOpen, setIsWorkAreaDownloadOpen] = useState(false);
  const [isBasicTechniquesDownloadOpen, setIsBasicTechniquesDownloadOpen] = useState(false);
  const [isAdditionalGuidelines1DownloadOpen, setIsAdditionalGuidelines1DownloadOpen] = useState(false);
  const [isIdentifyGroundsDownloadOpen, setIsIdentifyGroundsDownloadOpen] = useState(false);
  const [isCommonErrorsDownloadOpen, setIsCommonErrorsDownloadOpen] = useState(false);
  const [isDontDoThisDownloadOpen, setIsDontDoThisDownloadOpen] = useState(false);
  const [isHighQualityLabelingDownloadOpen, setIsHighQualityLabelingDownloadOpen] = useState(false);
  const [isAdditionalGuidelines2DownloadOpen, setIsAdditionalGuidelines2DownloadOpen] = useState(false);
  const STEP_DATA: any[] = [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    {
      "step": 9,
      "part": "Part 4.1: THE 4 BASIC TECHNIQUES",
      "title": "The 4 Basic Techniques",
      "instruction": "Repair by using Repair Tool",
      "type": "image",
      "image": "/guidelines/The 4 Basic Techniques 1.png"
    },
    {
      "step": 10,
      "part": "Part 4.2: THE 4 BASIC TECHNIQUES",
      "title": "The 4 Basic Techniques",
      "instruction": "Repair Missed Parts of Buildings",
      "type": "image",
      "image": "/guidelines/The 4 Basic Techniques 2.png"
    },
    {
      "step": 11,
      "part": "Part 4.3: THE 4 BASIC TECHNIQUES",
      "title": "The 4 Basic Techniques",
      "instruction": "Technique #3: Arc or Circle Tool (Key G)",
      "type": "image",
      "image": "/guidelines/The 4 Basic Techniques 3.png"
    },
    {
      "step": 12,
      "part": "Part 4.4: THE 4 BASIC TECHNIQUES",
      "title": "The 4 Basic Techniques",
      "instruction": "Those encircled in Yellow have shifted labels or missed part of the houses. you also need to repair this. While on the bottom left, that house has this strange corners, repair it by using straight lines.",
      "type": "image",
      "image": "/guidelines/The 4 Basic Techniques 4.png"
    },
    {
      "step": 13,
      "part": "Part 4.5: THE 4 BASIC TECHNIQUES",
      "title": "The 4 Basic Techniques",
      "instruction": "Technique & Guidelines Example 1",
      "type": "image",
      "image": "/guidelines/The 4 Basic Techniques 5.jpg"
    },
    {
      "step": 14,
      "part": "Part 4.6: THE 4 BASIC TECHNIQUES",
      "title": "The 4 Basic Techniques",
      "instruction": "Technique & Guidelines Example 2",
      "type": "image",
      "image": "/guidelines/The 4 Basic Techniques 6.jpg"
    },
    {
      "step": 15,
      "part": "Part 4.7: THE 4 BASIC TECHNIQUES",
      "title": "The 4 Basic Techniques",
      "instruction": "Watch this technique video carefully.",
      "type": "video",
      "videoId": "Iax_-XIR7K0"
    },
    {
      "step": 16,
      "part": "Part 3.2: ADDITIONAL GUIDELINES",
      "title": "Additional Guidelines",
      "instruction": "Press R to toggle SHOW LABEL ON/OFF",
      "type": "image",
      "image": "/guidelines/ADDITIONAL GUIDELINES img1.png"
    },
    {
      "step": 17,
      "part": "Part 3.2: ADDITIONAL GUIDELINES",
      "title": "Additional Guidelines",
      "instruction": "How to adjust Task Brightness: (Helps to make tasks a little bit clearer)",
      "type": "video",
      "videoId": "lm-GPVYh3DY"
    },
    {
      "step": 18,
      "part": "Part 3.2: ADDITIONAL GUIDELINES",
      "title": "Additional Guidelines",
      "instruction": "In case you need to get the neighboring map image due to incomplete building structure:",
      "type": "video",
      "videoId": "1d3nvFFzhw0"
    },
    {
      "step": 19,
      "part": "Part 3.2: ADDITIONAL GUIDELINES",
      "title": "Additional Guidelines",
      "instruction": "How to FIX WHITE SCREEN ERROR - SCREENSHOT THIS, THIS HAPPENS MOST OF THE TIME IN ACTUAL WORK",
      "type": "image",
      "image": "/guidelines/ADDITIONAL GUIDELINES img2.png",
      "triggerModal": "isAdditionalGuidelines1DownloadOpen"
    },
    {
      "step": 20,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds A.1",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img1.jpg"
    },
    {
      "step": 21,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds A.2",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img2.jpg"
    },
    {
      "step": 22,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds B.1",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img3.jpg"
    },
    {
      "step": 23,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds B.2",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img4.jpg"
    },
    {
      "step": 24,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds C.1",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img 5.jpg"
    },
    {
      "step": 25,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds C.2",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img6.jpg"
    },
    {
      "step": 26,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds D.1",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img 7.jpg"
    },
    {
      "step": 27,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds D.2",
      "instruction": "You must DELETE GROUNDS.\nGrounds has no height, no building texture.Don't draw ground or yard or any strange stuff as buildings. Only draw obvious buildings.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img8.jpg"
    },
    {
      "step": 28,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds",
      "instruction": "If you analyze carefully, this is a Yard and Ground, NOT part of the Building.",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img9.png"
    },
    {
      "step": 29,
      "part": "Part 4: HOW TO IDENTIFY GROUNDS!",
      "title": "How to Identify Grounds",
      "instruction": "Analyze color, Grounds are usually GRAY, DARK GRAY, BROWN, LIGHT BROWN. GREEN(TREES), LIGHT GREEN(GRASS).",
      "type": "image",
      "image": "/guidelines/HOW TO IDENTIFY GROUNDS img10.png",
      "triggerModal": "isIdentifyGroundsDownloadOpen"
    },
    {
      "step": 30,
      "part": "Part 4.2: COMMON ERRORS!",
      "title": "Common Errors",
      "instruction": "DO NOT LABEL GRAVEYARDS",
      "type": "image",
      "image": "/guidelines/COMMON ERRORS img1.jpg"
    },
    {
      "step": 31,
      "part": "Part 4.2: COMMON ERRORS!",
      "title": "Common Errors",
      "instruction": "DO NOT LABEL ROCKS, MOUNTAINS, HILLS (One of the signs is that there are no access roads, or it resembles a jungle, so its most likely just rock formations or trees)",
      "type": "image",
      "image": "/guidelines/COMMON ERRORS img2.png"
    },
    {
      "step": 32,
      "part": "Part 4.2: COMMON ERRORS!",
      "title": "Common Errors",
      "instruction": "DO NOT LABEL ROCKS, MOUNTAINS, HILLS (One of the signs is that there are no access roads, or it resembles a jungle, so its most likely just rock formations or trees)",
      "type": "image",
      "image": "/guidelines/COMMON ERRORS img3.png",
      "triggerModal": "isCommonErrorsDownloadOpen"
    },
    {
      "step": 33,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "What is Autopasser/Autopassing?",
      "instruction": "Autopasser is someone who passes a task without working on it, not reviewing the whole task, or not finishing the task given to him. it is called autopassing because all he does is pass task, download new task, pass task, download new task and so on.\n\nDON'T DO THIS! submitting a Normal Repair Project without reviewing and repairing the whole task.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img1.png"
    },
    {
      "step": 34,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! MANY MISSED BUILDINGS AND VERY VERY OBVIOUS ERRORS!",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img2.png"
    },
    {
      "step": 35,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! only fixing one building on the lower left and didn't even review the others even it has VERY OBVIOUS ERRORS!.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img3.png"
    },
    {
      "step": 36,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! even ACCIDENTALLY SUBMITTING A TASK is not a VALID REASON for the Client, so be careful. when submitting a task, a pop up prompt will show up asking to click yes or no if you really want to submit a task. so it is less likely you accidentally submit it! FOCUS always while working.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img4.png"
    },
    {
      "step": 37,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! submitting a Normal Repair Project without reviewing and repairing the whole task. so MANY OBVIOUS ERRORS! i can even see it even though it is zoomed out.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img5.png"
    },
    {
      "step": 38,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! even the big buildings he repaired seems worst than the training, It's okay to skip some VERY VERY COMPLICATED 3D MULTILAYER BUILDINGS, but the 3D on this task even only have 1 Layer, just need to draw the top most part and drag down, very easy to do. but let's set aside the 3D issues, he didn't even repaired the non-3D/small buildings around, VERY LOW QUALITY!",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img6.png"
    },
    {
      "step": 39,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! he didn't even deleted the fake label/parking lot which is VERY BIG and VERY OBVIOUS on the right side. also some small containers in the left side should be deleted.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img7.png"
    },
    {
      "step": 40,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! fixing only 3 Features in the map and submitting it? you think this task is a JOKE? you are just wasting a nice task. instead of earning money, you autopassed it.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img8.png"
    },
    {
      "step": 41,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! This is still considered AUTOPASS. not REVIEWING THE TASK PROPERLY! each task must be repaired 60%-90% but this labeler was too LAZY and skipped most part of this task that still has many errors. IF YOU ARE LAZY TO WORK, BETTER REST AND GO TO SLEEP then go back to work if you regained your energy!",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img9.jpg"
    },
    {
      "step": 42,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! A VERY LOW QUALITY TASK, fixing a few features won't let you get away with AUTOPASS! so many obvious errors!",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img10.png"
    },
    {
      "step": 43,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! I think this labeler did not know what to do because he didn't read the Rules and Guidelines, \"Let's delete everything and try to draw everything from scratch\" is BUL*SH8*!!! Don't delete generated labels and submit tasks like this. take your time when working such tasks, you may leave the 3D buildings first and focus on smaller and easy buildings, then try to work out easy 3D buildings and you can skip the hard complicated multi-layer buildings, checker might consider your task if he/she can see you are making an effort.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img11.png"
    },
    {
      "step": 44,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! DON'T DRAW LIKE THIS! Always label with high quality and straight lines, not zigzag or tetris like shapes. this is considered VERY VERY LOW QUALITY, Even if you don't autopass, you might get RESET if you keep submitting tasks like this.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img12.png"
    },
    {
      "step": 45,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DRAW LIKE THIS! the black spots are only shadows caused by elevated roofs NOT HOLES!",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img13.png"
    },
    {
      "step": 46,
      "part": "Part 5: DON'T DO THIS! AUTOPASSING!",
      "title": "DON'T DO THIS!",
      "instruction": "DON'T DO THIS! THIS IS VERY VERY LOW QUALITY and client might consider resetting your account, It's very obvious this labeler didn't read through the Rules and Guidelines, why? this labeler labeled fake grounds, didn't check the red labels in the first 4 Grids, and he/she doesn't know his/her own work area and keep labeling fake grounds out of his/her work area. even the way this labeler labeled the grounds are very ugly.",
      "type": "image",
      "image": "/guidelines/DON'T DO THIS img14.png",
      "triggerModal": "isDontDoThisDownloadOpen"
    },
    {
      "step": 47,
      "part": "Part 5.1: Q&A",
      "title": "Q&A",
      "instruction": "Do you now know what is an AUTOPASSER?",
      "type": "qa_radio",
      "question": "Do you now know what is an AUTOPASSER?",
      "answerKey": "q_autopasser_radio",
      "correctValue": "YES",
      "options": [
        {
          "label": "YES! I will be careful and wil not AUTOPASS any task, I will work with Quality.",
          "value": "YES"
        },
        {
          "label": "Sorry, I forgot what is an autopasser because i didn't read the examples above.",
          "value": "NO"
        }
      ]
    },
    {
      "step": 48,
      "part": "Part 5.2: Q&A",
      "title": "Q&A",
      "instruction": "What if you encounter an error that prevents you from editing a task?",
      "type": "qa_radio",
      "question": "What if you encounter an error that prevents you from editing a task?",
      "answerKey": "q_error_radio",
      "correctValue": "REPORT",
      "options": [
        {
          "label": "I will report it to my Team Managers and/or Leaders and wait for his instructions.",
          "value": "REPORT"
        },
        {
          "label": "I will just autopass it so that I can pull a task again. then all my effort will go to waste because I will get ZERO SLARY.",
          "value": "AUTOPASS"
        }
      ]
    },
    {
      "step": 49,
      "part": "Part 5.3: Q&A",
      "title": "Q&A",
      "instruction": "What if you need to go somewhere or you were held up with an emergency situation?",
      "type": "qa_radio",
      "question": "What if you need to go somewhere or you were held up with an emergency situation?",
      "answerKey": "q_emergency_radio",
      "correctValue": "CLOSE",
      "options": [
        {
          "label": "I will close my Ginger and shutdown my PC then message Cedrick Sabrine ASAP if i have a chance.",
          "value": "CLOSE"
        },
        {
          "label": "I will autopass my task before I go, then I am fine with a ZERO SALARY, I am aware all my work will reset if I autopass but its fine..",
          "value": "AUTOPASS"
        }
      ]
    },
    {
      "step": 50,
      "part": "Part 5.4: Q&A",
      "title": "Q&A",
      "instruction": "PLEASE FOLLOW CORRECT PUNCTUATION MARK, CAPITALIZATION, AND SPELLING WHEN FILLING OUT THE QUESTIONS BELOW.",
      "type": "qa_input",
      "image": "/guidelines/DON'T DO THIS img15.jpg",
      "answerKey": "q_autopass_input",
      "correctValue": "I will NOT AUTOPASS! I will REVIEW WHOLE TASK and FIX ALL ERRORS ALWAYS from the first grid to the last"
    },
    {
      "step": 51,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "YOU SHOULD PRACTICE AND AT LEAST TRY TO LABEL LIKE THIS!\n\nDon't OVERCUT into small pieces, analyze the building/house size, you can compare it to other buildings if the size is just right.",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img1.png"
    },
    {
      "step": 52,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "Draw straight as much as possible, also draw as squares. avoid doing so much zigzag/tetris labels.",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img2.png"
    },
    {
      "step": 53,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "HIGH QUALITY NEW CREATION PROJECT",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img3.png"
    },
    {
      "step": 54,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "HIGH QUALITY NEW CREATION PROJECT",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img4.png"
    },
    {
      "step": 55,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "HIGH QUALITY NEW CREATION PROJECT",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img5.png"
    },
    {
      "step": 56,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "HIGH QUALITY(60%-90% needs to be repaired) NORMAL/STANDARD REPAIR PROJECT:",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img6.png"
    },
    {
      "step": 57,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "HIGH QUALITY(60%-90% needs to be repaired) NORMAL/STANDARD REPAIR PROJECT:",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img7.png"
    },
    {
      "step": 58,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "HIGH QUALITY(60%-90% needs to be repaired) NORMAL/STANDARD REPAIR PROJECT:",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img8.png"
    },
    {
      "step": 59,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "HIGH QUALITY(60%-90% needs to be repaired) NORMAL/STANDARD REPAIR PROJECT:",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img9.png"
    },
    {
      "step": 60,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "Blurred Image",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img10.png"
    },
    {
      "step": 61,
      "part": "Part 6: EXAMPLE OF HIGH QUALITY LABELING",
      "title": "High Quality Labeling",
      "instruction": "Label and cut as Straight Lines like the one you had in your hands on training task.",
      "type": "image",
      "image": "/guidelines/EXAMPLE OF HIGH QUALITY LABELING img11.png",
      "triggerModal": "isHighQualityLabelingDownloadOpen"
    },
    {
      "step": 62,
      "part": "Part 6.1: Q&A",
      "title": "Q&A",
      "instruction": "How do I Label the features?",
      "type": "qa_radio",
      "question": "How do I Label the features?",
      "answerKey": "q_label_radio",
      "correctValue": "QUALITY",
      "options": [
        {
          "label": "I will Label them with quality using STRAIGHT LINES.",
          "value": "QUALITY"
        },
        {
          "label": "I DON'T WAN TO EARNI so I will Label them with very LOW QUALITY using zigzag/tetris/slanted lines.",
          "value": "LOW_QUALITY"
        }
      ]
    },
    {
      "step": 63,
      "part": "Additional Guidelines",
      "title": "Additional Guidelines",
      "instruction": "WARNING: WE CURRENTLY HAVE SPECIAL RULES WITH EACH SPECIFIC PROJECTS, KINDLY READ GROUP ANNOUNCEMENTS FOR ACTIVE PROJECT RULES\n\nSINCE YOU ARE STILL NEW, ALWAYS FOLLOW CHECKER COMMENTS, THEY ARE NOT ONLY TASKED TO FIND YOUR ERRORS BUT ALSO TO ASSIST YOU. SOME COMMENTS MIGHT BE DOUBTING, BUT THEY HAVE MORE EXPERIENCE THAN YOU AS OF THE MOMENT, SO ALWAYS FOLLOW THEM. AFTER YOU FOLLOW THEIR COMMENTS, REVIEW THE WHOLE TASK AGAIN, CHECKERS CAN ONLY HAVE LIMITED COMMENTS SO THEY CAN'T JUST CHECK THE WHOLE TASK FOR YOU, YOU MUST STILL REVIEW THE REST OF THE TASK.",
      "type": "image",
      "image": "/guidelines/ADDITIONAL GUIDELINES img3.png"
    },
    {
      "step": 64,
      "part": "Additional Guidelines",
      "title": "Additional Guidelines",
      "instruction": "NOTE: Ginger has an auto-save feature but this has been causing a lot of crashes and unrecoverable work, so please always press NO everytime it pop-ups. \"ALWAYS USE MANUAL SAVE, PRESS THE SAVE ICON ON THE UPPER LEFT PORTION OF THE TOOLBAR.\"",
      "type": "image",
      "image": "/guidelines/ADDITIONAL GUIDELINES img4.jpg"
    },
    {
      "step": 65,
      "part": "Additional Guidelines",
      "title": "Additional Guidelines",
      "instruction": "PRESS THE SAVE ICON ON THE UPPER LEFT PORTION OF THE TOOLBAR.",
      "type": "image",
      "image": "/guidelines/ADDITIONAL GUIDELINES img5.jpg",
      "triggerModal": "isAdditionalGuidelines2DownloadOpen"
    }
  ];
  const [maxStepVisited, setMaxStepVisited] = useState(1);
  const [videoProgress, setVideoProgress] = useState<Record<string, number>>({});
  const [videoDuration, setVideoDuration] = useState<number>(835);
  const [hasVideoStarted, setHasVideoStarted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const videoPlayerRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      window.scrollTo({ top: 0, behavior: 'instant' } as any);
      const topAnchor = document.getElementById("rules-top-anchor");
      if (topAnchor) {
        topAnchor.scrollIntoView();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStep]);
  const TECH_VIDEO_ID = "IaUeAIqTwjM";

  const formatVideoCountdown = (secs: number): string => {
    if (secs < 0) return "...";
    if (secs === 0) return "0secs";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m > 0) {
      return s > 0 ? `${m}min ${s}secs` : `${m}min`;
    }
    return `${s}secs`;
  };

  useEffect(() => {
    getProjectRulesStatus().then((res) => {
      setAccepted(res.accepted);

      const db = res.progress;
      const lsStep = typeof window !== "undefined" ? localStorage.getItem("xnite_rules_current_step") : null;
      const lsMax = typeof window !== "undefined" ? localStorage.getItem("xnite_rules_max_step_visited") : null;
      const lsVideo = typeof window !== "undefined" ? localStorage.getItem("xnite_rules_video_progress") : null;

      const parsedLsStep = lsStep ? parseInt(lsStep, 10) : null;
      const parsedLsMax = lsMax ? parseInt(lsMax, 10) : null;
      const parsedLsVideo = lsVideo ? (() => { try { return JSON.parse(lsVideo); } catch { return null; } })() : null;

      const dbStep = db?.currentStep ?? null;
      const dbMax = db?.maxStepVisited ?? null;

      const resolvedStep = Math.max(parsedLsStep ?? 1, dbStep ?? 1);
      const resolvedMax = Math.max(parsedLsMax ?? 1, dbMax ?? 1);

      const resolvedVideo: Record<string, number> = {};
      const allVideoKeys = new Set([...Object.keys(parsedLsVideo ?? {}), ...Object.keys(db?.videoProgress ?? {})]);
      for (const k of allVideoKeys) {
        resolvedVideo[k] = Math.max(parsedLsVideo?.[k] ?? 0, db?.videoProgress?.[k] ?? 0);
      }

      if (resolvedStep >= 1 && resolvedStep <= 65) setCurrentStep(resolvedStep);
      if (resolvedMax >= 1 && resolvedMax <= 65) setMaxStepVisited(resolvedMax);
      if (Object.keys(resolvedVideo).length > 0) setVideoProgress(resolvedVideo);

      if (db?.formAnswers) {
        setFormAnswers((prev) => ({ ...prev, ...db.formAnswers }));
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("xnite_rules_current_step", resolvedStep.toString());
        localStorage.setItem("xnite_rules_max_step_visited", resolvedMax.toString());
        if (Object.keys(resolvedVideo).length > 0) {
          localStorage.setItem("xnite_rules_video_progress", JSON.stringify(resolvedVideo));
        }
      }

      setIsInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("xnite_rules_current_step", currentStep.toString());
    }
    setHasVideoStarted(false);
  }, [currentStep]);

  useEffect(() => {
    if (!isInitialized) return;

    if (accepted !== false || currentStep < 2 || currentStep > 65 || currentStep <= maxStepVisited) {
      setCountdownTimer(0);
      return;
    }

    if (isDev) {
      setCountdownTimer(0);
      setMaxStepVisited((prevMax) => {
        const newMax = Math.max(prevMax, currentStep);
        if (typeof window !== "undefined") {
          localStorage.setItem("xnite_rules_max_step_visited", newMax.toString());
        }
        return newMax;
      });
      return;
    }

    if (currentStep === 8) {
      const progressPercent = videoProgress[TECH_VIDEO_ID] ?? 0;
      if (progressPercent >= 98) {
        setCountdownTimer(0);
        return;
      }
      if (videoDuration > 0) {
        const fullThreshold = Math.floor(videoDuration * 0.25) + 10;
        const watchedSecs = Math.floor((progressPercent / 100) * videoDuration);
        const remaining = Math.max(0, fullThreshold - watchedSecs);
        setCountdownTimer(remaining);
      } else {
        setCountdownTimer(-1); // Waiting for video API load
      }
      return;
    }

    setCountdownTimer(5);

    const interval = setInterval(() => {
      setCountdownTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setMaxStepVisited((prevMax) => {
            const newMax = Math.max(prevMax, currentStep);
            if (typeof window !== "undefined") {
              localStorage.setItem("xnite_rules_max_step_visited", newMax.toString());
            }
            return newMax;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, accepted, isInitialized]);

  const handleVideoProgress = (vidId: string, percent: number) => {
    setVideoProgress((prev) => {
      const existing = prev[vidId] || 0;
      if (percent <= existing) return prev;
      isDirtyRef.current = true;
      const updated = { ...prev, [vidId]: Math.max(existing, percent) };
      if (typeof window !== "undefined") {
        localStorage.setItem("xnite_rules_video_progress", JSON.stringify(updated));
      }
      if (vidId === TECH_VIDEO_ID && percent >= 98) {
        setMaxStepVisited((prevMax) => {
          const newMax = Math.max(prevMax, 8);
          if (typeof window !== "undefined") {
            localStorage.setItem("xnite_rules_max_step_visited", newMax.toString());
          }
          return newMax;
        });
      }
      return updated;
    });
  };

  const handleVideoTimeUpdate = (vidId: string, currentTime: number, duration: number) => {
    if (vidId === TECH_VIDEO_ID) {
      setVideoDuration(duration);
      if (currentStep === 8 && currentStep > maxStepVisited) {
        const fullThreshold = Math.floor(duration * 0.25) + 10;
        const remaining = Math.max(0, fullThreshold - Math.floor(currentTime));
        setCountdownTimer(remaining);
      }
    }
  };

  const handleVideoEnded = () => {
    if (currentStep === 8) {
      setCountdownTimer(0);
      handleVideoProgress(TECH_VIDEO_ID, 100);
    }
  };

  const [formAnswers, setFormAnswers] = useState({
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    q5: "",
    q6: "",
    q7: "",
    q_autopasser_radio: "",
    q_error_radio: "",
    q_emergency_radio: "",
    q_autopass_input: "",
    q_label_radio: "",
  });

  const EXPECTED = {
    q1: "I agree and understood all the rules.",
    q2: "Never submit/AUTOPASS unedited/unreviewed tasks.",
    q3: "As much as possible, draw/cut straight lines.",
    q4: "GOLDEN RULE: Review the whole task and repair all errors including comments ALWAYS!",
    q5: "NO LOW QUALITY TASKS.",
    q6: "Never submit/AUTOPASS unedited/unreviewed tasks.",
    q7: "I will receive Zero Salary if i fail to follow all Rules above.",
  };

  const fieldCorrect = {
    q1: formAnswers.q1 === EXPECTED.q1,
    q2: formAnswers.q2 === EXPECTED.q2,
    q3: formAnswers.q3 === EXPECTED.q3,
    q4: formAnswers.q4 === EXPECTED.q4,
    q5: formAnswers.q5 === EXPECTED.q5,
    q6: formAnswers.q6 === EXPECTED.q6,
    q7: formAnswers.q7 === EXPECTED.q7,
    q_autopasser_radio: formAnswers.q_autopasser_radio === "YES",
    q_error_radio: formAnswers.q_error_radio === "REPORT",
    q_emergency_radio: formAnswers.q_emergency_radio === "CLOSE",
    q_autopass_input: formAnswers.q_autopass_input === "I will NOT AUTOPASS! I will REVIEW WHOLE TASK and FIX ALL ERRORS ALWAYS from the first grid to the last",
    q_label_radio: formAnswers.q_label_radio === "QUALITY",
  };

  const fieldError = {
    q1: formAnswers.q1.length > 0 && !fieldCorrect.q1,
    q2: formAnswers.q2.length > 0 && !fieldCorrect.q2,
    q3: formAnswers.q3.length > 0 && !fieldCorrect.q3,
    q4: formAnswers.q4.length > 0 && !fieldCorrect.q4,
    q5: formAnswers.q5.length > 0 && !fieldCorrect.q5,
    q6: formAnswers.q6.length > 0 && !fieldCorrect.q6,
    q7: formAnswers.q7.length > 0 && !fieldCorrect.q7,
  };

  const isStep1Valid =
    fieldCorrect.q1 &&
    fieldCorrect.q2 &&
    fieldCorrect.q3 &&
    fieldCorrect.q4 &&
    fieldCorrect.q5 &&
    fieldCorrect.q6 &&
    fieldCorrect.q7;

  const isDirtyRef = useRef(false);

  useEffect(() => {
    if (!isInitialized || accepted !== false || !isDirtyRef.current) return;
    const timeout = setTimeout(() => {
      if (isDirtyRef.current) {
        isDirtyRef.current = false;
        saveRulesAndGuidelinesProgress({ currentStep, maxStepVisited, videoProgress, formAnswers }, false);
      }
    }, 10000);
    return () => clearTimeout(timeout);
  }, [currentStep, maxStepVisited, videoProgress, formAnswers, isInitialized, accepted]);

  const stateRef = useRef({ currentStep, maxStepVisited, videoProgress, formAnswers, isInitialized, accepted });
  useEffect(() => {
    stateRef.current = { currentStep, maxStepVisited, videoProgress, formAnswers, isInitialized, accepted };
  }, [currentStep, maxStepVisited, videoProgress, formAnswers, isInitialized, accepted]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const state = stateRef.current;
      if (state.isInitialized && state.accepted === false) {
        saveRulesAndGuidelinesProgress({
          currentStep: state.currentStep,
          maxStepVisited: state.maxStepVisited,
          videoProgress: state.videoProgress,
          formAnswers: state.formAnswers,
        }, true).catch(() => { });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload(); // Save on unmount/navigation
    };
  }, []);

  const handleAccept = () => {
    startTransition(async () => {
      const result = await acceptProjectRules();
      if (result.success) {
        setAccepted(true);
        toast.success("Rules acknowledged! Access unlocked.");
        if (typeof window !== "undefined") {
          localStorage.removeItem("xnite_rules_current_step");
          localStorage.removeItem("xnite_rules_max_step_visited");
          localStorage.removeItem("xnite_rules_video_progress");
          window.dispatchEvent(new Event("rules_and_guidelines_completed"));
        }
        if (onSuccess) {
          onSuccess();
        } else {
          setTimeout(() => router.push("/project"), 1000);
        }
      } else {
        toast.error(result.error ?? "Failed to save. Please try again.");
      }
    });
  };

  if (!isOpen) return null;

  if (accepted === true && !reviewMode) {
    return (
      <div className="relative w-full rounded-2xl border border-black/8 dark:border-white/8 bg-white/95 dark:bg-[#0D1B2A]/98 backdrop-blur-xl shadow-2xl p-6 sm:p-8 text-center space-y-8 my-4">
        {/* Decorative Badge Header */}
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-gradient-to-r from-[#1F7A1F] to-[#55f761] rounded-full blur-lg opacity-40 animate-pulse"></div>
          <div className="relative mx-auto w-20 h-20 rounded-full bg-[#E0E1DD] dark:bg-[#1B263B] border-2 border-[#1F7A1F]/30 dark:border-[#55f761]/30 flex items-center justify-center shadow-xl">
            <svg className="w-10 h-10 text-[#1F7A1F] dark:text-[#55f761]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#0D1B2A] dark:text-white uppercase">
            🎉 Congratulations, Challenger!
          </h2>
          <p className="text-[#1F7A1F] dark:text-[#55f761] text-xs sm:text-sm font-bold tracking-wide uppercase">
            Hands-On Training Completed
          </p>
        </div>

        {/* Main Message */}
        <p className="max-w-2xl mx-auto text-xs sm:text-sm leading-relaxed text-[#0D1B2A]/80 dark:text-white/80 font-medium">
          You have successfully completed the Hands-On Training and are now eligible to work on Xfnite projects.
        </p>

        {/* Specialized Training Alert */}
        <div className="max-w-2xl mx-auto bg-amber-500/5 dark:bg-amber-500/[0.02] border border-amber-500/20 dark:border-amber-500/10 rounded-2xl p-4 text-left">
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 font-medium">
            <span className="font-bold">Please note:</span> Some projects may require additional specialized training before you can start working on them. Examples include <span className="font-semibold">3D Matching Training</span>, <span className="font-semibold">Landcover Training</span>, and <span className="font-semibold">Transportation Training</span>. Other projects may only require the Hands-On Training you have already completed.
          </p>
        </div>

        {/* Three Qualities Section */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#2F3E46]/60 dark:text-white/40">
            The Three Qualities of a Challenger
          </h3>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
            {/* Card 1 */}
            <div className="group relative overflow-hidden rounded-xl border border-black/8 dark:border-white/8 bg-gradient-to-br from-white/30 to-white/10 dark:from-white/[0.01] dark:to-white/[0.03] p-4 text-center transition-all duration-300 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:scale-[1.02] backdrop-blur-sm flex flex-col items-center min-h-[140px]">
              <div className="w-9 h-9 rounded-lg bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center mb-3 text-base">
                ⚔️
              </div>
              <h4 className="text-xs font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider mb-1.5">
                Determination
              </h4>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
                Keep pushing forward. Mistakes are part of the learning process, and improvement comes through persistence.
              </p>
            </div>

            {/* Card 2 */}
            <div className="group relative overflow-hidden rounded-xl border border-black/8 dark:border-white/8 bg-gradient-to-br from-white/30 to-white/10 dark:from-white/[0.01] dark:to-white/[0.03] p-4 text-center transition-all duration-300 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:scale-[1.02] backdrop-blur-sm flex flex-col items-center min-h-[140px]">
              <div className="w-9 h-9 rounded-lg bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center mb-3 text-base">
                🧠
              </div>
              <h4 className="text-xs font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider mb-1.5">
                Initiative
              </h4>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
                Always review the guides, training materials, and available resources before asking for help. Strong researchers become strong performers.
              </p>
            </div>

            {/* Card 3 */}
            <div className="group relative overflow-hidden rounded-xl border border-black/8 dark:border-white/8 bg-gradient-to-br from-white/30 to-white/10 dark:from-white/[0.01] dark:to-white/[0.03] p-4 text-center transition-all duration-300 hover:border-[#1F7A1F]/30 dark:hover:border-[#55f761]/30 hover:bg-white/60 dark:hover:bg-white/[0.04] hover:scale-[1.02] backdrop-blur-sm flex flex-col items-center min-h-[140px]">
              <div className="w-9 h-9 rounded-lg bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 flex items-center justify-center mb-3 text-base">
                📈
              </div>
              <h4 className="text-xs font-bold text-[#0D1B2A] dark:text-white uppercase tracking-wider mb-1.5">
                Growth
              </h4>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
                Continue developing your speed, accuracy, and skills. The more capable you become, the more opportunities you can unlock.
              </p>
            </div>
          </div>
        </div>

        {/* Team Manager Guidance Message */}
        <div className="pt-2 max-w-xl mx-auto space-y-4">
          <p className="text-xs leading-relaxed text-[#0D1B2A]/70 dark:text-white/70 font-semibold">
            Your Team Managers will guide you through any project-specific training when needed.
          </p>
          <p className="text-xs font-bold text-[#1F7A1F] dark:text-[#55f761] bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 px-4 py-2.5 rounded-xl border border-[#1F7A1F]/10 dark:border-[#55f761]/10 max-w-md mx-auto">
            You&apos;ve cleared the first stage, now it&apos;s time to continue your journey and take on real projects.
          </p>
          <p className="text-xs font-extrabold tracking-widest text-[#0D1B2A]/50 dark:text-white/40 uppercase">
            Good luck, Challenger! 🚀
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 border-t border-black/5 dark:border-white/5">
          <button
            type="button"
            onClick={onSuccess || onClose || (() => router.push("/project?tab=active"))}
            className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-xs shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/20 active:scale-95 transition-all cursor-pointer border border-[#55f761]/10"
          >
            Start Journey
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentStep(1);
              setReviewMode(true);
            }}
            className="px-8 py-2.5 rounded-xl border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] font-bold text-xs hover:bg-[#1F7A1F]/5 dark:hover:bg-[#55f761]/5 active:scale-95 transition-all cursor-pointer"
          >
            Review Rules &amp; Guidelines
          </button>

        </div>
      </div>
    );
  }

  if (accepted === null) {
    return (
      <div className="w-full min-h-[50vh] flex items-center justify-center p-4">
        <div className="flex items-center gap-3 py-4 text-[#0D1B2A] dark:text-white">
          <div className="w-5 h-5 border-2 border-[#1F7A1F] dark:border-[#55f761] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm opacity-80 font-medium">Checking status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col transition-all duration-300 animate-fadeIn h-[80vh]">
      <div
        className="relative w-full h-full bg-white dark:bg-[#0d1520] border border-black/10 dark:border-white/15 rounded-2xl shadow-sm flex flex-col overflow-hidden transition-all duration-300"
      >
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto hide-scrollbar bg-black/[0.01] dark:bg-white/[0.01] flex flex-col">
          <div id="rules-top-anchor" />
          {currentStep === 1 ? (
            <>
              <div className="relative shrink-0">
                <OnboardingHeader
                  icon="📋"
                  subtitle="Part 1: RULES"
                  title="Rules and Guidelines"
                  accepted={accepted === true}
                  onClose={onClose}
                  banner={
                    <div className="p-3 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-400 leading-relaxed shadow-sm">
                      ⚠️ PLEASE FOLLOW CORRECT PUNCTUATION MARK, CAPITALIZATION, AND SPELLING WHEN FILLING OUT THE QUESTIONS BELOW.
                    </div>
                  }
                />
              </div>

              <div className="px-6 sm:px-8 py-3 border-b border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 w-full max-w-xs sm:max-w-md">
                  {Array.from({ length: 65 }, (_, i) => i + 1).map((stepNum) => (
                    <div key={stepNum} className="flex-1">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${stepNum <= currentStep
                          ? "bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a]"
                          : "bg-black/10 dark:bg-white/10"
                          }`}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-[10px] font-mono font-bold tracking-widest text-[#2F3E46]/60 dark:text-white/40 ml-4 shrink-0">
                  STEP {currentStep} OF 65
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="relative shrink-0">
                <OnboardingHeader
                  icon="📋"
                  subtitle={
                    currentStep === 2
                      ? "Part 2.1: TASK AREA RULES"
                      : currentStep === 3
                        ? "Part 2.2: TASK AREA RULES"
                        : currentStep === 4
                          ? "Part 3.1: GREEN MASK"
                          : currentStep === 5
                            ? "Part 3.2: GREEN MASK"
                            : currentStep === 6 || currentStep === 7
                              ? "Part 2.3: WORK AREA"
                              : currentStep === 8
                                ? "Part 4: THE 4 BASIC TECHNIQUES VIDEO"
                                : STEP_DATA[currentStep]?.part || "Rules"
                  }
                  title={
                    currentStep <= 3
                      ? "Task Area"
                      : currentStep <= 5
                        ? "Green Mask"
                        : currentStep <= 7
                          ? "FINAL Work Area"
                          : currentStep === 8
                            ? "Technique Instruction Video"
                            : STEP_DATA[currentStep]?.title || "Rules"
                  }
                  accepted={accepted === true}
                  onClose={onClose}
                  banner={
                    currentStep <= 3 ? (
                      <div className="pl-3 border-l-2 border-orange-500/70 space-y-1 py-0.5">
                        <p className="text-sm font-bold sm:text-base text-[#0D1B2A] dark:text-white leading-relaxed">
                          Task Area Guidelines:
                        </p>
                        <ul className="text-xs sm:text-sm font-medium text-[#2F3E46]/80 dark:text-gray-300 space-y-1 list-disc pl-3.5 leading-relaxed">
                          <li>Only Label within the <span className="font-semibold text-orange-600 dark:text-orange-400">BIG RED GRID</span></li>
                          <li>Don&apos;t label buildings touching the most Left and Upper Lines</li>
                          <li>Label buildings touching Right and Bottom Lines</li>
                        </ul>
                      </div>
                    ) : currentStep <= 5 ? (
                      <div className="pl-3 border-l-2 border-emerald-500/70 space-y-1 py-0.5">
                        <p className="text-sm font-bold sm:text-base text-[#0D1B2A] dark:text-white leading-relaxed">
                          Green Mask Guidelines:
                        </p>
                        <ul className="text-xs sm:text-sm font-medium text-[#2F3E46]/80 dark:text-gray-300 space-y-1 list-disc pl-3.5 leading-relaxed">
                          <li>Press <kbd className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[10px] text-emerald-700 dark:text-[#55f761] font-bold">~</kbd> to show Green Mask</li>
                          <li>Label buildings that are only inside or touching the green mask inside your Task Area</li>
                        </ul>
                      </div>
                    ) : currentStep <= 7 ? (
                      <div className="pl-3 border-l-2 border-orange-600/75 space-y-1 py-0.5">
                        <p className="text-sm font-bold sm:text-base text-[#0D1B2A] dark:text-white leading-relaxed">
                          Rules and Guidelines Part 2.3: WORK AREA
                        </p>
                        <ul className="text-xs sm:text-sm font-medium text-[#2F3E46]/80 dark:text-gray-300 space-y-1 list-disc pl-3.5 leading-relaxed">
                          <li>Red Grid + Green Mask = FINAL Work Area</li>
                        </ul>
                      </div>
                    ) : (
                      <div className="pl-3 border-l-2 border-blue-500/75 space-y-1 py-0.5">
                        <p className="text-sm font-bold sm:text-base text-[#0D1B2A] dark:text-white leading-relaxed">
                          {currentStep === 8 ? "Part 4: The 4 Basic Techniques Video" : STEP_DATA[currentStep]?.part || "Rules"}
                        </p>
                      </div>
                    )
                  }
                />
              </div>

              <div className="px-6 sm:px-8 py-3 border-b border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 w-full max-w-xs sm:max-w-md">
                  {Array.from({ length: 65 }, (_, i) => i + 1).map((stepNum) => (
                    <div key={stepNum} className="flex-1">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${stepNum <= currentStep
                          ? "bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a]"
                          : "bg-black/10 dark:bg-white/10"
                          }`}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-[10px] font-mono font-bold tracking-widest text-[#2F3E46]/60 dark:text-white/40 ml-4 shrink-0">
                  STEP {currentStep} OF 65
                </span>
              </div>
            </>
          )}

          <div className="p-6 sm:p-8 space-y-6">
            {currentStep === 1 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <span className="text-[10px] font-black tracking-widest text-[#1F7A1F] dark:text-[#55f761] uppercase block mb-1">SECTION V</span>
                  <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug">
                    Rules: (Please Screenshot the image below)
                  </h3>
                </div>
                <div className="flex justify-center p-1">
                  <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                    <img
                      src="/rules-section-v.png"
                      alt="Rules and Guidelines Section V Image"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                </div>
              </div>
            ) : currentStep === 2 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug">
                    Task Area/Work Area:
                  </h3>
                </div>
                <div className="flex justify-center p-1">
                  <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                    <img
                      src="/guidelines/rules-part-2.png"
                      alt="Task Area Guidelines Image"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                </div>
              </div>
            ) : currentStep === 3 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug">
                    Task Area/Work Area:
                  </h3>
                </div>
                <div className="flex justify-center p-1">
                  <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                    <img
                      src="/guidelines/task-area-2.png"
                      alt="Task Area Guidelines Image 2"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                </div>
              </div>
            ) : currentStep === 4 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <h3 className="text-base sm:text-lg text-[#0D1B2A] dark:text-white leading-snug">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-xs font-bold text-[#1F7A1F] dark:text-[#55f761]">~</kbd> to show Green Mask.
                  </h3>
                </div>
                <div className="flex justify-center p-1">
                  <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                    <img
                      src="/guidelines/green mask img 1.png"
                      alt="Green Mask Guidelines Image 1"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                </div>
              </div>
            ) : currentStep === 5 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <h3 className="text-base sm:text-lg text-[#0D1B2A] dark:text-white leading-snug">
                    If the house/building is inside your Task area and is partially touching Green Mask, you can Label it.
                  </h3>
                </div>
                <div className="flex justify-center p-1">
                  <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                    <img
                      src="/guidelines/green mask img 2.png"
                      alt="Green Mask Guidelines Image 2"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                </div>
              </div>
            ) : currentStep === 6 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <h3 className="text-base sm:text-lg text-[#0D1B2A] dark:text-white leading-snug">
                    Example: In this IMAGE, inside the Red Grid is your Task Area.
                  </h3>
                </div>
                <div className="flex justify-center p-1">
                  <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                    <img
                      src="/guidelines/FINAL Work Area 1.png"
                      alt="Final Work Area Guidelines Image 1"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                </div>
              </div>
            ) : currentStep === 7 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <h3 className="text-base sm:text-lg text-[#0D1B2A] dark:text-white leading-snug">
                    After i press ~, the Green Mask should appear, as you have noticed in the IMAGE below, there is a part not covered in Green Mask, your Work Area COVERS ONLY those with Green Mask that is inside your Task Area/Red Grid.
                  </h3>
                </div>
                <div className="flex justify-center p-1">
                  <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                    <img
                      src="/guidelines/FINAL Work Area 2.png"
                      alt="Final Work Area Guidelines Image 2"
                      className="w-full h-auto object-contain block mx-auto"
                    />
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="text-xs sm:text-sm text-[#0D1B2A]/90 dark:text-white/90 font-bold">
                    You don't need to label houses/buildings inside the Yellow Outline.
                  </div>
                  <div className="bg-amber-500/5 dark:bg-amber-500/[0.02] border border-amber-500/20 dark:border-amber-500/10 rounded-xl p-3.5 text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 space-y-1.5 leading-relaxed shadow-sm">
                    <div className="font-bold">Dont label if...</div>
                    <div className="pl-2.5">• Red Grid but no Green Mask</div>
                    <div className="pl-2.5">• Green Mask but not inside Red Grid</div>
                  </div>
                </div>
              </div>
            ) : currentStep === 8 ? (
              <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 animate-fadeIn">
                <div className="border-b border-black/5 dark:border-white/5 pb-3">
                  <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug">
                    The 4 Basic Techniques Video Instruction
                  </h3>
                </div>
                <div className="max-w-5xl mx-auto w-full">
                  <InlineVideoPlayer
                    ref={videoPlayerRef}
                    videoId={TECH_VIDEO_ID}
                    watchedPercent={videoProgress[TECH_VIDEO_ID] || 0}
                    onProgress={handleVideoProgress}
                    onPlay={() => setHasVideoStarted(true)}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onVideoEnded={handleVideoEnded}
                    thresholdExtraSecs={10}
                  />
                </div>
              </div>
            ) : currentStep >= 9 && currentStep <= 65 ? (
              (() => {
                if (currentStep < 9) return null; // handled above
                const stepInfo = STEP_DATA[currentStep];
                if (!stepInfo) return null;

                if (stepInfo.type === 'image') {
                  return (
                    <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 animate-fadeIn">
                      <div className="border-b border-black/5 dark:border-white/5 pb-3">
                        <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug whitespace-pre-wrap">
                          {stepInfo.instruction}
                        </h3>
                      </div>
                      <div className="flex justify-center p-1">
                        <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                          <img src={stepInfo.image} alt={stepInfo.title} className="w-full h-auto object-contain block mx-auto" />
                        </div>
                      </div>
                    </div>
                  );
                } else if (stepInfo.type === 'video') {
                  return (
                    <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 animate-fadeIn">
                      <div className="border-b border-black/5 dark:border-white/5 pb-3">
                        <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug whitespace-pre-wrap">
                          {stepInfo.instruction}
                        </h3>
                      </div>
                      <div className="max-w-5xl mx-auto w-full">
                        <InlineVideoPlayer
                          ref={videoPlayerRef}
                          videoId={stepInfo.videoId}
                          watchedPercent={videoProgress[stepInfo.videoId] || 0}
                          onProgress={handleVideoProgress}
                          onPlay={() => setHasVideoStarted(true)}
                          onTimeUpdate={handleVideoTimeUpdate}
                          onVideoEnded={() => {
                            setCountdownTimer(0);
                            handleVideoProgress(stepInfo.videoId, 100);
                          }}
                          thresholdExtraSecs={10}
                        />
                      </div>
                    </div>
                  );
                } else if (stepInfo.type === 'qa_radio') {
                  const isCorrect = fieldCorrect[stepInfo.answerKey as keyof typeof fieldCorrect];
                  return (
                    <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 animate-fadeIn">
                      <div className="border-b border-black/5 dark:border-white/5 pb-3">
                        <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug whitespace-pre-wrap">
                          {stepInfo.instruction}
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {stepInfo.options.map((opt: { label: string; value: string }) => (
                          <label key={opt.value} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${formAnswers[stepInfo.answerKey as keyof typeof formAnswers] === opt.value ? (isCorrect ? 'border-[#1F7A1F] bg-[#1F7A1F]/5' : 'border-red-500 bg-red-500/5') : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                            <input
                              type="radio"
                              name={stepInfo.answerKey}
                              value={opt.value}
                              checked={formAnswers[stepInfo.answerKey as keyof typeof formAnswers] === opt.value}
                              onChange={(e) => setFormAnswers({ ...formAnswers, [stepInfo.answerKey]: e.target.value })}
                              className="mt-1"
                            />
                            <span className="text-sm font-medium text-[#0D1B2A] dark:text-white">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                } else if (stepInfo.type === 'qa_input') {
                  const isCorrect = fieldCorrect[stepInfo.answerKey as keyof typeof fieldCorrect];
                  const isError = formAnswers[stepInfo.answerKey as keyof typeof formAnswers] && formAnswers[stepInfo.answerKey as keyof typeof formAnswers].length > 0 && !isCorrect;
                  return (
                    <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 animate-fadeIn">
                      <div className="border-b border-black/5 dark:border-white/5 pb-3">
                        <h3 className="text-base sm:text-lg font-bold text-[#0D1B2A] dark:text-white leading-snug whitespace-pre-wrap">
                          {stepInfo.instruction}
                        </h3>
                      </div>
                      {stepInfo.image && (
                        <div className="flex justify-center p-1 mb-4">
                          <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-5xl w-full bg-white dark:bg-[#0E1724]">
                            <img src={stepInfo.image} className="w-full h-auto object-contain block mx-auto" />
                          </div>
                        </div>
                      )}
                      <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${isError ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02]" : isCorrect ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5" : "border-black/10 dark:border-white/10"}`}>
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type:</div>
                        <div className="text-sm text-[#0D1B2A]/90 dark:text-white/90 font-bold select-none pointer-events-none pb-0.5">{stepInfo.correctValue}</div>
                        <div className={`relative flex items-center border rounded-xl px-4 py-2.5 gap-2.5 ${isError ? "bg-red-500/5 border-red-400/50" : isCorrect ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] border-black/10"}`}>
                          <input type="text" placeholder="Your answer" value={formAnswers[stepInfo.answerKey as keyof typeof formAnswers] || ""} onChange={(e) => setFormAnswers({ ...formAnswers, [stepInfo.answerKey]: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white font-medium" />
                        </div>
                        {isError && <p className="text-xs text-red-500 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                      </div>
                    </div>
                  );
                }
                return null;
              })()

            ) : null}

            {currentStep === 1 ? (
              <>
                <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${fieldError.q1 ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02] shadow-sm shadow-red-500/5" : fieldCorrect.q1 ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 shadow-sm shadow-emerald-500/5" : "border-black/10 dark:border-white/10"}`}>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type:</div>
                  <div className="text-sm text-[#0D1B2A]/90 dark:text-white/90 font-bold select-none pointer-events-none pb-0.5">I agree and understood all the rules.</div>
                  <div className={`relative flex items-center border rounded-xl px-4 py-2.5 transition-all duration-200 gap-2.5 ${fieldError.q1 ? "bg-red-500/5 border-red-400/50" : fieldCorrect.q1 ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#060D14] focus-within:border-[#1F7A1F] dark:focus-within:border-[#55f761] focus-within:ring-2 focus-within:ring-[#1F7A1F]/10"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fieldError.q1 ? "text-red-400 shrink-0" : fieldCorrect.q1 ? "text-[#1F7A1F] dark:text-[#55f761] shrink-0" : "text-gray-400 dark:text-gray-500 shrink-0"}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    <input type="text" placeholder="Your answer" value={formAnswers.q1} onChange={(e) => setFormAnswers({ ...formAnswers, q1: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium" />
                    {fieldCorrect.q1 && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#1F7A1F] dark:text-[#55f761] shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  {fieldError.q1 && <p className="text-xs text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                </div>

                <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${fieldError.q2 ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02] shadow-sm shadow-red-500/5" : fieldCorrect.q2 ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 shadow-sm shadow-emerald-500/5" : "border-black/10 dark:border-white/10"}`}>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type Rule #2:</div>
                  <div className={`relative flex items-center border rounded-xl px-4 py-2.5 transition-all duration-200 gap-2.5 ${fieldError.q2 ? "bg-red-500/5 border-red-400/50" : fieldCorrect.q2 ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#060D14] focus-within:border-[#1F7A1F] dark:focus-within:border-[#55f761] focus-within:ring-2 focus-within:ring-[#1F7A1F]/10"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fieldError.q2 ? "text-red-400 shrink-0" : fieldCorrect.q2 ? "text-[#1F7A1F] dark:text-[#55f761] shrink-0" : "text-gray-400 dark:text-gray-500 shrink-0"}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    <input type="text" placeholder="Your answer" value={formAnswers.q2} onChange={(e) => setFormAnswers({ ...formAnswers, q2: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium" />
                    {fieldCorrect.q2 && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#1F7A1F] dark:text-[#55f761] shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  {fieldError.q2 && <p className="text-xs text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                </div>

                <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${fieldError.q3 ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02] shadow-sm shadow-red-500/5" : fieldCorrect.q3 ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 shadow-sm shadow-emerald-500/5" : "border-black/10 dark:border-white/10"}`}>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type Rule #4:</div>
                  <div className={`relative flex items-center border rounded-xl px-4 py-2.5 transition-all duration-200 gap-2.5 ${fieldError.q3 ? "bg-red-500/5 border-red-400/50" : fieldCorrect.q3 ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#060D14] focus-within:border-[#1F7A1F] dark:focus-within:border-[#55f761] focus-within:ring-2 focus-within:ring-[#1F7A1F]/10"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fieldError.q3 ? "text-red-400 shrink-0" : fieldCorrect.q3 ? "text-[#1F7A1F] dark:text-[#55f761] shrink-0" : "text-gray-400 dark:text-gray-500 shrink-0"}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    <input type="text" placeholder="Your answer" value={formAnswers.q3} onChange={(e) => setFormAnswers({ ...formAnswers, q3: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium" />
                    {fieldCorrect.q3 && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#1F7A1F] dark:text-[#55f761] shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  {fieldError.q3 && <p className="text-xs text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                </div>

                <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${fieldError.q4 ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02] shadow-sm shadow-red-500/5" : fieldCorrect.q4 ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 shadow-sm shadow-emerald-500/5" : "border-black/10 dark:border-white/10"}`}>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type Rule #5:</div>
                  <div className={`relative flex items-center border rounded-xl px-4 py-2.5 transition-all duration-200 gap-2.5 ${fieldError.q4 ? "bg-red-500/5 border-red-400/50" : fieldCorrect.q4 ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#060D14] focus-within:border-[#1F7A1F] dark:focus-within:border-[#55f761] focus-within:ring-2 focus-within:ring-[#1F7A1F]/10"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fieldError.q4 ? "text-red-400 shrink-0" : fieldCorrect.q4 ? "text-[#1F7A1F] dark:text-[#55f761] shrink-0" : "text-gray-400 dark:text-gray-500 shrink-0"}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    <input type="text" placeholder="Your answer" value={formAnswers.q4} onChange={(e) => setFormAnswers({ ...formAnswers, q4: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium" />
                    {fieldCorrect.q4 && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#1F7A1F] dark:text-[#55f761] shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  {fieldError.q4 && <p className="text-xs text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                </div>

                <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${fieldError.q5 ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02] shadow-sm shadow-red-500/5" : fieldCorrect.q5 ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 shadow-sm shadow-emerald-500/5" : "border-black/10 dark:border-white/10"}`}>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type Rule #9:</div>
                  <div className={`relative flex items-center border rounded-xl px-4 py-2.5 transition-all duration-200 gap-2.5 ${fieldError.q5 ? "bg-red-500/5 border-red-400/50" : fieldCorrect.q5 ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#060D14] focus-within:border-[#1F7A1F] dark:focus-within:border-[#55f761] focus-within:ring-2 focus-within:ring-[#1F7A1F]/10"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fieldError.q5 ? "text-red-400 shrink-0" : fieldCorrect.q5 ? "text-[#1F7A1F] dark:text-[#55f761] shrink-0" : "text-gray-400 dark:text-gray-500 shrink-0"}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    <input type="text" placeholder="Your answer" value={formAnswers.q5} onChange={(e) => setFormAnswers({ ...formAnswers, q5: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium" />
                    {fieldCorrect.q5 && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#1F7A1F] dark:text-[#55f761] shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  {fieldError.q5 && <p className="text-xs text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                </div>

                <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${fieldError.q6 ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02] shadow-sm shadow-red-500/5" : fieldCorrect.q6 ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 shadow-sm shadow-emerald-500/5" : "border-black/10 dark:border-white/10"}`}>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type Rule #2:</div>
                  <div className={`relative flex items-center border rounded-xl px-4 py-2.5 transition-all duration-200 gap-2.5 ${fieldError.q6 ? "bg-red-500/5 border-red-400/50" : fieldCorrect.q6 ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#060D14] focus-within:border-[#1F7A1F] dark:focus-within:border-[#55f761] focus-within:ring-2 focus-within:ring-[#1F7A1F]/10"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fieldError.q6 ? "text-red-400 shrink-0" : fieldCorrect.q6 ? "text-[#1F7A1F] dark:text-[#55f761] shrink-0" : "text-gray-400 dark:text-gray-500 shrink-0"}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    <input type="text" placeholder="Your answer" value={formAnswers.q6} onChange={(e) => setFormAnswers({ ...formAnswers, q6: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium" />
                    {fieldCorrect.q6 && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#1F7A1F] dark:text-[#55f761] shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  {fieldError.q6 && <p className="text-xs text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                </div>

                <div className={`bg-white dark:bg-[#0E1724]/40 border rounded-2xl p-5 space-y-3 shadow-sm transition-all duration-300 ${fieldError.q7 ? "border-red-500/30 dark:border-red-500/40 bg-red-50/10 dark:bg-red-500/[0.02] shadow-sm shadow-red-500/5" : fieldCorrect.q7 ? "border-[#1F7A1F]/30 dark:border-[#55f761]/40 bg-[#1F7A1F]/5 dark:bg-[#55f761]/5 shadow-sm shadow-emerald-500/5" : "border-black/10 dark:border-white/10"}`}>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Please type:</div>
                  <div className="text-sm text-[#0D1B2A]/90 dark:text-white/90 font-bold select-none pointer-events-none pb-0.5">I will receive Zero Salary if i fail to follow all Rules above.</div>
                  <div className={`relative flex items-center border rounded-xl px-4 py-2.5 transition-all duration-200 gap-2.5 ${fieldError.q7 ? "bg-red-500/5 border-red-400/50" : fieldCorrect.q7 ? "bg-[#1F7A1F]/5 border-[#1F7A1F]/40" : "bg-black/[0.02] dark:bg-white/[0.02] border-black/10 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#060D14] focus-within:border-[#1F7A1F] dark:focus-within:border-[#55f761] focus-within:ring-2 focus-within:ring-[#1F7A1F]/10"}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={fieldError.q7 ? "text-red-400 shrink-0" : fieldCorrect.q7 ? "text-[#1F7A1F] dark:text-[#55f761] shrink-0" : "text-gray-400 dark:text-gray-500 shrink-0"}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    <input type="text" placeholder="Your answer" value={formAnswers.q7} onChange={(e) => setFormAnswers({ ...formAnswers, q7: e.target.value })} onPaste={(e) => e.preventDefault()} className="w-full bg-transparent outline-none border-none text-sm text-[#0D1B2A] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 font-medium" />
                    {fieldCorrect.q7 && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#1F7A1F] dark:text-[#55f761] shrink-0"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  {fieldError.q7 && <p className="text-xs text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">⚠ Check capitalization, punctuation, and spelling.</p>}
                </div>

                <div className="bg-amber-500/5 dark:bg-amber-500/[0.02] border border-amber-500/20 dark:border-amber-500/10 rounded-2xl p-5 space-y-2.5 shadow-sm">
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                    If you can't proceed because you are getting an error from the questions above, it means you did not read and follow the instruction. Please read and understand first, then answer the questions.
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1">
                    <span>💡</span> Double check spelling, periods, commas, and Capital Letters.
                  </p>
                </div>
              </>
            ) : (
              <>{/* Steps 2 & 3 are info-only — no answer fields */}</>
            )}
          </div>
        </div>

        <div className="px-6 sm:px-8 py-4 bg-gray-50/85 dark:bg-[#0b131e]/90 backdrop-blur-md border-t border-black/5 dark:border-white/5 flex justify-between items-center gap-3 shrink-0">
          {currentStep > 1 ? (
            <button
              onClick={() => {
                const prevStep = currentStep - 1;
                setCurrentStep(prevStep);
                if (!accepted) {
                  saveRulesAndGuidelinesProgress({ currentStep: prevStep, maxStepVisited, videoProgress, formAnswers }, true);
                }
              }}
              className="px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-[#0D1B2A] dark:text-white font-bold text-xs hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
              </svg>
              BACK
            </button>
          ) : (
            reviewMode ? (
              <button
                onClick={() => setReviewMode(false)}
                className="px-4 py-2.5 rounded-xl border border-red-500/20 dark:border-red-500/10 text-red-500 font-bold text-xs hover:bg-red-500/5 active:scale-95 transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                EXIT REVIEW
              </button>
            ) : <div />
          )}

          {/* <button
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.removeItem("xnite_rules_current_step");
                localStorage.removeItem("xnite_rules_max_step_visited");
                localStorage.removeItem("xnite_rules_video_progress");
                window.location.reload();
              }
            }}
            className="px-3 py-1.5 rounded-lg border border-red-500/30 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-bold text-[10px] tracking-wider uppercase active:scale-95 transition-all shrink-0 cursor-pointer flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Reset Progress
          </button> */}

          {(() => {
            if (currentStep === 1) {
              return (
                <button onClick={() => setCurrentStep(2)} disabled={!accepted && !isStep1Valid} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-xs shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  NEXT
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              );
            }
            if (currentStep === 8) {
              const isStep8VideoFinished = accepted === true || maxStepVisited > 8 || (videoProgress[TECH_VIDEO_ID] ?? 0) >= 98 || isDev;
              const isStep8PlayButtonShown = !accepted && !isStep8VideoFinished && !hasVideoStarted;
              const isStep8CountdownLocked = !accepted && !isStep8VideoFinished && hasVideoStarted && (countdownTimer > 0 || countdownTimer === -1);
              const isStep8CountdownDone = !accepted && !isStep8VideoFinished && hasVideoStarted && countdownTimer === 0;

              if (isStep8PlayButtonShown) {
                return (
                  <button type="button" onClick={() => { setHasVideoStarted(true); videoPlayerRef.current?.play(); }} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer">
                    Play Video
                  </button>
                );
              } else if (isStep8CountdownLocked) {
                return (
                  <button type="button" disabled className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] opacity-40 cursor-not-allowed text-white font-bold text-xs">
                    NEXT ({formatVideoCountdown(countdownTimer)})
                  </button>
                );
              } else if (isStep8CountdownDone) {
                return (
                  <button type="button" disabled className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F]/40 to-[#2ea82e]/40 opacity-40 cursor-not-allowed text-white font-bold text-xs">
                    Finish Video
                  </button>
                );
              }
            }

            const isNextDisabled = !accepted && (countdownTimer > 0 || (STEP_DATA[currentStep]?.answerKey && !fieldCorrect[STEP_DATA[currentStep].answerKey as keyof typeof fieldCorrect]));
            const label = (!accepted && countdownTimer > 0) ? `NEXT (${countdownTimer}s)` : "NEXT";

            const handleNext = () => {
              if (!accepted && currentStep === 3) { setIsDownloadModalOpen(true); return; }
              if (!accepted && currentStep === 5) { setIsGreenMaskDownloadOpen(true); return; }

              if (currentStep < 65) {
                const nextStep = currentStep + 1;
                setCurrentStep(nextStep);
                if (!accepted) {
                  const nextMax = Math.max(maxStepVisited, nextStep);
                  saveRulesAndGuidelinesProgress({ currentStep: nextStep, maxStepVisited: nextMax, videoProgress, formAnswers }, true);
                }
              }
            };

            if (currentStep === 65) {
              return (
                <button
                  onClick={accepted ? (reviewMode ? () => setReviewMode(false) : (onClose || (() => router.push("/project")))) : handleAccept}
                  disabled={!accepted && countdownTimer > 0}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-xs shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {(!accepted && countdownTimer > 0) ? `FINISH (${countdownTimer}s)` : (reviewMode ? "EXIT REVIEW" : "FINISH")}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              );
            }

            return (
              <button
                onClick={handleNext}
                disabled={isNextDisabled}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1F7A1F] to-[#2ea82e] dark:from-[#55f761] dark:to-[#3de34a] text-white dark:text-[#060D14] font-bold text-xs shadow-md shadow-[#1F7A1F]/20 dark:shadow-[#55f761]/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {label}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            );
          })()}

        </div>
      </div>

      <DownloadGuidelinesModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        onProceed={() => { setIsDownloadModalOpen(false); setCurrentStep(4); }}
        files={guidelineFiles}
      />

      <DownloadGuidelinesModal
        isOpen={isGreenMaskDownloadOpen}
        onClose={() => setIsGreenMaskDownloadOpen(false)}
        onProceed={() => { setIsGreenMaskDownloadOpen(false); setCurrentStep(6); }}
        files={greenMaskFiles}
      />

      <DownloadGuidelinesModal
        isOpen={isWorkAreaDownloadOpen}
        onClose={() => setIsWorkAreaDownloadOpen(false)}
        onProceed={() => { setIsWorkAreaDownloadOpen(false); setCurrentStep(8); }}
        files={finalWorkAreaFiles}
      />

      <DownloadGuidelinesModal
        isOpen={isBasicTechniquesDownloadOpen}
        onClose={() => setIsBasicTechniquesDownloadOpen(false)}
        onProceed={() => { setIsBasicTechniquesDownloadOpen(false); setCurrentStep(15); }}
        files={basicTechniquesFiles}
      />
      <DownloadGuidelinesModal isOpen={isAdditionalGuidelines1DownloadOpen} onClose={() => setIsAdditionalGuidelines1DownloadOpen(false)} onProceed={() => { setIsAdditionalGuidelines1DownloadOpen(false); setCurrentStep(20); }} files={additionalGuidelines1Files} />
      <DownloadGuidelinesModal isOpen={isIdentifyGroundsDownloadOpen} onClose={() => setIsIdentifyGroundsDownloadOpen(false)} onProceed={() => { setIsIdentifyGroundsDownloadOpen(false); setCurrentStep(30); }} files={identifyGroundsFiles} />
      <DownloadGuidelinesModal isOpen={isCommonErrorsDownloadOpen} onClose={() => setIsCommonErrorsDownloadOpen(false)} onProceed={() => { setIsCommonErrorsDownloadOpen(false); setCurrentStep(33); }} files={commonErrorsFiles} />
      <DownloadGuidelinesModal isOpen={isDontDoThisDownloadOpen} onClose={() => setIsDontDoThisDownloadOpen(false)} onProceed={() => { setIsDontDoThisDownloadOpen(false); setCurrentStep(47); }} files={dontDoThisFiles} />
      <DownloadGuidelinesModal isOpen={isHighQualityLabelingDownloadOpen} onClose={() => setIsHighQualityLabelingDownloadOpen(false)} onProceed={() => { setIsHighQualityLabelingDownloadOpen(false); setCurrentStep(62); }} files={highQualityLabelingFiles} />
      <DownloadGuidelinesModal isOpen={isAdditionalGuidelines2DownloadOpen} onClose={() => setIsAdditionalGuidelines2DownloadOpen(false)} onProceed={handleAccept} isPending={isPending} files={additionalGuidelines2Files} />
    </div>
  );
}

