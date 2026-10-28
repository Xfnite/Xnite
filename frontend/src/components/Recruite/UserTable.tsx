"use client";

import dynamic from "next/dynamic";
import TableSkeleton from "./TableSkeleton";

interface SystemUser {
    id: string;
    name: string;
    email: string;
    status: string;
    createdAt: Date;
    isRegistered: boolean;
    hasCompletedPreCourse: boolean;
    isDashboardCompleted: boolean;
    lastLogin: Date | null;
    refererEmail: string | null;
    onboardingProgress: any;
    isRulesAndGuidelinesCompleted: boolean;
    onRulesAndGuidelinesProgress: any;
    facebook?: string | null;
    trainings?: any[];
    groupOrTeamName?: string | null;
}

interface Recruiter {
    email: string;
    name: string | null;
    username?: string | null;
}

interface UserTableProps {
    users: SystemUser[];
    recruiters: Recruiter[];
    hasMore?: boolean;
    onLoadMore?: () => void;
    isFetchingMore?: boolean;
    currentUserRole?: string;
    fetchAllMatchingUsers?: () => Promise<SystemUser[]>;
    onUserActivated?: (userId: string) => void;
}

const UserTableContent = dynamic<UserTableProps>(() => import("./UserTableContent"), {
    loading: () => <TableSkeleton showRecruiter={true} />,
    ssr: false
});

export default UserTableContent;
