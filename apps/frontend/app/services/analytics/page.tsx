"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import { 
  Coins, 
  Activity, 
  Sparkles, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Database, 
  FileText, 
  Compass, 
  Brain,
  ArrowDownToLine,
  ArrowUpFromLine,
  Layers
} from "lucide-react";
import Sidebar from "../../components/dashboard/Sidebar";
import Navbar from "../../components/dashboard/Navbar";
import LoadingScreen from "../../components/LoadingScreen";

// Helper to get backend URL dynamically
const getApiUrl = (path: string) => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://localhost:8000${path}`;
    }
  }
  return path;
};

// Interface definitions
interface ModalityMetrics {
  standard_input: number;
  cached_input: number;
  output?: number;
  cost_usd: number;
}

interface OrgOverview {
  total_sessions: number;
  total_cost_usd: number;
  total_tokens: number;
  total_savings_usd: number;
  breakdown: {
    text: ModalityMetrics;
    audio: ModalityMetrics;
    image: ModalityMetrics;
  };
}

interface SessionMetrics {
  text: {
    standard_input: number;
    cached_input: number;
    output: number;
    cost: number;
  };
  audio: {
    standard_input: number;
    cached_input: number;
    output: number;
    cost: number;
  };
  image: {
    standard_input: number;
    cached_input: number;
    cost: number;
  };
  total_tokens: number;
  total_cost: number;
  caching_savings: number;
}

interface TokenSession {
  session_id: string;
  candidate_name: string;
  interview_mode: string;
  created_at: string;
  metrics: SessionMetrics;
}

