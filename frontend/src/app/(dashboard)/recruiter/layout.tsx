"use client";

import SidebarRecruite from "@/components/Recruite/SideBarRecruite";

export default function ProjectLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex gap-6 h-full w-full overflow-hidden">

            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute bg-[#55f761] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
                    style={{ width: "40vw", height: "40vw", top: "-10%", left: "-10%" }}
                ></div>
                <div
                    className="absolute bg-[#1F7A1F] filter blur-[100px] rounded-full opacity-30 dark:opacity-15"
                    style={{ width: "50vw", height: "50vw", top: "40%", right: "-20%" }}
                ></div>
            </div>

            <SidebarRecruite />
            <div className="flex-1 overflow-y-auto pr-1">
                {children}
            </div>
        </div>
    );
}
