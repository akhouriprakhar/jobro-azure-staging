"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import LoadingScreen from "../../components/LoadingScreen";
import Sidebar from "../../components/dashboard/Sidebar";
import Navbar from "../../components/dashboard/Navbar";

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
interface Candidate {
  id: string;
  name: string;
  type: string;
  recommended_pathway: string;
  confidence: string;
  status: string;
  tags: string[];
}

interface Overview {
  total_interviews: number;
  candidates_routed: number;
  require_review: number;
  corporate_leads: number;
  caregiver_leads: number;
  high_potential_candidates: number;
  neuroai_prep_sessions?: number;
  pathway_discovery_sessions?: number;
}

interface CandidateReport {
  summary: {
    age_group: string;
    education: string;
    location: string;
    current_status: string;
    experience: string;
    primary_goal: string;
    challenges: string[];
    suggested_support: string[];
  };
  recommendation: {
    primary_pathway: string;
    secondary_pathway: string;
    priority: string;
    founder_attention: boolean;
  };
  highlights: {
    strengths: string[];
    concerns: string[];
  };
  skill_map: {
    communication: number;
    technical_skill: number;
    portfolio: number;
    job_readiness: number;
    confidence: number;
  };
  timeline: { time: string; topic: string }[];
  tags: string[];
  recording_url?: string;
  messages?: { role: string; content: string }[];
  detailed_feedback?: string;
  alert?: {
    alert_type: string;
    alert_message: string;
  } | null;
}

interface Analytics {
  demand_trends: { name: string; value: number }[];
  common_challenges: { rank: number; challenge: string; percentage: number }[];
}

