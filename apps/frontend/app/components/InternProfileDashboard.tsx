"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  BookOpen,
  User,
  Activity,
  Award,
  Settings,
  Heart,
  Briefcase,
  TrendingUp,
  RefreshCw,
  Loader2,
  CheckCircle,
  HelpCircle
} from "lucide-react";

interface InternProfileDashboardProps {
  candidateId: string;
  userRole: string;
}

interface InternProfile {
  candidate_id: string;
  education: string | null;
  background: string | null;
  internship_interests: string[];
  learning_history: { session_id: string; track: string; persona: string; completed_at: string }[];
  technical_strengths: string[];
  transferable_strengths: string[];
  behavioral_strengths: string[];
  communication_preferences: string[];
  working_style_preferences: string[];
  environment_preferences: string[];
  rephrasing_requirements: string | null;
  processing_time_preferences: string | null;
  example_based_learning_preferences: string | null;
  accommodation_needs: string[];
  career_interests: string[];
  role_alignment: string | null;
  industry_preferences: string[];
  long_term_aspirations: string | null;
}

interface GrowthItem {
  session_id: string | null;
  confidence_score: number;
  career_clarity_score: number;
  self_expression_score: number;
  recorded_at: string;
}

const mockFallbackProfile: InternProfile = {
  candidate_id: "mock-candidate-id",
  education: "B.S. in Computer Science, State University",
  background: "Passionate aspiring developer and designer with a focus on human-computer interaction, web technologies, and accessibility. Enthusiastic about prototyping, data annotation, and content creation.",
  internship_interests: ["Frontend Development", "UX/UI Design", "Data Annotation", "Creative Writing"],
  learning_history: [
    { session_id: "s1", track: "UX/UI Design Foundations", persona: "Geethanjali (Design Lead)", completed_at: "2026-06-10T10:00:00Z" },
    { session_id: "s2", track: "Mock Technical Interview", persona: "Panchali (Tech Lead)", completed_at: "2026-06-15T14:30:00Z" },
    { session_id: "s3", track: "Neuro AI Prep Suite", persona: "Alex (AI Coach)", completed_at: "2026-06-20T09:15:00Z" }
  ],
  technical_strengths: ["HTML/CSS/JS", "React", "Canva", "Python basics", "Data Tagging"],
  transferable_strengths: ["Communication", "Empathy", "Detail-oriented", "Active Listening", "Problem Solving"],
  behavioral_strengths: ["Resilience", "Collaboration", "Curiosity", "Self-reflection", "Adaptability"],
  communication_preferences: ["Written feedback", "Visual mockups", "Asynchronous updates"],
  working_style_preferences: ["Collaborative coding", "Independent research", "Structured sprints"],
  environment_preferences: ["Inclusive workplace", "Remote-friendly", "Flexible hours"],
  rephrasing_requirements: "Prefers clear, direct prompts with context during technical problem statements.",
  processing_time_preferences: "Values a 5-10 second pause to formulate structured verbal responses.",
  example_based_learning_preferences: "Learns best when concept definitions are paired with real-world design files.",
  accommodation_needs: ["Screen reader optimization support", "Extended response timers"],
  career_interests: ["Frontend Engineering", "Product Design", "AI Data Ops"],
  role_alignment: "Excellent alignment with collaborative product and front-facing tech roles.",
  industry_preferences: ["EdTech", "AI Tools", "Creative Agencies"],
  long_term_aspirations: "Aims to become a Senior UX/UI Engineer specializing in accessible tech interfaces."
};

const mockFallbackTimeline: GrowthItem[] = [
  { session_id: "s1", confidence_score: 55, career_clarity_score: 40, self_expression_score: 60, recorded_at: "2026-06-10T10:00:00Z" },
  { session_id: "s2", confidence_score: 70, career_clarity_score: 65, self_expression_score: 75, recorded_at: "2026-06-15T14:30:00Z" },
  { session_id: "s3", confidence_score: 85, career_clarity_score: 80, self_expression_score: 90, recorded_at: "2026-06-20T09:15:00Z" }
];

const getApiUrl = (path: string) => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://localhost:8000${path}`;
    }
  }
  return path;
};