export default function TokenAnalyticsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  // Token Metrics States
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [sessions, setSessions] = useState<TokenSession[]>([]);

  // Search & Pagination States
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  // 1. Authenticate user & verify Admin/Founder/Manager privilege
  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/signin");
          return;
        }

        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("roles(name)")
          .eq("user_id", session.user.id)
          .single();

        const roleName = (userRoles as any)?.roles?.name || "New Lead";
        if (roleName === "Admin" || roleName === "Founder" || roleName === "Program Manager") {
          setAuthorized(true);
          await fetchTokenAnalytics();
        } else {
          alert("Access Denied: Token Cost Analytics is restricted to administrators and managers.");
          router.push("/");
        }
      } catch (err) {
        console.error("Access verification error:", err);
        router.push("/");
      } finally {
        setRoleLoading(false);
      }
    };
    verifyAccess();
  }, []);

  const fetchTokenAnalytics = async () => {
    setDataLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/v1/interview/analytics/tokens"));
      if (response.ok) {
        const data = await response.json();
        setOverview(data.org_overview);
        setSessions(data.sessions);
      } else {
        console.error("Failed to fetch token analytics data");
      }
    } catch (err) {
      console.warn("Failed to load backend token analytics:", err);
    } finally {
      setDataLoading(false);
    }
  };

  // Filter sessions based on search query (name/mode)
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        s.candidate_name.toLowerCase().includes(query) ||
        s.interview_mode.toLowerCase().includes(query)
      );
    });
  }, [sessions, searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredSessions.length / itemsPerPage);
  const paginatedSessions = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredSessions.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredSessions, currentPage]);

  // Reset page number on search query change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (roleLoading) {
    return <LoadingScreen message="Verifying administrative credentials..." />;
  }

  if (!authorized) {
    return null;
  }

  return (
    <div className="h-screen max-h-screen bg-transparent text-[#2C3454] overflow-hidden">
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25]"></div>
      
      <div className="relative w-full flex h-screen max-h-screen overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onClose={() => setSidebarCollapsed(true)} />

        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <Navbar onToggle={() => setSidebarCollapsed((prev) => !prev)} />

          <motion.main
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="flex-1 overflow-y-auto px-4 py-8 md:px-8"
          >
            <div className="space-y-8 pb-16">
              
              {/* Header Title Section */}
              <section className="space-y-2">
                <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#00917C]">
                  Enterprise Resources
                </p>
                <h1 className="text-4xl font-extrabold tracking-tight text-[#150E56]">
                  GPT Realtime Cost Center
                </h1>
                <p className="text-sm text-[#5C6485] leading-relaxed max-w-3xl">
                  Organizational analytics dashboard mapping token bandwidth and API execution costs of the GPT Realtime voice model. Values display standard inputs, prompt cache hits, outputs, and financial metrics in US Dollars.
                </p>
              </section>

              {dataLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <Activity className="h-10 w-10 animate-spin text-[#00917C]" />
                  <p className="text-xs uppercase tracking-widest text-[#5C6485] font-bold animate-pulse">
                    Computing organizational tokens usage data...
                  </p>
                </div>
              ) : overview ? (
                <>
                  {/* Aggregated Overview Cards */}
                  <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    
                    {/* Cost Card - glow emphasis */}
                    <div className="rounded-[2.25rem] border border-emerald-200/50 bg-[#ECFDF5]/80 backdrop-blur-md p-6 shadow-clay shadow-emerald-500/5 hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-emerald-500/5 blur-xl"></div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.25em] text-emerald-800 font-extrabold">Total Org Spend</p>
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.02)]">
                          <Coins className="h-5 w-5" />
                        </div>
                      </div>
                      <p className="mt-6 text-4xl font-black text-emerald-950">${overview.total_cost_usd.toFixed(2)}</p>
                      <p className="mt-3 text-xs leading-relaxed text-emerald-800/80">Aggregated organizational charges on GPT Realtime engines.</p>
                    </div>

                    <div className="rounded-[2.25rem] border border-white bg-white/70 backdrop-blur-md p-6 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-[#150E56]/5 blur-xl"></div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.25em] text-[#5C6485] font-bold">Total Sessions</p>
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/10">
                          <Activity className="h-5 w-5" />
                        </div>
                      </div>
                      <p className="mt-6 text-4xl font-black text-[#150E56]">{overview.total_sessions}</p>
                      <p className="mt-3 text-xs leading-relaxed text-[#5C6485]">Total registered Pathway and NeuroAI Prep interactions.</p>
                    </div>

                    <div className="rounded-[2.25rem] border border-white bg-white/70 backdrop-blur-md p-6 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-[#150E56]/5 blur-xl"></div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.25em] text-[#5C6485] font-bold">Total Token Bandwidth</p>
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/10">
                          <Database className="h-5 w-5" />
                        </div>
                      </div>
                      <p className="mt-6 text-4xl font-black text-[#150E56]">{(overview.total_tokens / 1000000).toFixed(2)}M</p>
                      <p className="mt-3 text-xs leading-relaxed text-[#5C6485]">Combined text, audio, and image tokens processed.</p>
                    </div>

                    <div className="rounded-[2.25rem] border border-purple-200/50 bg-[#FDF8FF]/80 backdrop-blur-md p-6 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-purple-500/5 blur-xl"></div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.25em] text-purple-800 font-extrabold">Prompt Cache Savings</p>
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 border border-purple-500/20">
                          <Sparkles className="h-5 w-5" />
                        </div>
                      </div>
                      <p className="mt-6 text-4xl font-black text-purple-950">${overview.total_savings_usd.toFixed(2)}</p>
                      <p className="mt-3 text-xs leading-relaxed text-purple-800/80">Dollars saved due to automated cached prefix matching.</p>
                    </div>

                  </section>

                  {/* Cost Breakdown by Modality Cards */}
                  <section className="grid gap-6 lg:grid-cols-3">
                    
                    {/* Text Modality Details */}
                    <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md space-y-6">
                      <div className="flex items-center justify-between border-b border-[#150E56]/10 pb-4">
                        <div>
                          <p className="text-xs uppercase font-bold tracking-wider text-[#5C6485]">Modality</p>
                          <h3 className="text-xl font-black text-[#150E56] mt-0.5">Text Processing</h3>
                        </div>
                        <span className="rounded-full bg-[#00917C]/10 border border-[#00917C]/15 px-3 py-1 text-xs font-bold text-[#00917C]">
                          ${overview.breakdown.text.cost_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <ArrowDownToLine className="h-3.5 w-3.5 text-[#00917C]" /> Standard Input ($4.00/1M)
                          </span>
                          <strong className="text-[#150E56]">
                            {overview.breakdown.text.standard_input.toLocaleString()}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Cached Input ($0.40/1M)
                          </span>
                          <strong className="text-purple-700">
                            {overview.breakdown.text.cached_input.toLocaleString()}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <ArrowUpFromLine className="h-3.5 w-3.5 text-[#150E56]" /> Text Output ($16.00/1M)
                          </span>
                          <strong className="text-[#150E56]">
                            {overview.breakdown.text.output?.toLocaleString()}
                          </strong>
                        </div>
                        <div className="pt-2 border-t border-[#150E56]/5 flex items-center justify-between text-xs text-[#5C6485]">
                          <span>Modality Ratio:</span>
                          <span className="font-extrabold text-[#150E56]">
                            {(( (overview.breakdown.text.standard_input + overview.breakdown.text.cached_input + (overview.breakdown.text.output || 0)) / overview.total_tokens) * 100).toFixed(0)}% of bandwidth
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Audio Modality Details */}
                    <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md space-y-6">
                      <div className="flex items-center justify-between border-b border-[#150E56]/10 pb-4">
                        <div>
                          <p className="text-xs uppercase font-bold tracking-wider text-[#5C6485]">Modality</p>
                          <h3 className="text-xl font-black text-[#150E56] mt-0.5">Audio/Speech Live</h3>
                        </div>
                        <span className="rounded-full bg-[#00917C]/10 border border-[#00917C]/15 px-3 py-1 text-xs font-bold text-[#00917C]">
                          ${overview.breakdown.audio.cost_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <ArrowDownToLine className="h-3.5 w-3.5 text-[#00917C]" /> Standard Input ($32.00/1M)
                          </span>
                          <strong className="text-[#150E56]">
                            {overview.breakdown.audio.standard_input.toLocaleString()}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Cached Input ($0.40/1M)
                          </span>
                          <strong className="text-purple-700">
                            {overview.breakdown.audio.cached_input.toLocaleString()}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <ArrowUpFromLine className="h-3.5 w-3.5 text-[#150E56]" /> Speech Output ($64.00/1M)
                          </span>
                          <strong className="text-[#150E56]">
                            {overview.breakdown.audio.output?.toLocaleString()}
                          </strong>
                        </div>
                        <div className="pt-2 border-t border-[#150E56]/5 flex items-center justify-between text-xs text-[#5C6485]">
                          <span>Modality Ratio:</span>
                          <span className="font-extrabold text-[#150E56]">
                            {(( (overview.breakdown.audio.standard_input + overview.breakdown.audio.cached_input + (overview.breakdown.audio.output || 0)) / overview.total_tokens) * 100).toFixed(0)}% of bandwidth
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Image Modality Details */}
                    <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md space-y-6">
                      <div className="flex items-center justify-between border-b border-[#150E56]/10 pb-4">
                        <div>
                          <p className="text-xs uppercase font-bold tracking-wider text-[#5C6485]">Modality</p>
                          <h3 className="text-xl font-black text-[#150E56] mt-0.5">Image Processing</h3>
                        </div>
                        <span className="rounded-full bg-[#00917C]/10 border border-[#00917C]/15 px-3 py-1 text-xs font-bold text-[#00917C]">
                          ${overview.breakdown.image.cost_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <ArrowDownToLine className="h-3.5 w-3.5 text-[#00917C]" /> Standard Input ($5.00/1M)
                          </span>
                          <strong className="text-[#150E56]">
                            {overview.breakdown.image.standard_input.toLocaleString()}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#5C6485] font-semibold flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Cached Input ($0.50/1M)
                          </span>
                          <strong className="text-purple-700">
                            {overview.breakdown.image.cached_input.toLocaleString()}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between h-4.5">
                          <span className="text-[#5C6485]/50 font-semibold italic flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5" /> Image Outputs (N/A)
                          </span>
                          <strong className="text-[#150E56]/30">--</strong>
                        </div>
                        <div className="pt-2 border-t border-[#150E56]/5 flex items-center justify-between text-xs text-[#5C6485]">
                          <span>Modality Ratio:</span>
                          <span className="font-extrabold text-[#150E56]">
                            {(( (overview.breakdown.image.standard_input + overview.breakdown.image.cached_input) / overview.total_tokens) * 100).toFixed(0)}% of bandwidth
                          </span>
                        </div>
                      </div>
                    </div>

                  </section>

                  {/* Session-by-Session Table Section */}
                  <section className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md space-y-6">
                    
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase font-bold tracking-[0.2em] text-[#00917C]">Individual Audit</p>
                        <h2 className="text-2xl font-extrabold text-[#150E56] mt-1">Sessions Bandwidth Log</h2>
                      </div>
                      
                      {/* Search Input */}
                      <div className="relative w-full sm:max-w-xs">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search candidate name or mode..."
                          className="w-full bg-[#FFF6F0]/40 border border-[#150E56]/10 focus:border-[#00917C] rounded-2xl pl-10 pr-4 py-2.5 text-xs text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                        />
                        <Search className="absolute left-3.5 top-3.5 h-3.5 w-3.5 text-[#5C6485]" />
                      </div>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/20 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#150E56]/10 bg-[#FFF6F0]/40 text-[10px] uppercase font-bold tracking-wider text-[#5C6485]">
                            <th className="p-4 font-bold">Session Date</th>
                            <th className="p-4 font-bold">Candidate Name</th>
                            <th className="p-4 font-bold">Interview Track / Mode</th>
                            <th className="p-4 font-bold text-right">Text Cost ($)</th>
                            <th className="p-4 font-bold text-right">Audio Cost ($)</th>
                            <th className="p-4 font-bold text-right">Image Cost ($)</th>
                            <th className="p-4 font-bold text-right">Total Tokens</th>
                            <th className="p-4 font-bold text-right">Total Cost ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#150E56]/5 text-xs">
                          {paginatedSessions.length > 0 ? (
                            paginatedSessions.map((session) => (
                              <tr key={session.session_id} className="text-[#2C3454] hover:bg-[#FFF6F0]/40 transition duration-200">
                                <td className="p-4 font-semibold whitespace-nowrap">
                                  {new Date(session.created_at).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric"
                                  })}
                                </td>
                                <td className="p-4 font-extrabold text-[#150E56]">
                                  {session.candidate_name}
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-1.5">
                                    {session.interview_mode.toLowerCase().includes("pathway") ? (
                                      <Compass className="h-3.5 w-3.5 text-[#00917C]" />
                                    ) : (
                                      <Brain className="h-3.5 w-3.5 text-purple-600" />
                                    )}
                                    <span className="font-semibold">{session.interview_mode}</span>
                                  </div>
                                </td>
                                <td className="p-4 text-right font-semibold text-[#5C6485]">
                                  ${session.metrics.text.cost.toFixed(2)}
                                </td>
                                <td className="p-4 text-right font-semibold text-[#5C6485]">
                                  ${session.metrics.audio.cost.toFixed(2)}
                                </td>
                                <td className="p-4 text-right font-semibold text-[#5C6485]">
                                  ${session.metrics.image.cost.toFixed(2)}
                                </td>
                                <td className="p-4 text-right font-semibold">
                                  {session.metrics.total_tokens.toLocaleString()}
                                </td>
                                <td className="p-4 text-right font-black text-[#150E56]">
                                  ${session.metrics.total_cost.toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={8} className="p-12 text-center text-[#5C6485] font-semibold italic">
                                No session analytics records found matching search query.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination footer */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-[#150E56]/5">
                        <p className="text-xs text-[#5C6485] font-semibold">
                          Showing Page <strong className="text-[#150E56]">{currentPage}</strong> of <strong className="text-[#150E56]">{totalPages}</strong>
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#150E56]/10 bg-white text-[#150E56] hover:bg-[#FFF6F0]/80 disabled:opacity-40 disabled:hover:bg-white transition shadow-clayBtn cursor-pointer"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#150E56]/10 bg-white text-[#150E56] hover:bg-[#FFF6F0]/80 disabled:opacity-40 disabled:hover:bg-white transition shadow-clayBtn cursor-pointer"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}

                  </section>
                </>
              ) : (
                <div className="p-12 border border-[#150E56]/5 rounded-[2.25rem] text-center bg-[#FFF6F0]/40 text-[#5C6485]">
                  <p className="text-sm font-semibold">Unable to fetch token analytics data from server.</p>
                  <p className="text-xs mt-1">Please ensure the backend service is operational and try refreshing the page.</p>
                </div>
              )}

            </div>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
