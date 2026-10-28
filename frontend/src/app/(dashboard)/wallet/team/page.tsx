"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { getTeamSalariesAction, getAvailableTeamCutoffsAction } from "@/app/actions/wallet";
import { Users, ChevronDown, Filter, Search, Plus, Check, X } from "lucide-react";

interface HistoryRecord {
  id: string;
  amountPaid: number;
  payoutDate: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: string;
  transactionId: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  gingerUsername: string | null;
  role: string;
  type: string;
  currentEstimatedSalary: number;
  totalPaidOut: number;
  targetRawComputation?: Record<string, any> | string | null;
  payoutStatus?: string | null;
  formattedVals?: any;
}

export default function TeamSalariesPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [limit] = useState(20);

  // Cutoff Filter
  const [availableCutoffs, setAvailableCutoffs] = useState<string[]>([]);
  const [selectedCutoff, setSelectedCutoff] = useState<string>("");
  const [isCutoffDropdownOpen, setIsCutoffDropdownOpen] = useState(false);
  const cutoffDropdownRef = useRef<HTMLDivElement>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedFrom, setSelectedFrom] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (cutoffDropdownRef.current && !cutoffDropdownRef.current.contains(event.target as Node)) {
        setIsCutoffDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    async function loadCutoffs() {
      const res = await getAvailableTeamCutoffsAction();
      if (res.success && res.data) {
        setAvailableCutoffs(res.data);
        if (res.data.length > 0) {
          setSelectedCutoff(res.data[0]);
        }
      }
    }
    loadCutoffs();
  }, []);

  const toggleFromFilter = (from: string) => {
    setSelectedFrom(prev =>
      prev.includes(from) ? prev.filter(f => f !== from) : [...prev, from]
    );
  };

  const toggleRoleFilter = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to page 1 on search change
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1); // Reset to page 1 on filter change
  }, [selectedFrom, selectedRoles, selectedCutoff]);

  useEffect(() => {
    async function loadData() {
      if (!selectedCutoff) return;
      setIsLoading(true);
      try {
        const res = await getTeamSalariesAction({
          page,
          limit,
          searchQuery: debouncedSearch,
          selectedFrom,
          selectedRoles,
          cutoffFilter: selectedCutoff
        });
        if (res.success && res.data) {
          const processedMembers = res.data.map((member: any) => {
            let activeComputation: Record<string, any> = {};
            let isNoData = true;

            if (member.targetRawComputation) {
              try {
                activeComputation = typeof member.targetRawComputation === 'string'
                  ? JSON.parse(member.targetRawComputation)
                  : member.targetRawComputation;
                isNoData = false;
              } catch (e) { }
            }

            const mappedValues = { hour: 0, benchmark: 0, raw: 0, filter: 0, referral: 0, platform: 0, processing: 0, unclaimed: 0, final: 0 };
            if (!isNoData && activeComputation) {
              for (const [key, val] of Object.entries(activeComputation)) {
                if (typeof key !== 'string') continue;
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes("hour")) mappedValues.hour = val;
                else if (lowerKey.includes("benchmark")) mappedValues.benchmark = val;
                else if (lowerKey.includes("raw")) mappedValues.raw = val;
                else if (lowerKey.includes("filter")) mappedValues.filter = val;
                else if (lowerKey.includes("referral fee")) mappedValues.referral = val;
                else if (lowerKey.includes("platform")) mappedValues.platform = val;
                else if (lowerKey.includes("processing")) mappedValues.processing = val;
                else if (lowerKey.includes("unclaimed")) mappedValues.unclaimed = val;
                else if (lowerKey.includes("final")) mappedValues.final = val;
              }
            }

            const formatVal = (val: any, asCurrency = true) => {
              if (isNoData) return asCurrency ? "₱0.00" : "0.00";
              if (typeof val === 'number') {
                return asCurrency
                  ? `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              }
              return val || (asCurrency ? "₱0.00" : "0.00");
            };

            return {
              ...member,
              formattedVals: {
                hour: formatVal(mappedValues.hour, false),
                benchmark: formatVal(mappedValues.benchmark),
                raw: formatVal(mappedValues.raw),
                filter: formatVal(mappedValues.filter),
                referral: formatVal(mappedValues.referral),
                platform: formatVal(mappedValues.platform),
                processing: formatVal(mappedValues.processing),
                unclaimed: formatVal(mappedValues.unclaimed),
                final: formatVal(mappedValues.final),
              }
            };
          });
          setMembers(processedMembers);
          setTotalPages(res.totalPages || 0);
          setTotalItems(res.totalItems || 0);
          setCurrentUserRole(res.currentUserRole || "");
        } else {
          toast.error(res.error || "Failed to load team payout");
        }
      } catch (err) {
        toast.error("An error occurred");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [page, limit, debouncedSearch, selectedFrom, selectedRoles, selectedCutoff]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0D1B2A] dark:text-white">Team Payout</h2>
          <p className="text-sm text-[#2F3E46]/70 dark:text-white/60">
            View current estimated salaries and payout history of your team members.
          </p>
        </div>
      </div>

      {/* Control Bar: Search, Add Filter Popover, Chips */}
      <div className="bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Cutoff Filter */}
            <div className="relative shrink-0" ref={cutoffDropdownRef}>
              <button
                onClick={() => setIsCutoffDropdownOpen(!isCutoffDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20 hover:bg-blue-500/15 dark:hover:bg-blue-400/15 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] hover:cursor-pointer select-none"
              >
                <span>{selectedCutoff || "Loading..."}</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isCutoffDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {isCutoffDropdownOpen && (
                <div className="absolute left-0 mt-2 z-40 w-64 bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl py-2 animate-in fade-in slide-in-from-top-2 duration-200 max-h-64 overflow-y-auto">
                  {availableCutoffs.map(cutoff => (
                    <button
                      key={cutoff}
                      onClick={() => { setSelectedCutoff(cutoff); setIsCutoffDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${selectedCutoff === cutoff ? "text-blue-600 dark:text-blue-400" : "text-[#2F3E46] dark:text-white/80"}`}
                    >
                      {cutoff}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Add Filter Button & Dropdown Popover */}
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 hover:bg-[#1F7A1F]/15 dark:hover:bg-[#55f761]/15 text-[#1F7A1F] dark:text-[#55f761] rounded-xl text-xs font-bold transition-all hover:scale-[1.02] hover:cursor-pointer select-none"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Filter</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isFilterDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isFilterDropdownOpen && (
                <div className="absolute left-0 mt-2 z-30 w-72 md:w-[600px] bg-white dark:bg-[#0D1B2A] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(currentUserRole === "judger" || currentUserRole === "admin") && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">From</h4>
                          <div className="flex flex-wrap gap-2">
                            {["Recruit", "GS"].map((f) => (
                              <button
                                key={`from_${f}`}
                                onClick={() => toggleFromFilter(f)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedFrom.includes(f)
                                  ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                  : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                  }`}
                              >
                                {selectedFrom.includes(f) && <Check className="w-3 h-3" />}
                                <span>{f === "Recruit" ? "Recruits Only" : "GS Only"}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-[#2F3E46]/60 dark:text-white/40 uppercase tracking-wider">Role</h4>
                        <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto scrollbar-thin pr-1">
                          {["applicant", "labeler", "checker", "recruiter", "judger", "admin"].map((r) => (
                            <button
                              key={`role_${r}`}
                              onClick={() => toggleRoleFilter(r)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:cursor-pointer ${selectedRoles.includes(r)
                                ? "bg-[#1F7A1F]/10 border-[#1F7A1F] text-[#1F7A1F] dark:bg-[#55f761]/10 dark:border-[#55f761] dark:text-[#55f761]"
                                : "bg-black/5 border-transparent text-[#2F3E46] dark:bg-white/5 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/10"
                                }`}
                            >
                              {selectedRoles.includes(r) && <Check className="w-3 h-3" />}
                              <span className="capitalize">{r}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedFrom.map((f) => (
                <div key={f} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                  <span>From: {f === "Recruit" ? "Recruits" : "GS"}</span>
                  <button onClick={() => toggleFromFilter(f)} className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {selectedRoles.map((r) => (
                <div key={r} className="flex items-center gap-1.5 bg-[#1F7A1F]/10 dark:bg-[#55f761]/10 border border-[#1F7A1F]/20 dark:border-[#55f761]/20 text-[#1F7A1F] dark:text-[#55f761] text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all">
                  <span className="capitalize">Role: {r}</span>
                  <button onClick={() => toggleRoleFilter(r)} className="hover:bg-[#1F7A1F]/20 dark:hover:bg-[#55f761]/20 rounded-full p-0.5 transition-colors hover:cursor-pointer shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative w-full sm:max-w-xs shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2F3E46]/50 dark:text-white/40" />
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-[#1F7A1F] dark:focus:ring-[#55f761] transition-shadow text-[#0D1B2A] dark:text-white placeholder:text-[#2F3E46]/40 dark:placeholder:text-white/30"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#1F7A1F] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white/40 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-2xl p-8 text-center backdrop-blur-md">
          <Users className="w-12 h-12 mx-auto text-black/20 dark:text-white/20 mb-3" />
          <p className="text-[#2F3E46]/60 dark:text-white/40 font-medium">No team members found.</p>
        </div>
      ) : (
        <div className="relative z-10 bg-white dark:bg-[#121B22] border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-black/5 dark:bg-white/5 text-[10px] uppercase font-bold text-[#2F3E46]/70 dark:text-white/60 border-b border-black/10 dark:border-white/10 whitespace-nowrap">
                <tr>
                  <th className="px-4 py-3">Name / Username</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Benchmark</th>
                  <th className="px-4 py-3">Raw</th>
                  <th className="px-4 py-3">Filter</th>
                  <th className="px-4 py-3 text-emerald-600 dark:text-emerald-400">Referral Fee</th>
                  <th className="px-4 py-3 text-red-600 dark:text-red-400">Platform Fee</th>
                  <th className="px-4 py-3 text-red-600 dark:text-red-400">Processing Fee</th>
                  <th className="px-4 py-3">Unclaimed</th>
                  <th className="px-4 py-3 text-[#1F7A1F] dark:text-[#55f761]">Final Payment</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5 whitespace-nowrap">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#0D1B2A] dark:text-white text-xs">
                        {member.name || "Unknown"}
                      </div>
                      <div className="text-[10px] text-[#2F3E46]/60 dark:text-white/40">
                        {member.gingerUsername || member.email.split('@')[0]}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#2F3E46] dark:text-white/80">{member.formattedVals?.hour}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#2F3E46] dark:text-white/80">{member.formattedVals?.benchmark}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#2F3E46] dark:text-white/80">{member.formattedVals?.raw}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#2F3E46] dark:text-white/80">{member.formattedVals?.filter}</td>
                    <td className="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">{member.formattedVals?.referral}</td>
                    <td className="px-4 py-3 text-xs font-bold text-red-600 dark:text-red-400">{member.formattedVals?.platform}</td>
                    <td className="px-4 py-3 text-xs font-bold text-red-600 dark:text-red-400">{member.formattedVals?.processing}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#2F3E46] dark:text-white/80">{member.formattedVals?.unclaimed}</td>
                    <td className="px-4 py-3 text-sm font-black text-[#1F7A1F] dark:text-[#55f761]">{member.formattedVals?.final}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#2F3E46] dark:text-white/80">
                      {/* Long statuses are cut with an ellipsis; the full text shows on hover */}
                      <div className="max-w-[120px] truncate" title={member.payoutStatus || undefined}>
                        {member.payoutStatus || "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between bg-black/5 dark:bg-white/5">
              <span className="text-xs font-medium text-[#2F3E46]/70 dark:text-white/60">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalItems)} of {totalItems} entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || isLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-black/10 dark:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-[#0D1B2A] dark:text-white"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1 px-2">
                  <span className="text-sm font-bold text-[#1F7A1F] dark:text-[#55f761]">{page}</span>
                  <span className="text-xs text-[#2F3E46]/60 dark:text-white/40">/ {totalPages}</span>
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || isLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-black/10 dark:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-[#0D1B2A] dark:text-white"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
