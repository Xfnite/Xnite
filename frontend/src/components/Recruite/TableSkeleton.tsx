"use client";

interface TableSkeletonProps {
    showRecruiter?: boolean;
}

export default function TableSkeleton({ showRecruiter = false }: TableSkeletonProps) {
    return (
        <div className="w-full overflow-hidden animate-pulse">
            {/* Desktop Table Header Skeleton */}
            <div className="hidden md:flex border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-6 py-4 items-center justify-between">
                {showRecruiter ? (
                    <>
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/4"></div>
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/4"></div>
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/5"></div>
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/6"></div>
                    </>
                ) : (
                    <>
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/3"></div>
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/3"></div>
                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/4"></div>
                    </>
                )}
            </div>

            {/* Desktop Table Rows Skeleton */}
            <div className="hidden md:block divide-y divide-black/10 dark:divide-white/10">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="px-6 py-5 flex items-center justify-between">
                        {showRecruiter ? (
                            <>
                                {/* User Details Column */}
                                <div className="flex items-center gap-3 w-1/4">
                                    <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 shrink-0"></div>
                                    <div className="flex flex-col w-full">
                                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-3/4"></div>
                                    </div>
                                </div>
                                {/* Status/Progress Column */}
                                <div className="flex flex-col gap-3 w-1/4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between w-2/3">
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-8"></div>
                                        </div>
                                        <div className="w-2/3 bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <div className="h-full bg-black/10 dark:bg-white/10 rounded-full" style={{ width: "40%" }}></div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between w-2/3">
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-8"></div>
                                        </div>
                                        <div className="w-2/3 bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <div className="h-full bg-black/10 dark:bg-white/10 rounded-full" style={{ width: "25%" }}></div>
                                        </div>
                                    </div>
                                </div>
                                {/* Recruiter Column */}
                                <div className="flex flex-col gap-2 w-1/5">
                                    <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-2/3"></div>
                                    <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
                                </div>
                                {/* Joined Date Column */}
                                <div className="flex items-center gap-1.5 w-1/6">
                                    <div className="w-4 h-4 rounded bg-black/10 dark:bg-white/10"></div>
                                    <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-20"></div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* User Details Column */}
                                <div className="flex items-center gap-3 w-1/3">
                                    <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 shrink-0"></div>
                                    <div className="flex flex-col gap-2 w-full">
                                        <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-3/4"></div>
                                        <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
                                    </div>
                                </div>
                                {/* Status/Progress Column */}
                                <div className="flex flex-col gap-3 w-1/3">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between w-2/3">
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-8"></div>
                                        </div>
                                        <div className="w-2/3 bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <div className="h-full bg-black/10 dark:bg-white/10 rounded-full" style={{ width: "40%" }}></div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between w-2/3">
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/2"></div>
                                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-8"></div>
                                        </div>
                                        <div className="w-2/3 bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <div className="h-full bg-black/10 dark:bg-white/10 rounded-full" style={{ width: "25%" }}></div>
                                        </div>
                                    </div>
                                </div>
                                {/* Joined Date Column */}
                                <div className="flex items-center gap-1.5 w-1/4">
                                    <div className="w-4 h-4 rounded bg-black/10 dark:bg-white/10"></div>
                                    <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-20"></div>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* Mobile Cards Skeleton */}
            <div className="block md:hidden divide-y divide-black/10 dark:divide-white/10">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="p-4 space-y-4">
                        {/* User Details */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 shrink-0"></div>
                            {showRecruiter ? (
                                <div className="flex flex-col w-1/2">
                                    <div className="h-4 bg-black/10 dark:bg-white/10 rounded"></div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 w-1/2">
                                    <div className="h-4 bg-black/10 dark:bg-white/10 rounded"></div>
                                    <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-2/3"></div>
                                </div>
                            )}
                        </div>
                        {/* Progress bars */}
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/4"></div>
                                <div className="w-full bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                    <div className="h-full bg-black/10 dark:bg-white/10 rounded-full" style={{ width: "30%" }}></div>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/4"></div>
                                <div className="w-full bg-black/5 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                                    <div className="h-full bg-black/10 dark:bg-white/10 rounded-full" style={{ width: "20%" }}></div>
                                </div>
                            </div>
                        </div>
                        {/* Recruiter (conditional) */}
                        {showRecruiter && (
                            <div className="flex justify-between pt-1 border-t border-black/5 dark:border-white/5">
                                <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/6"></div>
                                <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/3"></div>
                            </div>
                        )}
                        {/* Joined Date */}
                        <div className="flex justify-between pt-1 border-t border-black/5 dark:border-white/5">
                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/6"></div>
                            <div className="h-3 bg-black/10 dark:bg-white/10 rounded w-1/4"></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