export default function InterviewIntelligencePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  // Data states
  const [overview, setOverview] = useState<Overview>({
    total_interviews: 0,
    candidates_routed: 0,
    require_review: 0,
    corporate_leads: 0,
    caregiver_leads: 0,
    high_potential_candidates: 0,
    neuroai_prep_sessions: 0,
    pathway_discovery_sessions: 0
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({
    demand_trends: [],
    common_challenges: []
  });

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Detail Drawer states
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [report, setReport] = useState<CandidateReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [jumpAlert, setJumpAlert] = useState<string | null>(null);
  const [neuroHistory, setNeuroHistory] = useState<any[]>([]);
  const [neuroHistoryLoading, setNeuroHistoryLoading] = useState(false);
  const [selectedNeuroReport, setSelectedNeuroReport] = useState<any | null>(null);

  // 1. Authenticate user & verify Founder/Admin privilege
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
          fetchDashboardData();
        } else {
          alert("Access Denied: Founder Intelligence is restricted to administrators and managers.");
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

  const fetchDashboardData = async () => {
    try {
      const [overviewRes, candidatesRes, analyticsRes] = await Promise.all([
        fetch(getApiUrl("/api/v1/interview/intelligence/overview")),
        fetch(getApiUrl("/api/v1/interview/intelligence/candidates")),
        fetch(getApiUrl("/api/v1/interview/intelligence/analytics"))
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (candidatesRes.ok) setCandidates(await candidatesRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch (err) {
      console.warn("Failed to load backend founder data, relying on fallbacks:", err);
    }
  };

  const handleCandidateClick = async (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setReportLoading(true);
    setReport(null);
    setNeuroHistory([]);
    setNeuroHistoryLoading(true);

    try {
      const res = await fetch(getApiUrl(`/api/v1/interview/intelligence/report/${candidateId}`));
      if (res.ok) {
        setReport(await res.json());
      } else {
        console.warn("Failed to retrieve candidate report details");
      }
    } catch (err) {
      console.error("Error loading candidate insights:", err);
    } finally {
      setReportLoading(false);
    }

    try {
      const historyRes = await fetch(getApiUrl(`/api/v1/interview/history/${candidateId}`));
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        const filtered = historyData.filter((item: any) =>
          item.interview_mode && item.interview_mode.startsWith("NeuroAI Prep:")
        );
        setNeuroHistory(filtered);
      }
    } catch (err) {
      console.error("Error loading candidate NeuroAI history:", err);
    } finally {
      setNeuroHistoryLoading(false);
    }
  };

  const formatFeedbackMarkdown = (text: string): string => {
    let html = text.replace(/\r/g, "") + "\n";
    html = html.replace(/^# (.*?)\n/gm, '<h1 class="text-xl font-black text-[#150E56] mt-5 mb-3 border-b border-[#150E56]/10 pb-1">$1</h1>');
    html = html.replace(/^## (.*?)\n/gm, '<h2 class="text-lg font-bold text-[#150E56] mt-4 mb-2">$1</h2>');
    html = html.replace(/^### (.*?)\n/gm, '<h3 class="text-base font-bold text-[#150E56] mt-4 mb-2">$1</h3>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-[#150E56]">$1</strong>');
    html = html.replace(/^[-*]\s+(.*?)\n/gm, '<li class="ml-4 list-disc text-sm text-[#2C3454] my-1">$1</li>');
    html = html.replace(/^\d+\.\s+(.*?)\n/gm, '<li class="ml-4 list-decimal text-sm text-[#2C3454] my-1">$1</li>');
    html = html.replace(/\n\n/g, '<br/>');
    return html;
  };

  const handleTimelineJump = (time: string, topic: string) => {
    setJumpAlert(`Timeline Jump: Navigating directly to audio marker ${time} (${topic})`);
    setTimeout(() => setJumpAlert(null), 3000);
  };

  // Filter candidates based on search query (name/tag) or selected tag
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesTag = selectedTag ? c.tags.includes(selectedTag) : true;
      const cleanQuery = searchQuery.trim().toLowerCase();
      if (!cleanQuery) return matchesTag;

      const matchesName = c.name.toLowerCase().includes(cleanQuery);
      const matchesPathway = c.recommended_pathway.toLowerCase().includes(cleanQuery);
      const matchesStatus = c.status.toLowerCase().includes(cleanQuery);
      const matchesTags = c.tags.some((t) => t.toLowerCase().includes(cleanQuery));

      return matchesTag && (matchesName || matchesPathway || matchesStatus || matchesTags);
    });
  }, [candidates, searchQuery, selectedTag]);

  // Extract all distinct tags from candidates to render a tag bubble filter
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    candidates.forEach((c) => c.tags.forEach((t) => tagsSet.add(t)));
    return Array.from(tagsSet);
  }, [candidates]);

  const parsedFeedback = useMemo(() => {
    if (!report || !report.detailed_feedback) return null;
    try {
      return JSON.parse(report.detailed_feedback);
    } catch (e) {
      return null;
    }
  }, [report]);

  // Radar chart constants & calculators
  const radarCenter = 100;
  const radarRadius = 65;
  const radarMaxVal = 10;
  const radarAngles = [
    -Math.PI / 2,                         // Communication (Top)
    -Math.PI / 2 + (2 * Math.PI) / 5,     // Technical Skill (Right-Top)
    -Math.PI / 2 + (4 * Math.PI) / 5,     // Portfolio (Right-Bottom)
    -Math.PI / 2 + (6 * Math.PI) / 5,     // Job Readiness (Left-Bottom)
    -Math.PI / 2 + (8 * Math.PI) / 5      // Confidence (Left-Top)
  ];

  const getRadarPoints = (skillMap: CandidateReport["skill_map"]) => {
    const scores = [
      skillMap.communication || 5,
      skillMap.technical_skill || 5,
      skillMap.portfolio || 5,
      skillMap.job_readiness || 5,
      skillMap.confidence || 5
    ];
    return radarAngles.map((angle, idx) => {
      const dist = (scores[idx] / radarMaxVal) * radarRadius;
      const x = radarCenter + Math.cos(angle) * dist;
      const y = radarCenter + Math.sin(angle) * dist;
      return `${x},${y}`;
    }).join(" ");
  };

  const getRadarGridPoints = (factor: number) => {
    const dist = factor * radarRadius;
    return radarAngles.map((angle) => {
      const x = radarCenter + Math.cos(angle) * dist;
      const y = radarCenter + Math.sin(angle) * dist;
      return `${x},${y}`;
    }).join(" ");
  };

  const getRadarLabelCoords = (index: number) => {
    const angle = radarAngles[index];
    const labelDist = radarRadius + 18;
    const x = radarCenter + Math.cos(angle) * labelDist;
    const y = radarCenter + Math.sin(angle) * labelDist + 4; // micro offset for vertical alignment
    return { x, y };
  };

  if (roleLoading) {
    return <LoadingScreen />;
  }

  if (!authorized) {
    return null;
  }

  // Active alerts list for candidates who have alert actions defined
  const candidateAlerts = candidates
    .filter((c) => c.status === "Founder Review" || c.status === "Review Required" || (c as any).alert_type)
    .map((c) => {
      const type = (c as any).alert_type || (c.name === "Ravi" ? "Corporate Lead" : c.name === "Maya" ? "NeuroAI Interest" : "Review Required");
      const msg = (c as any).alert_message || (c.name === "Ravi" ? "Corporate representative detected. Possible workshop opportunity. Urgent founder review recommended." : c.name === "Maya" ? "Interested in upcoming NeuroAI cohort. Add to waiting list." : "Candidate profile requires manual founder validation.");
      return { id: c.id, name: c.name, type, msg };
    });

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
              {/* Title Header */}
              <section className="space-y-2">
                <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#00917C]">
                  Enterprise Resources
                </p>
                <h1 className="text-4xl font-extrabold tracking-tight text-[#150E56]">
                  Interview Intelligence Center
                </h1>
                <p className="text-sm text-[#5C6485] leading-relaxed max-w-3xl">
                  CRM logs, automated screening transcripts, and AI-driven candidate pathway matching.
                </p>
              </section>

              {/* Founder Alerts Banner */}
              {candidateAlerts.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs uppercase tracking-wider text-[#5C6485] font-bold">Active Founder Alerts</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {candidateAlerts.map((alertItem) => (
                      <div 
                        key={alertItem.id}
                        onClick={() => handleCandidateClick(alertItem.id)}
                        className="flex gap-4 p-4 rounded-[1.75rem] border border-red-200/50 bg-[#FFF5F5]/90 backdrop-blur-md hover:border-red-300 hover:shadow-clay transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
                      >
                        <div className="text-2xl self-start">🚨</div>
                        <div>
                          <div className="flex gap-2 items-center">
                            <span className="font-bold text-red-950">{alertItem.name}</span>
                            <span className="px-2 py-0.5 text-[10px] rounded-full font-extrabold bg-red-100 text-red-700 border border-red-200">{alertItem.type}</span>
                          </div>
                          <p className="text-xs text-red-900/80 mt-1 leading-relaxed">{alertItem.msg}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overview Stats Cards */}
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
                {/* Total Completed */}
                <div className="rounded-[1.75rem] border border-white bg-white/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Total Completed</span>
                  <div className="text-3xl font-black text-[#150E56] mt-1">{overview.total_interviews}</div>
                </div>
                {/* Auto Routed */}
                <div className="rounded-[1.75rem] border border-emerald-200/40 bg-[#ECFDF5]/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-800 block">Auto Routed</span>
                  <div className="text-3xl font-black text-emerald-600 mt-1">{overview.candidates_routed}</div>
                </div>
                {/* Require Review */}
                <div className="rounded-[1.75rem] border border-amber-200/40 bg-[#FFFBEB]/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-amber-800 block">Require Review</span>
                  <div className="text-3xl font-black text-amber-600 mt-1">{overview.require_review}</div>
                </div>
                {/* Corporate Leads */}
                <div className="rounded-[1.75rem] border border-cyan-200/40 bg-[#ECFEFF]/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-cyan-800 block">Corporate Leads</span>
                  <div className="text-3xl font-black text-cyan-600 mt-1">{overview.corporate_leads}</div>
                </div>
                {/* Caregiver Leads */}
                <div className="rounded-[1.75rem] border border-indigo-200/40 bg-[#EEF2FF]/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-800 block">Caregiver Leads</span>
                  <div className="text-3xl font-black text-indigo-600 mt-1">{overview.caregiver_leads}</div>
                </div>
                {/* High Potential */}
                <div className="rounded-[1.75rem] border border-purple-200/40 bg-[#FAF5FF]/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-purple-800 block">High Potential</span>
                  <div className="text-3xl font-black text-purple-600 mt-1">{overview.high_potential_candidates}</div>
                </div>
                {/* NeuroAI Sessions */}
                <div className="rounded-[1.75rem] border border-violet-200/40 bg-[#F5F3FF]/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-violet-800 block">NeuroAI Sessions</span>
                  <div className="text-3xl font-black text-violet-600 mt-1">{overview.neuroai_prep_sessions || 0}</div>
                </div>
                {/* Pathway Sessions */}
                <div className="rounded-[1.75rem] border border-teal-200/40 bg-[#F2FBF9]/70 backdrop-blur-md p-5 shadow-clay hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-teal-800 block">Pathway Sessions</span>
                  <div className="text-3xl font-black text-[#00917C] mt-1">{overview.pathway_discovery_sessions || 0}</div>
                </div>
              </div>

              {/* Analytics Graphs Section */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Demand Trends Chart */}
                <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md space-y-4">
                  <h3 className="text-xl font-extrabold text-[#150E56] mb-4">Demand Trends (Program Pathways)</h3>
                  <div className="space-y-4">
                    {analytics.demand_trends.map((item) => (
                      <div key={item.name} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-[#5C6485]">{item.name}</span>
                          <span className="font-bold text-[#150E56]">{item.value}%</span>
                        </div>
                        <div className="h-2 w-full bg-[#FFF6F0]/60 border border-[#150E56]/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#00917C] to-blue-500 rounded-full" 
                            style={{ width: `${item.value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Common Candidate Challenges */}
                <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md space-y-4">
                  <h3 className="text-xl font-extrabold text-[#150E56] mb-4">Most Common Candidate Challenges</h3>
                  <div className="space-y-3">
                    {analytics.common_challenges.map((item) => (
                      <div key={item.challenge} className="flex items-center justify-between p-3 rounded-2xl bg-[#FFF6F0]/20 border border-[#150E56]/5">
                        <div className="flex gap-3 items-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-xs font-bold text-[#00917C] shadow-clay">
                            {item.rank}
                          </span>
                          <span className="text-sm font-bold text-[#2C3454]">{item.challenge}</span>
                        </div>
                        <div className="flex gap-2 items-center text-xs font-semibold">
                          <span className="text-[#5C6485]">Incident Rate:</span>
                          <span className="text-sm font-extrabold text-[#150E56]">{item.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Search, Filter, and Table workspace */}
              <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md space-y-6">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                  {/* Search Input */}
                  <div className="relative w-full md:max-w-md">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search candidates by name, tag, or status..."
                      className="w-full bg-[#FFF6F0]/40 border border-[#150E56]/10 focus:border-[#00917C] rounded-2xl pl-10 pr-4 py-2.5 text-xs text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                    />
                    <div className="absolute left-3 top-3 text-slate-400">🔍</div>
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-2.5 text-xs font-bold text-[#5C6485] hover:text-[#150E56]"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Selected Tag Indicator */}
                  {selectedTag && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#00917C]/20 bg-[#00917C]/5 text-xs font-bold text-[#00917C]">
                      <span>Active Filter: {selectedTag}</span>
                      <button onClick={() => setSelectedTag(null)} className="hover:text-red-600 font-bold ml-1">✕</button>
                    </div>
                  )}
                </div>

                {/* Quick Tag Pills */}
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[#150E56]/5">
                    <span className="text-xs text-[#5C6485] font-bold self-center">Filter Tags:</span>
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition border ${selectedTag === tag ? "bg-[#00917C]/15 text-[#00917C] border-[#00917C]/25" : "bg-white text-[#5C6485] border-[#150E56]/10 hover:text-[#150E56] hover:bg-[#FFF6F0]/50 shadow-clayBtn"}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {/* Candidate Table Grid */}
                <div className="overflow-x-auto rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/20 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#150E56]/10 bg-[#FFF6F0]/40 text-[10px] uppercase font-bold tracking-wider text-[#5C6485]">
                        <th className="p-4 font-bold">Name</th>
                        <th className="p-4 font-bold">Classification</th>
                        <th className="p-4 font-bold">Recommended Pathway</th>
                        <th className="p-4 font-bold">AI Confidence</th>
                        <th className="p-4 font-bold">Action Status</th>
                        <th className="p-4 font-bold">Associated Tags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#150E56]/5 text-xs">
                      {filteredCandidates.length > 0 ? (
                        filteredCandidates.map((cand) => (
                          <tr 
                            key={cand.id}
                            onClick={() => handleCandidateClick(cand.id)}
                            className="hover:bg-[#FFF6F0]/40 cursor-pointer transition duration-200 group"
                          >
                            <td className="p-4 font-extrabold text-[#150E56] group-hover:text-[#00917C]">
                              {cand.name}
                            </td>
                            <td className="p-4 font-semibold text-[#2C3454]">
                              {cand.type}
                            </td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-xl text-xs bg-white border border-[#150E56]/10 text-[#2C3454] font-bold shadow-clayBtn">
                                {cand.recommended_pathway}
                              </span>
                            </td>
                            <td className="p-4 font-bold text-[#150E56]">
                              {cand.confidence}
                            </td>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase border ${cand.status === "Founder Review" ? "bg-amber-100 text-amber-700 border-amber-200/50" : cand.status === "Review Required" ? "bg-red-100 text-red-700 border-red-200/50" : "bg-emerald-100 text-emerald-700 border-emerald-200/50"}`}>
                                {cand.status}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-wrap gap-1 max-w-[250px]">
                                {cand.tags.slice(0, 2).map((t) => (
                                  <span key={t} className="px-2 py-0.5 text-[9px] rounded-full font-bold bg-[#150E56]/5 text-[#5C6485] border border-[#150E56]/10">{t}</span>
                                ))}
                                {cand.tags.length > 2 && (
                                  <span className="px-2 py-0.5 text-[9px] rounded-full font-bold bg-white text-[#5C6485] border border-[#150E56]/10">+{cand.tags.length - 2} more</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-[#5C6485] font-semibold italic">
                            No candidates found matching the query.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Profile Detail Drawer (Right slide-over or floating modal) */}
              {selectedCandidateId && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition">
                  <div className="w-full max-w-4xl h-full bg-[#FCFDFE] border-l border-[#150E56]/10 shadow-2xl overflow-y-auto flex flex-col animate-slide-in text-[#2C3454]">
                    
                    {/* Drawer Header */}
                    <div className="flex justify-between items-center p-6 border-b border-[#150E56]/10 bg-white sticky top-0 z-10 backdrop-blur shadow-sm">
                      <div>
                        <h2 className="text-2xl font-black text-[#150E56]">
                          {candidates.find(c => c.id === selectedCandidateId)?.name || "Candidate"} Intelligence Report
                        </h2>
                        <p className="text-xs text-[#5C6485] mt-1 font-semibold">UUID: {selectedCandidateId}</p>
                      </div>
                      <button
                        onClick={() => setSelectedCandidateId(null)}
                        className="h-10 w-10 inline-flex items-center justify-center rounded-2xl border border-[#150E56]/10 bg-white text-[#5C6485] hover:text-[#150E56] hover:bg-[#FFF6F0]/80 transition shadow-clayBtn"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Drawer Content */}
                    {reportLoading ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-12">
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-t-[#00917C] border-[#150E56]/10" />
                        <p className="text-xs uppercase tracking-widest text-[#5C6485] font-bold mt-4 animate-pulse">Extracting AI intelligence record...</p>
                      </div>
                    ) : report ? (
                      <div className="p-6 space-y-6 flex-1">
                        
                        {/* Jump Alert Indicator */}
                        {jumpAlert && (
                          <div className="p-3 bg-cyan-100 border border-cyan-200 text-cyan-800 text-xs rounded-xl text-center font-bold animate-pulse">
                            {jumpAlert}
                          </div>
                        )}

                        {/* Red Alert Banner */}
                        {report.alert && (
                          <div className="flex gap-3 p-4 rounded-2xl border bg-red-50/90 border-red-200 text-red-950 text-sm shadow-sm">
                            <span>⚠️</span>
                            <div>
                              <strong>{report.alert.alert_type} Alert:</strong> {report.alert.alert_message}
                            </div>
                          </div>
                        )}

                        {/* Recording & Transcript Hub */}
                        {report.recording_url || (report.messages && report.messages.length > 0) ? (
                          <div className="grid gap-6 md:grid-cols-2">
                            {/* Video Player */}
                            {report.recording_url ? (
                              <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay backdrop-blur-md space-y-4">
                                <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] border-b border-[#150E56]/5 pb-2">Session Recording</h3>
                                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[#150E56]/10 shadow-sm">
                                  <video
                                    src={report.recording_url.startsWith("/") ? getApiUrl(report.recording_url) : report.recording_url}
                                    controls
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay backdrop-blur-md flex items-center justify-center min-h-[200px]">
                                <p className="text-xs text-[#5C6485] font-semibold italic">No video recording saved for this session</p>
                              </div>
                            )}

                            {/* Session Transcripts */}
                            {report.messages && report.messages.length > 0 ? (
                              <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay backdrop-blur-md flex flex-col h-[280px]">
                                <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] border-b border-[#150E56]/5 pb-2 flex-shrink-0">Session Transcripts</h3>
                                <div className="flex-1 overflow-y-auto space-y-3 pr-2 mt-3">
                                  {report.messages.map((msg, idx) => (
                                    <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed font-semibold ${msg.role === "user" ? "bg-[#00917C] text-white rounded-tr-none" : "bg-[#150E56]/10 text-[#150E56] rounded-tl-none"}`}>
                                        {msg.content}
                                      </div>
                                      <span className="text-[9px] text-[#5C6485] mt-1 px-1 uppercase tracking-wider font-bold">
                                        {msg.role === "user" ? "Candidate" : "Geethanjali"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay backdrop-blur-md flex items-center justify-center min-h-[200px]">
                                <p className="text-xs text-[#5C6485] font-semibold italic">No transcript messages saved for this session</p>
                              </div>
                            )}
                          </div>
                        ) : null}

                        {/* NeuroAI / Mock Practice Scorecard & Feedback Panel */}
                        {(parsedFeedback || report.detailed_feedback) && (
                          <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay backdrop-blur-md space-y-4">
                            <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] border-b border-[#150E56]/5 pb-2">NeuroAI / Mock Practice Feedback</h3>
                            
                            {parsedFeedback ? (
                              <div className="space-y-6">
                                {/* Score cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 shadow-sm">
                                    <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Comprehension</span>
                                    <div className="flex items-baseline gap-0.5 mt-1">
                                      <strong className="text-2xl font-black text-slate-800">{parsedFeedback.comprehension_score || 0}</strong>
                                      <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                                      {parsedFeedback.comprehension_feedback || "No feedback."}
                                    </p>
                                  </div>

                                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm">
                                    <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider block">Communication</span>
                                    <div className="flex items-baseline gap-0.5 mt-1">
                                      <strong className="text-2xl font-black text-slate-800">{parsedFeedback.communication_score || 0}</strong>
                                      <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                                      {parsedFeedback.communication_feedback || "No feedback."}
                                    </p>
                                  </div>

                                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-100 shadow-sm">
                                    <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider block">Internship Readiness</span>
                                    <div className="flex items-baseline gap-0.5 mt-1">
                                      <strong className="text-2xl font-black text-slate-800">{parsedFeedback.readiness_score || 0}</strong>
                                      <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                                      {parsedFeedback.readiness_feedback || "No feedback."}
                                    </p>
                                  </div>
                                </div>

                                {/* What Went Well */}
                                <div className="space-y-2">
                                  <h4 className="font-bold text-[#150E56] text-sm">⭐ What Went Well</h4>
                                  <ul className="space-y-1.5 pl-1">
                                    {parsedFeedback.what_went_well?.map((item: string, idx: number) => (
                                      <li key={idx} className="flex gap-2 items-start text-xs text-[#2C3454]">
                                        <span className="text-emerald-600">✓</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Areas for Improvement */}
                                <div className="space-y-2">
                                  <h4 className="font-bold text-[#150E56] text-sm">💡 Areas for Improvement</h4>
                                  <ul className="space-y-1.5 pl-1">
                                    {parsedFeedback.areas_for_improvement?.map((item: string, idx: number) => (
                                      <li key={idx} className="flex gap-2 items-start text-xs text-[#2C3454]">
                                        <span className="text-amber-600 font-bold">!</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Suggested Answer Improvements */}
                                {parsedFeedback.suggested_improvements?.length > 0 && (
                                  <div className="space-y-3">
                                    <h4 className="font-bold text-[#150E56] text-sm">✏️ Suggested Answer Improvements</h4>
                                    <div className="space-y-3">
                                      {parsedFeedback.suggested_improvements.map((item: any, idx: number) => (
                                        <div key={idx} className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 text-xs shadow-clayBtn">
                                          <p className="text-xs text-[#5C6485] uppercase font-semibold">Question: {item.question}</p>

                                          {item.what_you_did_well && (
                                            <div className="space-y-1">
                                              <p className="text-[10px] text-[#00917C] font-bold">What You Did Well:</p>
                                              <ul className="list-disc pl-4 text-xs text-[#2C3454]">
                                                {item.what_you_did_well?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                                              </ul>
                                            </div>
                                          )}

                                          {item.missing_information && item.missing_information.length > 0 && (
                                            <div className="space-y-1">
                                              <p className="text-[10px] text-amber-600 font-bold">Consider Adding:</p>
                                              <ul className="list-disc pl-4 text-xs text-[#2C3454]">
                                                {item.missing_information?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                                              </ul>
                                            </div>
                                          )}

                                          {item.minor_language_suggestions && (
                                            <div className="pt-2 border-t border-[#150E56]/5">
                                              <p className="text-[10px] text-[#150E56] font-bold">Grammar Suggestion:</p>
                                              <p className="text-xs text-[#2C3454] italic">{item.minor_language_suggestions}</p>
                                            </div>
                                          )}

                                          {item.example_good_responses && item.example_good_responses.length > 0 && (
                                            <div className="pt-3 border-t border-[#150E56]/10 space-y-2">
                                              <p className="text-[10px] text-[#00917C] font-bold uppercase tracking-wider">💡 Authentic Example Responses:</p>
                                              <div className="flex flex-col gap-2">
                                                {item.example_good_responses.map((ex: string, i: number) => (
                                                  <div key={i} className="p-2.5 bg-white border border-[#150E56]/5 rounded-lg text-xs text-[#150E56] font-medium shadow-sm">
                                                    "{ex}"
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Raw feedback text */}
                                {parsedFeedback.detailed_feedback && (
                                  <div className="pt-4 border-t border-[#150E56]/10">
                                    <h4 className="font-bold text-[#150E56] text-sm mb-2">Detailed Report Summary</h4>
                                    <div
                                      className="max-w-none text-[#2C3454] text-xs space-y-2 leading-relaxed"
                                      dangerouslySetInnerHTML={{ __html: formatFeedbackMarkdown(parsedFeedback.detailed_feedback || "") }}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              // Normal markdown feedback report
                              <div
                                className="max-w-none text-[#2C3454] text-xs space-y-2 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: formatFeedbackMarkdown(report.detailed_feedback || "") }}
                              />
                            )}
                          </div>
                        )}

                        {/* Summary Profile Grid */}
                        <div className="grid gap-6 md:grid-cols-2">
                          {/* Candidate Metadata Summary */}
                          <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay backdrop-blur-md">
                            <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] mb-4 border-b border-[#150E56]/5 pb-2">Candidate Profile Summary</h3>
                            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                              <div>
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Age Group</span>
                                <strong className="text-sm font-bold text-[#150E56] mt-0.5 block">{report.summary.age_group}</strong>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Location</span>
                                <strong className="text-sm font-bold text-[#150E56] mt-0.5 block">{report.summary.location}</strong>
                              </div>
                              <div className="col-span-2">
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Education</span>
                                <strong className="text-sm font-bold text-[#150E56] mt-0.5 block">{report.summary.education}</strong>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Current Status</span>
                                <strong className="text-sm font-bold text-[#150E56] mt-0.5 block">{report.summary.current_status}</strong>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Experience</span>
                                <strong className="text-sm font-bold text-[#150E56] mt-0.5 block">{report.summary.experience}</strong>
                              </div>
                              <div className="col-span-2">
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Primary Goal</span>
                                <strong className="text-sm font-bold text-[#150E56] mt-0.5 block">{report.summary.primary_goal}</strong>
                              </div>
                            </div>
                          </div>

                          {/* AI Recommendations */}
                          <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay backdrop-blur-md flex flex-col justify-between">
                            <div>
                              <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] mb-4 border-b border-[#150E56]/5 pb-2">AI Pathway Recommendations</h3>
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485]">Recommended Pathway</span>
                                  <div className="text-base font-bold text-[#00917C] mt-0.5">{report.recommendation.primary_pathway}</div>
                                </div>
                                {report.recommendation.secondary_pathway && (
                                  <div>
                                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485]">Secondary / Alternative Pathway</span>
                                    <div className="text-sm font-semibold text-[#2C3454] mt-0.5">{report.recommendation.secondary_pathway}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t border-[#150E56]/5 mt-4">
                              <div>
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Routing Priority</span>
                                <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold uppercase mt-1 ${report.recommendation.priority === "High" ? "bg-red-100 text-red-700 border border-red-200" : "bg-slate-100 text-[#5C6485] border border-slate-200"}`}>
                                  {report.recommendation.priority}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] block">Founder Attention</span>
                                <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold uppercase mt-1 ${report.recommendation.founder_attention ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"}`}>
                                  {report.recommendation.founder_attention ? "Required" : "No Action"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Highlights (Strengths/Concerns) & Radar Competency Chart */}
                        <div className="grid gap-6 md:grid-cols-3">
                          {/* Key Highlights */}
                          <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay md:col-span-2 space-y-4">
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">Key Strengths</h4>
                              <ul className="list-disc pl-5 text-sm text-[#2C3454] space-y-1.5 font-semibold">
                                {report.highlights.strengths.map((str, idx) => (
                                  <li key={idx}>{str}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="pt-2 border-t border-[#150E56]/5">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2">Concerns / Hurdles</h4>
                              <ul className="list-disc pl-5 text-sm text-[#2C3454] space-y-1.5 font-semibold">
                                {report.highlights.concerns.map((con, idx) => (
                                  <li key={idx}>{con}</li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Skill Map Radar Chart */}
                          <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay flex flex-col items-center justify-center">
                            <h3 className="text-[10px] uppercase font-extrabold tracking-wider text-[#5C6485] mb-2 text-center w-full">Competency Radar Map</h3>
                            
                            <div className="w-[180px] h-[180px] relative">
                              <svg viewBox="0 0 200 200" className="w-full h-full">
                                {/* Grid rings */}
                                <polygon points={getRadarGridPoints(0.2)} fill="none" stroke="rgba(21, 14, 86, 0.05)" />
                                <polygon points={getRadarGridPoints(0.4)} fill="none" stroke="rgba(21, 14, 86, 0.05)" />
                                <polygon points={getRadarGridPoints(0.6)} fill="none" stroke="rgba(21, 14, 86, 0.08)" />
                                <polygon points={getRadarGridPoints(0.8)} fill="none" stroke="rgba(21, 14, 86, 0.08)" />
                                <polygon points={getRadarGridPoints(1.0)} fill="none" stroke="rgba(21, 14, 86, 0.15)" />

                                {/* Radar axes */}
                                {radarAngles.map((angle) => {
                                  const x2 = radarCenter + Math.cos(angle) * radarRadius;
                                  const y2 = radarCenter + Math.sin(angle) * radarRadius;
                                  return (
                                    <line 
                                      key={angle} 
                                      x1={radarCenter} 
                                      y1={radarCenter} 
                                      x2={x2} 
                                      y2={y2} 
                                      stroke="rgba(21, 14, 86, 0.08)" 
                                    />
                                  );
                                })}

                                {/* Plotted skills polygon */}
                                <polygon 
                                  points={getRadarPoints(report.skill_map)} 
                                  fill="rgba(0, 145, 124, 0.15)" 
                                  stroke="#00917C" 
                                  strokeWidth="2.5"
                                />

                                {/* Skill labels */}
                                <text x={getRadarLabelCoords(0).x} y={getRadarLabelCoords(0).y} textAnchor="middle" fill="#150E56" fontSize="8" fontWeight="bold">COM</text>
                                <text x={getRadarLabelCoords(1).x} y={getRadarLabelCoords(1).y} textAnchor="start" fill="#150E56" fontSize="8" fontWeight="bold">TEC</text>
                                <text x={getRadarLabelCoords(2).x} y={getRadarLabelCoords(2).y} textAnchor="start" fill="#150E56" fontSize="8" fontWeight="bold">POR</text>
                                <text x={getRadarLabelCoords(3).x} y={getRadarLabelCoords(3).y} textAnchor="end" fill="#150E56" fontSize="8" fontWeight="bold">REA</text>
                                <text x={getRadarLabelCoords(4).x} y={getRadarLabelCoords(4).y} textAnchor="end" fill="#150E56" fontSize="8" fontWeight="bold">CON</text>
                              </svg>
                            </div>

                            <div className="grid grid-cols-5 gap-1 text-[9px] text-center w-full mt-2 border-t border-[#150E56]/5 pt-2 text-[#5C6485] font-semibold">
                              <div>
                                <span>COM</span>
                                <strong className="block text-[#150E56] mt-0.5">{report.skill_map.communication}</strong>
                              </div>
                              <div>
                                <span>TEC</span>
                                <strong className="block text-[#150E56] mt-0.5">{report.skill_map.technical_skill}</strong>
                              </div>
                              <div>
                                <span>POR</span>
                                <strong className="block text-[#150E56] mt-0.5">{report.skill_map.portfolio}</strong>
                              </div>
                              <div>
                                <span>REA</span>
                                <strong className="block text-[#150E56] mt-0.5">{report.skill_map.job_readiness}</strong>
                              </div>
                              <div>
                                <span>CON</span>
                                <strong className="block text-[#150E56] mt-0.5">{report.skill_map.confidence}</strong>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* NeuroAI Practice History */}
                        <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay space-y-4">
                          <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] border-b border-[#150E56]/5 pb-2">NeuroAI Practice History</h3>
                          {neuroHistoryLoading ? (
                            <p className="text-xs text-slate-500 italic">Loading practice sessions...</p>
                          ) : neuroHistory.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">No NeuroAI practice sessions recorded for this candidate.</p>
                          ) : (
                            <div className="grid gap-4 sm:grid-cols-2">
                              {neuroHistory.map((run, idx) => {
                                const parsed = typeof run.parsed_feedback === "string" 
                                  ? JSON.parse(run.parsed_feedback) 
                                  : run.parsed_feedback || {};
                                
                                return (
                                  <div key={run.id || idx} className="flex justify-between items-center p-4 rounded-2xl bg-white border border-[#150E56]/5 shadow-sm">
                                    <div>
                                      <strong className="text-sm font-bold text-[#150E56] block">
                                        {run.interview_mode?.replace("NeuroAI Prep: ", "") || "Unified Mock"}
                                      </strong>
                                      <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                                        Attempt {idx + 1} • {new Date(run.created_at).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => setSelectedNeuroReport({ ...run, parsed_feedback: parsed })}
                                      className="px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-xl shadow-sm transition"
                                    >
                                      View Scorecard
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Dynamic Timeline Log */}
                        <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay">
                          <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] mb-4 border-b border-[#150E56]/5 pb-2">Interview Discussion Timeline</h3>
                          <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#150E56]/10">
                            {report.timeline.map((log, index) => (
                              <div 
                                key={index} 
                                className="flex gap-4 items-start relative pl-8 cursor-pointer group"
                                onClick={() => handleTimelineJump(log.time, log.topic)}
                              >
                                {/* Dot indicator */}
                                <div className="absolute left-[7px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#00917C] border-2 border-white group-hover:scale-125 transition" />
                                
                                <span className="text-xs font-bold text-[#00917C] w-12 flex-shrink-0 group-hover:text-[#00917C]/80">
                                  {log.time}
                                </span>
                                <div>
                                  <strong className="text-sm font-bold text-[#150E56] block group-hover:text-[#00917C]">{log.topic}</strong>
                                  <span className="text-[10px] text-[#5C6485] font-semibold block mt-0.5">Click to jump to audio segment</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* AI Tags */}
                        <div className="p-5 rounded-3xl border border-white bg-white/80 shadow-clay">
                          <h3 className="text-xs uppercase font-extrabold tracking-wider text-[#5C6485] mb-2">Automated tags</h3>
                          <div className="flex flex-wrap gap-2">
                            {report.tags.map((tag) => (
                              <span 
                                key={tag} 
                                className="px-2.5 py-1 text-xs rounded-xl bg-white border border-[#150E56]/10 text-[#00917C] font-bold shadow-clayBtn"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 p-8 text-center text-[#5C6485] font-semibold italic flex items-center justify-center">
                        Could not retrieve Candidate Intelligence Report details.
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* NEUROAI SCORECARD MODAL POPUP FOR FOUNDER/ADMIN */}
              <AnimatePresence>
                {selectedNeuroReport && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#150E56]/40 backdrop-blur-md"
                  >
                    <motion.div
                      initial={{ scale: 0.95, y: 15 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.95, y: 15 }}
                      className="relative w-full max-w-4xl h-[85vh] rounded-[2rem] border border-white bg-white/95 shadow-clay p-6 md:p-8 flex flex-col overflow-hidden text-[#2C3454]"
                    >
                      {/* Close Button */}
                      <button
                        onClick={() => setSelectedNeuroReport(null)}
                        className="absolute top-6 right-6 h-10 w-10 inline-flex items-center justify-center rounded-2xl border border-[#150E56]/10 bg-white text-[#5C6485] hover:text-[#150E56] hover:border-[#150E56]/20 shadow-clayBtn hover:shadow-clayBtnHover transition"
                      >
                        ✕
                      </button>

                      {/* Modal Header */}
                      <div className="pb-6 border-b border-[#150E56]/10 flex-shrink-0">
                        <span className="rounded-full bg-[#00917C]/10 px-3 py-1 text-[10px] font-bold text-[#00917C] uppercase tracking-widest border border-[#00917C]/20">
                          NeuroAI Practice Scorecard
                        </span>
                        <h2 className="text-2xl font-extrabold text-[#150E56] mt-3">
                          {selectedNeuroReport.interview_mode?.replace("NeuroAI Prep: ", "") || "Unified Mock"}
                        </h2>
                        <p className="text-xs text-[#5C6485] mt-1 font-semibold">
                          Conducted on {new Date(selectedNeuroReport.created_at).toLocaleString()}
                        </p>
                      </div>

                      {/* Modal Body */}
                      <div className="flex-1 overflow-y-auto pr-2 py-6 space-y-6" style={{ scrollbarWidth: 'none' }}>

                        {/* Rubric Score Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-2">
                          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 shadow-sm flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Comprehension</span>
                              <div className="flex items-baseline gap-0.5 mt-1">
                                <strong className="text-2xl font-black text-slate-800">{selectedNeuroReport.parsed_feedback.comprehension_score || 0}</strong>
                                <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                              {selectedNeuroReport.parsed_feedback.comprehension_feedback || "No feedback."}
                            </p>
                          </div>

                          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 shadow-sm flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider block">Communication</span>
                              <div className="flex items-baseline gap-0.5 mt-1">
                                <strong className="text-2xl font-black text-slate-800">{selectedNeuroReport.parsed_feedback.communication_score || 0}</strong>
                                <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                              {selectedNeuroReport.parsed_feedback.communication_feedback || "No feedback."}
                            </p>
                          </div>

                          <div className="p-4 rounded-xl bg-purple-50 border border-purple-100 shadow-sm flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider block">Internship Readiness</span>
                              <div className="flex items-baseline gap-0.5 mt-1">
                                <strong className="text-2xl font-black text-slate-800">{selectedNeuroReport.parsed_feedback.readiness_score || 0}</strong>
                                <span className="text-slate-400 text-[10px] font-bold">/ 5</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-600 mt-2 italic leading-relaxed">
                              {selectedNeuroReport.parsed_feedback.readiness_feedback || "No feedback."}
                            </p>
                          </div>
                        </div>

                        {/* What Went Well */}
                        <div className="space-y-2">
                          <h4 className="font-bold text-[#150E56] text-base">⭐ What Went Well</h4>
                          <ul className="space-y-2">
                            {selectedNeuroReport.parsed_feedback.what_went_well?.map((item: string, idx: number) => (
                              <li key={idx} className="flex gap-2 items-start text-xs text-[#2C3454]">
                                <span className="text-emerald-600">✓</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Areas for Improvement */}
                        <div className="space-y-2">
                          <h4 className="font-bold text-[#150E56] text-base">💡 Areas for Improvement</h4>
                          <ul className="space-y-2">
                            {selectedNeuroReport.parsed_feedback.areas_for_improvement?.map((item: string, idx: number) => (
                              <li key={idx} className="flex gap-2 items-start text-xs text-[#2C3454]">
                                <span className="text-amber-600 font-bold">!</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Suggested Answer Improvements */}
                        {selectedNeuroReport.parsed_feedback.suggested_improvements?.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-bold text-[#150E56] text-base">✏️ Suggested Answer Improvements</h4>
                            {selectedNeuroReport.parsed_feedback.suggested_improvements.map((item: any, idx: number) => (
                              <div key={idx} className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 text-xs shadow-clayBtn">
                                <p className="text-xs text-[#5C6485] uppercase font-semibold">Question: {item.question}</p>

                                {item.what_you_did_well && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] text-[#00917C] font-bold">What You Did Well:</p>
                                    <ul className="list-disc pl-4 text-xs text-[#2C3454]">
                                      {item.what_you_did_well?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                                    </ul>
                                  </div>
                                )}

                                {item.missing_information && item.missing_information.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] text-amber-600 font-bold">Consider Adding:</p>
                                    <ul className="list-disc pl-4 text-xs text-[#2C3454]">
                                      {item.missing_information?.map((point: string, i: number) => <li key={i}>{point}</li>)}
                                    </ul>
                                  </div>
                                )}

                                {item.minor_language_suggestions && (
                                  <div className="pt-2 border-t border-[#150E56]/5">
                                    <p className="text-[10px] text-[#150E56] font-bold">Grammar Suggestion:</p>
                                    <p className="text-xs text-[#2C3454] italic">{item.minor_language_suggestions}</p>
                                  </div>
                                )}

                                {item.time_feedback && (
                                  <div className="pt-2 border-t border-[#150E56]/5">
                                    <p className="text-[10px] text-[#150E56] font-bold">Pacing:</p>
                                    <p className="text-xs text-[#2C3454]">{item.time_feedback}</p>
                                  </div>
                                )}

                                {item.example_good_responses && item.example_good_responses.length > 0 && (
                                  <div className="pt-3 border-t border-[#150E56]/10 space-y-2">
                                    <p className="text-[10px] text-[#00917C] font-bold uppercase tracking-wider">💡 Authentic Example Responses:</p>
                                    <div className="flex flex-col gap-2">
                                      {item.example_good_responses.map((ex: string, i: number) => (
                                        <div key={i} className="p-2.5 bg-white border border-[#150E56]/5 rounded-lg text-xs text-[#150E56] font-medium shadow-sm">
                                          "{ex}"
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Backwards compatibility */}
                                {!item.what_you_did_well && item.suggested_answer && (
                                  <p className="text-[#00917C] font-semibold mt-1">Suggested wording: "{item.suggested_answer}"</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Raw feedback text */}
                        <div className="pt-4 border-t border-[#150E56]/10">
                          <h4 className="font-bold text-[#150E56] text-base mb-2">Detailed Report Summary</h4>
                          <div
                            className="max-w-none text-[#2C3454] text-xs space-y-2 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: formatFeedbackMarkdown(selectedNeuroReport.parsed_feedback.detailed_feedback || "") }}
                          />
                        </div>

                      </div>

                      {/* Modal Footer */}
                      <div className="pt-4 border-t border-[#150E56]/10 flex justify-end flex-shrink-0">
                        <button
                          onClick={() => setSelectedNeuroReport(null)}
                          className="px-6 py-2.5 bg-[#00917C] hover:bg-[#007a68] text-white text-xs font-bold rounded-xl shadow-clayBtn transition"
                        >
                          Close Report
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
