"use client";

import dynamic from "next/dynamic";
import TableSkeleton from "./TableSkeleton";

interface SystemUser {
    id: string;
    name: string;
    email: string;
    status: string;
    role?: string;
    createdAt: Date;
    isRegistered: boolean;
    hasCompletedPreCourse: boolean;
    isDashboardCompleted: boolean;
    lastLogin: Date | null;
    refererEmail: string | null;
    referer?: {
        name: string | null;
    } | null;
    onboardingProgress: any;
    isRulesAndGuidelinesCompleted: boolean;
    onRulesAndGuidelinesProgress: any;
    facebook?: string | null;
    phone?: string | null;
    gingerUsername?: string | null;
    trainings?: any[];
}

interface WorkLog {
    id: number;
    ownerName: string;
    projectId: number;
    role: string;
    worktime: number;
    taskNum: number;
    features: number;
}

interface RecruitsTableProps {
    users: SystemUser[];
    showRecruiter?: boolean;
    currentUserRole?: string;
    workLogs?: WorkLog[];
    isLoadingWorkLogs?: boolean;
    selectedWorkLogProjectIds?: number[];
    selectedWorkLogRoles?: string[];
    globalProjectSummaries?: { projectId: number; role: string; overallSpeed: number; overallMinPerTask: number }[];
}

const RecruitsTableContent = dynamic<RecruitsTableProps>(() => import("./RecruitsTableContent"), {
    loading: () => <TableSkeleton showRecruiter={false} />,
    ssr: false
});

export default function RecruitsTable(props: RecruitsTableProps) {
    return <RecruitsTableContent {...props} />;
}
