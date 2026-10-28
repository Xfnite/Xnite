"use client";

import SidebarProject from "@/components/Project/SidebarProject";

export default function ProjectLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex gap-6 h-full w-full overflow-hidden">
            <SidebarProject />
            <div className="flex-1 overflow-y-auto pr-1">
                {children}
            </div>
        </div>
    );
}