export default function InternProfileDashboard({ candidateId, userRole }: InternProfileDashboardProps) {
  const [profile, setProfile] = useState<InternProfile | null>(null);
  const [timeline, setTimeline] = useState<GrowthItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "internship" | "timeline" | "preferences">("overview");

  const fetchProfileData = async () => {
    try {
      const [profileRes, timelineRes] = await Promise.all([
        fetch(getApiUrl(`/api/v1/interns/profile/${candidateId}`)),
        fetch(getApiUrl(`/api/v1/interns/timeline/${candidateId}`))
      ]);

      if (profileRes.ok) {
        const pData = await profileRes.json();
        if (pData) {
          setProfile(pData);
        } else {
          console.warn("Profile fetch returned null, using mock fallback profile");
          setProfile(mockFallbackProfile);
        }
      } else {
        console.warn("Profile fetch failed, using mock fallback profile");
        setProfile(mockFallbackProfile);
      }

      if (timelineRes.ok) {
        const timelineData = await timelineRes.json();
        setTimeline(timelineData.timeline && timelineData.timeline.length > 0 ? timelineData.timeline : mockFallbackTimeline);
      } else {
        console.warn("Timeline fetch failed, using mock fallback timeline");
        setTimeline(mockFallbackTimeline);
      }
    } catch (err) {
      console.error("Error loading IUE profile data, falling back to mock candidate data:", err);
      setProfile(mockFallbackProfile);
      setTimeline(mockFallbackTimeline);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [candidateId]);

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const res = await fetch(getApiUrl(`/api/v1/interns/profile/rebuild/${candidateId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data || mockFallbackProfile);
        
        const timelineRes = await fetch(getApiUrl(`/api/v1/interns/timeline/${candidateId}`));
        if (timelineRes.ok) {
          const tData = await timelineRes.json();
          setTimeline(tData.timeline && tData.timeline.length > 0 ? tData.timeline : mockFallbackTimeline);
        }
      } else {
        alert("Failed to rebuild profile from sessions context. Using fallback profile details.");
        setProfile(mockFallbackProfile);
        setTimeline(mockFallbackTimeline);
      }
    } catch (err) {
      console.error("Error rebuilding profile:", err);
      setProfile(mockFallbackProfile);
      setTimeline(mockFallbackTimeline);
    } finally {
      setRebuilding(false);
    }
  };

  // Generate SVG Line Chart Path Helper
  const chartSvgPath = useMemo(() => {
    if (timeline.length < 2) return { confidence: "", clarity: "", expression: "" };

    const width = 600;
    const height = 180;
    const paddingX = 40;
    const paddingY = 20;

    const stepX = (width - paddingX * 2) / (timeline.length - 1);
    const scaleY = (height - paddingY * 2) / 100;

    const getPoints = (key: "confidence_score" | "career_clarity_score" | "self_expression_score") => {
      return timeline.map((item, idx) => {
        const x = paddingX + idx * stepX;
        const val = item[key];
        const y = height - paddingY - val * scaleY;
        return { x, y };
      });
    };

    const formatPath = (points: { x: number; y: number }[]) => {
      return points.map((p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
    };

    return {
      confidence: formatPath(getPoints("confidence_score")),
      clarity: formatPath(getPoints("career_clarity_score")),
      expression: formatPath(getPoints("self_expression_score")),
      points: {
        confidence: getPoints("confidence_score"),
        clarity: getPoints("career_clarity_score"),
        expression: getPoints("self_expression_score")
      }
    };
  }, [timeline]);

  // Pathway Matches mapping based on strengths
  const pathwayMatches = useMemo(() => {
    if (!profile) return [];

    const interestsStr = (profile.internship_interests || []).join(" ").toLowerCase();
    const skillsStr = [
      ...(profile.technical_strengths || []),
      ...(profile.transferable_strengths || []),
      ...(profile.career_interests || [])
    ].join(" ").toLowerCase();

    const pathways = [
      {
        name: "Data Annotation",
        matchValue: interestsStr.includes("annotat") || skillsStr.includes("data") || skillsStr.includes("annotation") || skillsStr.includes("accuracy") ? 92 : 45,
        desc: "Focuses on detail-oriented data curation, labeling visual datasets, and training ML models.",
        color: "from-cyan-500 to-blue-500",
        bg: "bg-cyan-50 border-cyan-200 text-cyan-700"
      },
      {
        name: "Digital Marketing & Copywriting",
        matchValue: interestsStr.includes("market") || interestsStr.includes("writ") || skillsStr.includes("marketing") || skillsStr.includes("creative") || skillsStr.includes("copy") ? 88 : 50,
        desc: "Focuses on content generation, creative AI writing, and managing social branding pipelines.",
        color: "from-purple-500 to-pink-500",
        bg: "bg-purple-50 border-purple-200 text-purple-700"
      },
      {
        name: "Research & Analysis",
        matchValue: interestsStr.includes("research") || skillsStr.includes("research") || skillsStr.includes("curiosity") || skillsStr.includes("analysis") ? 85 : 40,
        desc: "Focuses on exploring market trends, compiling reports, and sourcing strategic business insights.",
        color: "from-emerald-500 to-teal-500",
        bg: "bg-emerald-50 border-emerald-200 text-emerald-700"
      }
    ];

    return pathways.sort((a, b) => b.matchValue - a.matchValue);
  }, [profile]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-transparent text-[#2C3454]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#00917C] mx-auto" />
          <p className="text-[#5C6485] animate-pulse text-sm">Synchronizing Intern Understanding metrics...</p>
        </div>
      </div>
    );
  }

  // Realistically profile will not be null due to fallback, but let's keep the guard
  if (!profile) {
    return (
      <div className="p-8 text-center bg-white/70 border border-[#150E56]/10 rounded-2xl max-w-xl mx-auto mt-20 shadow-clay">
        <HelpCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-[#150E56]">Profile Loading Error</h3>
        <p className="text-[#5C6485] text-xs mt-2">{error || "Could not retrieve profile context."}</p>
        <button
          onClick={fetchProfileData}
          className="mt-4 px-4 py-2 bg-[#00917C] text-white text-xs font-semibold rounded-xl hover:bg-[#007a68] shadow-clayBtn hover:shadow-clayBtnHover transition-all"
        >
          Retry Load
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 text-[#2C3454] max-w-[1400px] mx-auto pb-24">
      
      {/* Visual Header Dashboard Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative p-6 md:p-8 rounded-[2.5rem] border border-white bg-white/70 backdrop-blur-md shadow-clay flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#00917C]/5 blur-[80px] rounded-full pointer-events-none" />
        
        <div className="flex gap-4 md:gap-6 items-center">
          <div className="h-16 w-16 md:h-20 md:w-20 rounded-3xl bg-white border border-[#150E56]/10 shadow-clayBtn flex items-center justify-center text-2xl">
            🎓
          </div>
          <div>
            <div className="flex flex-wrap gap-2 items-center">
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#150E56]">Intern Profile</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-[#00917C]/10 border border-[#00917C]/20 text-[#00917C] uppercase tracking-widest font-bold">
                Evolving IUE
              </span>
            </div>
            <p className="text-sm text-[#5C6485] font-medium mt-1">Education: <span className="text-[#150E56] font-semibold">{profile.education || "N/A"}</span></p>
            <p className="text-xs text-[#5C6485] mt-1.5 leading-relaxed max-w-2xl">{profile.background}</p>
          </div>
        </div>

        {/* Sync Rebuild Profile Button */}
        <div className="flex-shrink-0">
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white border border-[#150E56]/10 text-[#00917C] hover:text-[#150E56] hover:bg-[#FFF6F0]/80 shadow-clayBtn hover:shadow-clayBtnHover transition duration-300 active:scale-[0.98] disabled:opacity-40 font-bold text-xs"
          >
            {rebuilding ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rebuilding Profile...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" /> Rebuild Profile Context
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Tabs Menu */}
      <div className="border-b border-[#150E56]/10 flex gap-6">
        {[
          { id: "overview", label: "Dashboard Overview", icon: Briefcase },
          { id: "internship", label: "Internship & Prep Progress", icon: Award },
          { id: "timeline", label: "Longitudinal Growth Graph", icon: TrendingUp },
          { id: "preferences", label: "Accommodations & Style", icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition duration-300 ${
                activeTab === tab.id
                  ? "border-[#00917C] text-[#00917C] font-bold"
                  : "border-transparent text-[#5C6485] hover:text-[#150E56]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Screen Body */}
      <div className="space-y-6">

        {/* ==================== TAB A: OVERVIEW ==================== */}
        {activeTab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-3">
            
            {/* Left/Middle Column: Strengths & Pathways */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Strength Layers List */}
              <div className="p-6 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay space-y-6">
                <h3 className="font-extrabold text-[#150E56] text-lg flex items-center gap-2">
                  <Award className="h-5 w-5 text-[#00917C]" /> Discovered Candidate Strengths
                </h3>
                
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* Technical Strengths */}
                  <div className="p-4 rounded-2xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 shadow-clayBtn">
                    <span className="text-xs uppercase tracking-wider text-[#5C6485] font-bold block">Technical Depth</span>
                    {profile.technical_strengths?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.technical_strengths.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded text-xs bg-[#00917C]/10 border border-[#00917C]/20 text-[#00917C] font-semibold">{s}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic block">No technical strengths logged.</span>
                    )}
                  </div>

                  {/* Transferable Strengths */}
                  <div className="p-4 rounded-2xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 shadow-clayBtn">
                    <span className="text-xs uppercase tracking-wider text-[#5C6485] font-bold block">Transferable Skills</span>
                    {profile.transferable_strengths?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.transferable_strengths.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded text-xs bg-purple-50 border border-purple-200 text-purple-700 font-semibold">{s}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic block">No transferable skills logged.</span>
                    )}
                  </div>

                  {/* Behavioral Strengths */}
                  <div className="p-4 rounded-2xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-3 shadow-clayBtn">
                    <span className="text-xs uppercase tracking-wider text-[#5C6485] font-bold block">Behavioral Strengths</span>
                    {profile.behavioral_strengths?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.behavioral_strengths.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">{s}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic block">No behavioral strengths logged.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Internship Pathway Recommendations */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-[0.2em] text-[#5C6485] font-bold">Recommended Internship Pathways</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  {pathwayMatches.map((path) => (
                    <div
                      key={path.name}
                      className="p-5 rounded-2xl border border-white bg-white/70 backdrop-blur-md shadow-clay flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${path.bg}`}>
                          {path.matchValue}% Fit Match
                        </span>
                        <h4 className="text-base font-bold text-[#150E56]">{path.name}</h4>
                        <p className="text-xs text-[#5C6485] leading-relaxed">{path.desc}</p>
                      </div>

                      {/* Matching Progress Gauge */}
                      <div className="mt-4 space-y-1">
                        <div className="h-1.5 w-full bg-[#FFF6F0] border border-[#150E56]/5 rounded-full overflow-hidden shadow-inner">
                          <div
                            className={`h-full bg-gradient-to-r ${path.color} rounded-full`}
                            style={{ width: `${path.matchValue}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Column: Historical Timelines and Learning Logs */}
            <div className="space-y-6">
              
              {/* Practice Timeline Logs */}
              <div className="p-6 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay flex flex-col h-[340px] overflow-hidden">
                <h3 className="font-extrabold text-[#150E56] text-lg mb-4 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-[#00917C]" /> Practice Session Logs
                </h3>
                
                {profile.learning_history?.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center text-xs">
                    <Activity className="h-8 w-8 text-slate-400 mb-2 animate-pulse" />
                    <span>No completed mock sessions yet.</span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 space-y-3" style={{ scrollbarWidth: 'none' }}>
                    {profile.learning_history.map((sess, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 hover:border-[#00917C]/30 transition flex items-center justify-between shadow-clayBtn">
                        <div>
                          <span className="text-[10px] text-[#5C6485] uppercase font-semibold">
                            {new Date(sess.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <strong className="text-xs text-[#150E56] mt-0.5 block">{sess.track}</strong>
                          <span className="text-[10px] text-[#5C6485] block mt-0.5">Partner: {sess.persona}</span>
                        </div>
                        <span className="text-[10px] text-[#00917C] font-bold bg-[#00917C]/10 px-2 py-0.5 rounded border border-[#00917C]/20 shadow-clayBtn">
                          Completed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* ==================== TAB B: INTERNSHIP & PREP PROGRESS ==================== */}
        {activeTab === "internship" && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left/Middle Column: Progress & Checklist */}
            <div className="lg:col-span-2 space-y-6">
              {/* Overall Progress Gauge and Phases */}
              <div className="p-6 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-extrabold text-[#150E56] text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[#00917C]" /> Overall Internship Progress
                  </h3>
                  <span className="text-lg font-black text-[#00917C]">65%</span>
                </div>
                
                {/* Visual Gauge */}
                <div className="h-4 w-full bg-[#FFF6F0]/80 rounded-full border border-[#150E56]/5 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-[#00917C] to-[#150E56] rounded-full transition-all duration-500"
                    style={{ width: "65%" }}
                  />
                </div>

                {/* Phase Breakdowns */}
                <div className="space-y-4 pt-2">
                  {[
                    { phase: "Phase 1: Onboarding & Compliance Setup", progress: 100, status: "Completed", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                    { phase: "Phase 2: Core Foundations Training", progress: 85, status: "In Progress", color: "text-[#00917C] bg-[#00917C]/5 border-[#00917C]/20" },
                    { phase: "Phase 3: Project Placement Mock Preparation", progress: 60, status: "In Progress", color: "text-[#00917C] bg-[#00917C]/5 border-[#00917C]/20" },
                    { phase: "Phase 4: Production Project Deployment", progress: 0, status: "Locked", color: "text-[#5C6485] bg-gray-50 border-gray-200" }
                  ].map((p, index) => (
                    <div key={index} className="p-4 rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-clayBtn">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-[#150E56]">{p.phase}</span>
                        <div className="h-1.5 w-48 bg-gray-200/60 rounded-full overflow-hidden">
                          <div className="h-full bg-[#00917C] rounded-full" style={{ width: `${p.progress}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-[#5C6485]">{p.progress}%</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-extrabold border ${p.color}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preparations Checklist */}
              <div className="p-6 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay space-y-6">
                <h3 className="font-extrabold text-[#150E56] text-lg flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-[#00917C]" /> Candidate Preparation Checklist
                </h3>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { task: "Pathway Discovery Session", progress: 100, desc: "Identify career fit tracks" },
                    { task: "Mock Interview Experience", progress: 100, desc: "Attempted custom mock workspace session" },
                    { task: "Neuro AI Prep Suite Tasks", progress: 66, desc: "Simulations and behavioral metrics" },
                    { task: "Canva Design Asset Task", progress: 100, desc: "Visual storytelling validation" },
                    { task: "Data Annotation Simulation", progress: 40, desc: "Labeling accuracy assessment" }
                  ].map((t, index) => (
                    <div key={index} className="p-4 rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/40 space-y-2 shadow-clayBtn">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-[#150E56]">{t.task}</span>
                        <span className="text-[10px] font-black text-[#00917C]">{t.progress}%</span>
                      </div>
                      <p className="text-[10px] text-[#5C6485]">{t.desc}</p>
                      <div className="h-1.5 w-full bg-gray-200/60 rounded-full overflow-hidden">
                        <div className="h-full bg-[#00917C] rounded-full" style={{ width: `${t.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Achievements & Badges */}
            <div className="space-y-6">
              <div className="p-6 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay space-y-6">
                <h3 className="font-extrabold text-[#150E56] text-lg flex items-center gap-2">
                  <Award className="h-5 w-5 text-[#00917C]" /> Earned Achievement Badges
                </h3>
                
                <div className="space-y-4">
                  {[
                    { badge: "Detail Specialist 🎯", desc: "For outstanding accuracy in data annotation simulations.", color: "bg-[#00917C]/10 text-[#00917C] border-[#00917C]/20" },
                    { badge: "Design Apprentice 🎨", desc: "Completed all creative design and Canva alignment templates.", color: "bg-purple-50 text-purple-700 border-purple-200" },
                    { badge: "Clarity Seeker 🔍", desc: "Demonstrated high growth in career interest clarity scores.", color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { badge: "Resilience Champion 💪", desc: "Maintained a strong practice streak in Mock Interviews.", color: "bg-amber-50 text-amber-700 border-amber-200" }
                  ].map((b, index) => (
                    <div key={index} className="p-4 rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/40 flex gap-3 shadow-clayBtn">
                      <div className="flex-1 space-y-1">
                        <span className="text-xs font-bold text-[#150E56] block">{b.badge}</span>
                        <p className="text-[10px] text-[#5C6485] leading-relaxed">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB C: LONGITUDINAL GROWTH GRAPH ==================== */}
        {activeTab === "timeline" && (
          <div className="p-6 md:p-8 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay space-y-8">
            <div>
              <h3 className="font-extrabold text-[#150E56] text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#00917C]" /> Longitudinal Growth Timeline
              </h3>
              <p className="text-xs text-[#5C6485] mt-1">Tracks development in self-expression, confidence, and career clarity across consecutive mock runs.</p>
            </div>

            {timeline.length < 2 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-slate-400 text-center">
                <Activity className="h-12 w-12 text-slate-400 mb-3 animate-pulse" />
                <p className="text-sm font-semibold text-[#150E56]">Multiple Sessions Required</p>
                <p className="text-xs text-[#5C6485] mt-1">Complete at least 2 Neuro AI mock sessions to draw your visual growth timelines.</p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* SVG Graph visualizer */}
                <div className="w-full bg-[#FFF6F0]/40 border border-[#150E56]/10 rounded-2xl p-4 overflow-x-auto shadow-clayBtn" style={{ scrollbarWidth: 'none' }}>
                  <svg viewBox="0 0 600 200" className="w-full max-w-[800px] h-[220px] mx-auto overflow-visible">
                    {/* Horizontal grid lines */}
                    <line x1="40" y1="20" x2="560" y2="20" stroke="rgba(21, 14, 86, 0.05)" strokeDasharray="3,3" />
                    <line x1="40" y1="65" x2="560" y2="65" stroke="rgba(21, 14, 86, 0.05)" strokeDasharray="3,3" />
                    <line x1="40" y1="110" x2="560" y2="110" stroke="rgba(21, 14, 86, 0.05)" strokeDasharray="3,3" />
                    <line x1="40" y1="155" x2="560" y2="155" stroke="rgba(21, 14, 86, 0.05)" strokeDasharray="3,3" />
                    
                    {/* Axis Labels */}
                    <text x="15" y="24" fill="#5C6485" fontSize="8" textAnchor="middle">High</text>
                    <text x="15" y="94" fill="#5C6485" fontSize="8" textAnchor="middle">Mid</text>
                    <text x="15" y="164" fill="#5C6485" fontSize="8" textAnchor="middle">Low</text>

                    {/* Chart lines */}
                    {chartSvgPath.confidence && (
                      <path d={chartSvgPath.confidence} fill="none" stroke="#00917C" strokeWidth="2.5" strokeLinecap="round" />
                    )}
                    {chartSvgPath.clarity && (
                      <path d={chartSvgPath.clarity} fill="none" stroke="#150E56" strokeWidth="2.5" strokeLinecap="round" />
                    )}
                    {chartSvgPath.expression && (
                      <path d={chartSvgPath.expression} fill="none" stroke="#FF7A59" strokeWidth="2.5" strokeLinecap="round" />
                    )}

                    {/* Render dots for each data node */}
                    {chartSvgPath.points?.confidence.map((p, i) => (
                      <circle key={`conf-${i}`} cx={p.x} cy={p.y} r="4" fill="#00917C" stroke="#fff" strokeWidth="1.5" className="shadow-sm" />
                    ))}
                    {chartSvgPath.points?.clarity.map((p, i) => (
                      <circle key={`clar-${i}`} cx={p.x} cy={p.y} r="4" fill="#150E56" stroke="#fff" strokeWidth="1.5" className="shadow-sm" />
                    ))}
                    {chartSvgPath.points?.expression.map((p, i) => (
                      <circle key={`expr-${i}`} cx={p.x} cy={p.y} r="4" fill="#FF7A59" stroke="#fff" strokeWidth="1.5" className="shadow-sm" />
                    ))}
                    
                    {/* Session Labels on Bottom Axis */}
                    {timeline.map((item, idx) => {
                      const width = 600;
                      const paddingX = 40;
                      const stepX = (width - paddingX * 2) / (timeline.length - 1);
                      const x = paddingX + idx * stepX;
                      return (
                        <text key={`lbl-${idx}`} x={x} y="190" fill="#5C6485" fontSize="8" textAnchor="middle" fontWeight="bold">
                          Run {idx + 1}
                        </text>
                      );
                    })}
                  </svg>
                </div>

                {/* Legend & Stats */}
                <div className="flex flex-wrap gap-6 justify-center pt-4 border-t border-[#150E56]/10">
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full bg-[#00917C]" />
                    <span className="text-xs font-semibold text-[#150E56]">Confidence Score</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full bg-[#150E56]" />
                    <span className="text-xs font-semibold text-[#150E56]">Career Clarity</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full bg-[#FF7A59]" />
                    <span className="text-xs font-semibold text-[#150E56]">Self-Expression / Engagement</span>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ==================== TAB D: PREFERENCES ==================== */}
        {activeTab === "preferences" && (
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Preferred Working Conditions */}
            <div className="p-6 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay space-y-4">
              <h3 className="font-extrabold text-[#150E56] text-lg flex items-center gap-2">
                <Heart className="h-5 w-5 text-[#00917C]" /> Working Style & Environment
              </h3>
              
              <div className="space-y-3.5">
                <div>
                  <span className="text-xs text-[#5C6485] uppercase font-bold">Communication Preference</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {profile.communication_preferences?.map((p) => (
                      <span key={p} className="px-2.5 py-1 rounded-xl text-xs bg-[#FFF6F0]/60 border border-[#150E56]/10 text-[#2C3454] shadow-clayBtn">{p}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-[#5C6485] uppercase font-bold">Working Style Preference</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {profile.working_style_preferences?.map((p) => (
                      <span key={p} className="px-2.5 py-1 rounded-xl text-xs bg-[#FFF6F0]/60 border border-[#150E56]/10 text-[#2C3454] shadow-clayBtn">{p}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-[#5C6485] uppercase font-bold">Environment Preference</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {profile.environment_preferences?.map((p) => (
                      <span key={p} className="px-2.5 py-1 rounded-xl text-xs bg-[#FFF6F0]/60 border border-[#150E56]/10 text-[#2C3454] shadow-clayBtn">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Supportive Accommodations */}
            <div className="p-6 rounded-[2rem] border border-white bg-white/70 backdrop-blur-md shadow-clay space-y-4">
              <h3 className="font-extrabold text-[#150E56] text-lg flex items-center gap-2">
                <Settings className="h-5 w-5 text-[#00917C]" /> Inclusive Support Accommodations
              </h3>

              <div className="space-y-4 text-xs text-[#2C3454]">
                <div className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-1 shadow-clayBtn">
                  <span className="font-bold text-[#00917C] uppercase tracking-wider block text-[10px]">Rephrasing Needs</span>
                  <p className="leading-relaxed">{profile.rephrasing_requirements || "No critical rephrasing accommodations logged."}</p>
                </div>

                <div className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-1 shadow-clayBtn">
                  <span className="font-bold text-[#150E56] uppercase tracking-wider block text-[10px]">Processing Latency Buffer</span>
                  <p className="leading-relaxed">{profile.processing_time_preferences || "Standard response time window applied."}</p>
                </div>

                <div className="p-4 rounded-xl bg-[#FFF6F0]/40 border border-[#150E56]/5 space-y-1 shadow-clayBtn">
                  <span className="font-bold text-[#FF7A59] uppercase tracking-wider block text-[10px]">Learning Styles</span>
                  <p className="leading-relaxed">{profile.example_based_learning_preferences || "Responds well to conventional mock coaching."}</p>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
