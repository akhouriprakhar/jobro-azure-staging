'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  BarChart3,
  ShieldCheck,
  Sparkles,
  UserCheck,
  BookOpen,
  Award,
  FileText,
  CheckCircle2,
  Clock,
  Calendar,
  ChevronRight,
  X,
  ArrowUpRight,
  Loader2,
  Compass,
  Brain
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import DashboardCard from './DashboardCard';
import LoadingScreen from '../LoadingScreen';

// Simulated courses list as requested
const courses = [
  { title: 'Jobro Interview Masterclass', category: 'Behavioral & Core', progress: 100, completed: true, rating: 'Excellent' },
  { title: 'Enterprise AI & GenAI Strategy', category: 'Technical Strategy', progress: 65, completed: false, rating: 'In Progress' },
  { title: 'Multimodal Architectures & Cloud Scales', category: 'Cloud Engineering', progress: 15, completed: false, rating: 'Just Started' }
];

const getApiUrl = (path: string) => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:8000${path}`;
    }
  }
  return path;
};

export default function DashboardShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);
  const [userRole, setUserRole] = useState<'Admin' | 'Student' | 'New Lead'>('New Lead');
  const [userName, setUserName] = useState<string>('Candidate');
  const [candidateId, setCandidateId] = useState<string>('');

  // Student metrics
  const [history, setHistory] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  // Admin stats
  const [adminStats, setAdminStats] = useState({
    activeUsers: '0',
    totalSessions: '0',
    pathwayDiscoverySessions: '0',
    neuroaiPrepSessions: '0',
    policyCoverage: '78%',
    newApprovals: '24'
  });

  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // 1. Get current session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        setCandidateId(session.user.id);
        const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Rahul';
        setUserName(name);

        // 2. Fetch role mapping
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('roles(name)')
          .eq('user_id', session.user.id)
          .single();

        const detectedRole = (userRoles as any)?.roles?.name || 'New Lead';
        setUserRole(detectedRole === 'Admin' || detectedRole === 'Founder' ? 'Admin' : detectedRole === 'Student' ? 'Student' : 'New Lead');

        if (detectedRole === 'Admin' || detectedRole === 'Founder') {
          // --- ADMIN VIEW METRICS ---
          // Fetch exact registered user count from Supabase profiles
          const { count: usersCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

          // Fetch exact sessions count from interviews table
          const { count: sessionsCount } = await supabase
            .from('interviews')
            .select('*', { count: 'exact', head: true });

          // Fetch exact pathway discovery sessions count from interviews table
          const { count: pathwayCount } = await supabase
            .from('interviews')
            .select('*', { count: 'exact', head: true })
            .ilike('interview_mode', '%pathway%');

          // Fetch exact neuroai prep sessions count from interviews table
          const { count: neuroaiCount } = await supabase
            .from('interviews')
            .select('*', { count: 'exact', head: true })
            .ilike('interview_mode', '%neuro%');

          setAdminStats({
            activeUsers: String(usersCount || 0),
            totalSessions: String(sessionsCount || 0),
            pathwayDiscoverySessions: String(pathwayCount || 0),
            neuroaiPrepSessions: String(neuroaiCount || 0),
            policyCoverage: '94%',
            newApprovals: '8'
          });

          // Fetch recent mock session logs
          const { data: recentInterviews } = await supabase
            .from('interviews')
            .select('id, created_at, interview_mode, interviewer_persona')
            .order('created_at', { ascending: false })
            .limit(3);

          if (recentInterviews) {
            const mapped = recentInterviews.map((item: any, idx: number) => ({
              time: formatTimeAgo(item.created_at),
              message: `New interview started: ${item.interview_mode || 'General'} (${item.interviewer_persona || 'AI Recruiter'})`,
              variant: idx % 2 === 0 ? 'cyan' : 'violet'
            }));
            setRecentActivities(mapped);
          } else {
            setRecentActivities([
              { time: 'Live', message: 'Ready to receive interview logs', variant: 'slate' }
            ]);
          }
        } else {
          // --- STUDENT VIEW METRICS ---
          const response = await fetch(getApiUrl(`/api/v1/interview/history/${session.user.id}`));
          if (response.ok) {
            const data = await response.json();
            setHistory(data);
          }
        }
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHrs = Math.floor(diffMin / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const getAverageScore = (item: any) => {
    const scores = [
      item.technical_depth_score,
      item.communication_score,
      item.leadership_score,
      item.problem_solving_score,
      item.confidence_score
    ].filter(s => s !== null && s !== undefined);

    if (scores.length === 0) return 80; // default/simulation fallback
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  // Compute overall candidate averages
  const computedAverages = (() => {
    if (history.length === 0) return {
      tech: 0, problem: 0, comms: 0, leader: 0, confidence: 0, overall: 0
    };

    let techTotal = 0, problemTotal = 0, commsTotal = 0, leaderTotal = 0, confidenceTotal = 0;
    let count = 0;

    history.forEach(item => {
      if (item.technical_depth_score !== null && item.technical_depth_score !== undefined) {
        techTotal += item.technical_depth_score;
        problemTotal += item.problem_solving_score || 80;
        commsTotal += item.communication_score || 80;
        leaderTotal += item.leadership_score || 80;
        confidenceTotal += item.confidence_score || 80;
        count++;
      }
    });

    if (count === 0) return { tech: 88, problem: 86, comms: 84, leader: 80, confidence: 85, overall: 85 };

    return {
      tech: Math.round(techTotal / count),
      problem: Math.round(problemTotal / count),
      comms: Math.round(commsTotal / count),
      leader: Math.round(leaderTotal / count),
      confidence: Math.round(confidenceTotal / count),
      overall: Math.round((techTotal + problemTotal + commsTotal + leaderTotal + confidenceTotal) / (count * 5))
    };
  })();

  const formatFeedbackMarkdown = (text: string): string => {
    if (!text) return '';
    let html = text;
    // Replace headers
    html = html.replace(/### (.*?)\n/g, '<h4 class="text-[#150E56] font-bold text-lg mt-4 mb-2">$1</h4>');
    html = html.replace(/## (.*?)\n/g, '<h3 class="text-[#00917C] font-black text-xl mt-5 mb-3 border-b border-[#150E56]/5 pb-1">$1</h3>');
    html = html.replace(/# (.*?)\n/g, '<h2 class="text-[#150E56] font-black text-2xl mt-6 mb-4">$1</h2>');
    // Replace bullet lists
    html = html.replace(/- (.*?)\n/g, '<li class="ml-4 list-disc text-[#2C3454] my-1">$1</li>');
    // Replace bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-[#150E56] font-bold">$1</strong>');
    // Replace linebreaks
    html = html.replace(/\n\n/g, '<br/>');
    return html;
  };

  if (loading) {
    return <LoadingScreen message="Loading user workspace..." />;
  }

  return (
    <div className="h-screen max-h-screen bg-transparent text-[#2C3454] overflow-hidden">
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25]"></div>
      <div className="relative w-full flex h-screen max-h-screen overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onClose={() => setSidebarCollapsed(true)} />

        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <Navbar onToggle={() => setSidebarCollapsed((prev) => !prev)} />

          <motion.main
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="flex-1 overflow-y-auto px-4 py-6 md:px-6"
          >
            {/* Greeting Header */}
            <section className="space-y-4 pb-6 md:flex md:items-end md:justify-between md:space-y-0">
              <div>
                <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#00917C]">
                  {userRole === 'Admin' ? 'Management Dashboard' : 'Student Learning Hub'}
                </p>

              </div>
              <div className="inline-flex items-center gap-3 rounded-[2rem] border border-white bg-white/75 px-4 py-3 shadow-clay">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#00917C]/15 text-[#00917C] font-bold uppercase border border-[#00917C]/10">
                  {userName.substring(0, 2)}
                </span>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[#5C6485]">Logged in as</p>
                  <p className="text-sm font-black text-[#150E56]">{userName} ({userRole})</p>
                </div>
              </div>
            </section>

            {/* -------------------- VIEW A: ADMIN DASHBOARD -------------------- */}
            {userRole === 'Admin' ? (
              <>
                <section className="grid gap-6 pt-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  <DashboardCard label="Active Users" value={adminStats.activeUsers} icon={UserCheck} description="Active candidates and enterprise stakeholders in the system." />
                  <DashboardCard label="Mock Sessions Conducted" value={adminStats.totalSessions} icon={Activity} description="Enterprise-grade monitoring for permissions and operations." />
                  <DashboardCard label="Pathway Discovery Sessions" value={adminStats.pathwayDiscoverySessions} icon={Compass} description="Completed cognitive signal and career track discoveries." />
                  <DashboardCard label="NeuroAI Prep Sessions" value={adminStats.neuroaiPrepSessions} icon={Brain} description="Coaching simulations for cohort and internship readiness." />
                  <DashboardCard label="Policy & Compliance" value={adminStats.policyCoverage} icon={ShieldCheck} description="Granular user roles & policy compliance tracking." />
                  <DashboardCard label="Pending Privileges" value={adminStats.newApprovals} icon={Sparkles} description="Recent role modifications pending administrator review." />
                </section>

                <section className="mt-6 grid gap-6 lg:grid-cols-[1.5fr,1fr]">
                  {/* Service Card Grid */}
                  <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#5C6485]">Active services</p>
                        <h2 className="mt-2 text-2xl font-extrabold text-[#150E56]">Platform Services</h2>
                      </div>
                      <span className="rounded-full bg-[#00917C]/10 border border-[#00917C]/15 px-3 py-1 text-xs font-bold text-[#00917C]">Operational</span>
                    </div>

                    <div className="mt-6 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-[1.75rem] border border-[#150E56]/5 bg-[#FFF6F0]/60 p-5 shadow-clayBtn hover:shadow-clayBtnHover transition duration-200">
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C]">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <h3 className="mt-4 text-base font-black text-[#150E56]">Interview AI</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[#5C6485]">Multimodal interview coaching engines</p>
                        <p className="mt-4 text-[9px] uppercase font-bold tracking-[0.2em] text-[#150E56]/60">FastAPI Model</p>
                      </div>

                      <div className="rounded-[1.75rem] border border-[#150E56]/5 bg-[#FFF6F0]/60 p-5 shadow-clayBtn hover:shadow-clayBtnHover transition duration-200">
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C]">
                          <BarChart3 className="h-5 w-5" />
                        </div>
                        <h3 className="mt-4 text-base font-black text-[#150E56]">Analytics</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[#5C6485]">Realtime activity & scoring analytics</p>
                        <p className="mt-4 text-[9px] uppercase font-bold tracking-[0.2em] text-[#150E56]/60">PostgreSQL DB</p>
                      </div>

                      <div className="rounded-[1.75rem] border border-[#150E56]/5 bg-[#FFF6F0]/60 p-5 shadow-clayBtn hover:shadow-clayBtnHover transition duration-200">
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C]">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <h3 className="mt-4 text-base font-black text-[#150E56]">RBAC System</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[#5C6485]">Granular user roles & policy constraints</p>
                        <p className="mt-4 text-[9px] uppercase font-bold tracking-[0.2em] text-[#150E56]/60">Supabase Auth</p>
                      </div>

                      <div className="rounded-[1.75rem] border border-[#150E56]/5 bg-[#FFF6F0]/60 p-5 shadow-clayBtn hover:shadow-clayBtnHover transition duration-200">
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C]">
                          <Compass className="h-5 w-5" />
                        </div>
                        <h3 className="mt-4 text-base font-black text-[#150E56]">Pathway Selection</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[#5C6485]">Cognitive matching & career recommendations</p>
                        <p className="mt-4 text-[9px] uppercase font-bold tracking-[0.2em] text-[#150E56]/60">OpenAI / RAG</p>
                      </div>

                      <div className="rounded-[1.75rem] border border-[#150E56]/5 bg-[#FFF6F0]/60 p-5 shadow-clayBtn hover:shadow-clayBtnHover transition duration-200">
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C]">
                          <Brain className="h-5 w-5" />
                        </div>
                        <h3 className="mt-4 text-base font-black text-[#150E56]">Neuro AI Prep</h3>
                        <p className="mt-2 text-xs leading-relaxed text-[#5C6485]">Supportive practice & cohort coaching</p>
                        <p className="mt-4 text-[9px] uppercase font-bold tracking-[0.2em] text-[#150E56]/60">Realtime Voice</p>
                      </div>
                    </div>
                  </div>

                  {/* Audit Feed */}
                  <div className="space-y-4 rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#5C6485]">Audit Feed</p>
                        <h2 className="mt-2 text-2xl font-extrabold text-[#150E56]">Live Platform Events</h2>
                      </div>
                      <span className="rounded-full bg-[#150E56]/10 px-3 py-1 text-xs font-bold text-[#150E56]">Active</span>
                    </div>
                    <div className="space-y-4">
                      {recentActivities.map((event, idx) => (
                        <div key={idx} className="rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/40 p-4 shadow-clayBtn">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-bold text-[#5C6485]">{event.time}</p>
                            <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase ${event.variant === 'cyan' ? 'bg-[#00917C]/10 text-[#00917C]' : 'bg-[#150E56]/10 text-[#150E56]'}`}>
                              {event.variant === 'cyan' ? 'system' : 'user'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-[#2C3454] font-medium">{event.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            ) : (
              // -------------------- VIEW B: STUDENT DASHBOARD --------------------
              <>
                {/* Metrics Cards */}
                <section className="grid gap-6 pt-4 grid-cols-1 md:grid-cols-3">
                  <div className="rounded-[2.25rem] border border-white bg-white/70 backdrop-blur-md p-6 shadow-clay relative overflow-hidden hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5">
                    <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-[#00917C]/5 blur-xl"></div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Completed Sessions</p>
                      <div className="rounded-2xl bg-[#00917C]/10 p-2.5 text-[#00917C] border border-[#00917C]/10">
                        <Activity className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="mt-4 text-4xl font-extrabold text-[#150E56]">{history.length}</h3>
                    <p className="mt-2 text-xs text-[#5C6485]/80">Completed mock interview sessions</p>
                  </div>

                  <div className="rounded-[2.25rem] border border-white bg-white/70 backdrop-blur-md p-6 shadow-clay relative overflow-hidden hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5">
                    <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-[#150E56]/5 blur-xl"></div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Average Evaluation Score</p>
                      <div className="rounded-2xl bg-[#150E56]/10 p-2.5 text-[#150E56] border border-[#150E56]/10">
                        <Sparkles className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="mt-4 text-4xl font-extrabold text-[#150E56]">
                      {history.length > 0 ? `${computedAverages.overall}%` : 'N/A'}
                    </h3>
                    <p className="mt-2 text-xs text-[#5C6485]/80">Across all completed assessments</p>
                  </div>

                  <div className="rounded-[2.25rem] border border-white bg-white/70 backdrop-blur-md p-6 shadow-clay relative overflow-hidden hover:shadow-clayBtnHover transition-all duration-300 hover:-translate-y-0.5">
                    <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-[#00917C]/5 blur-xl"></div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Course Progressions</p>
                      <div className="rounded-2xl bg-[#00917C]/10 p-2.5 text-[#00917C] border border-[#00917C]/10">
                        <BookOpen className="h-5 w-5" />
                      </div>
                    </div>
                    <h3 className="mt-4 text-4xl font-extrabold text-[#150E56]">
                      {courses.filter(c => c.completed).length} / {courses.length}
                    </h3>
                    <p className="mt-2 text-xs text-[#5C6485]/80">Active learning pathways completed</p>
                  </div>
                </section>

                {/* Main Content Grid for Student */}
                <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr,1fr]">

                  {/* Left Column: Interview History Timeline */}
                  <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#00917C]">Sessions Log</p>
                        <h2 className="text-2xl font-extrabold text-[#150E56] mt-1">Mock Interview History</h2>
                      </div>
                    </div>

                    {history.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center bg-[#FFF6F0]/40 border border-[#150E56]/5 rounded-3xl p-6 shadow-clayBtn">
                        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white border border-[#150E56]/10 text-[#150E56] shadow-clayBtn mb-4">
                          <FileText className="h-8 w-8 text-[#00917C]" />
                        </div>
                        <h3 className="text-lg font-black text-[#150E56]">Welcome to Orchvate!</h3>
                        <p className="text-xs md:text-sm text-[#5C6485] mt-2 max-w-md leading-relaxed">
                          To get started, we highly recommend completing the Pathway Selection AI assessment to discover your ideal learning and employment path.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-4 justify-center">
                          <button
                            onClick={() => window.location.href = '/pathway-selection'}
                            className="inline-flex items-center gap-2 rounded-3xl bg-[#00917C] hover:bg-[#007a68] text-white font-bold px-6 py-3.5 text-xs shadow-md shadow-[#00917C]/15 transition duration-200 active:scale-95 cursor-pointer"
                          >
                            Begin Pathway Discovery <ArrowUpRight className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => window.location.href = '/interview'}
                            className="inline-flex items-center gap-2 rounded-3xl bg-white border border-[#150E56]/10 text-[#150E56] font-bold px-6 py-3.5 text-xs shadow-clayBtn hover:shadow-clayBtnHover hover:bg-[#FFF6F0]/50 transition duration-200 active:scale-95 cursor-pointer"
                          >
                            Mock Interview AI
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/20 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-[#150E56]/10 bg-[#FFF6F0]/40 text-[10px] uppercase font-bold tracking-wider text-[#5C6485]">
                              <th className="p-4 font-bold">Date & Time</th>
                              <th className="p-4 font-bold">Mode / Persona</th>
                              <th className="p-4 font-bold">Overall Rating</th>
                              <th className="p-4 font-bold text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#150E56]/5">
                            {history.map((session, index) => {
                              const avgScore = getAverageScore(session);
                              return (
                                <tr key={session.id} className="text-xs text-[#2C3454] hover:bg-[#FFF6F0]/40 transition duration-200">
                                  <td className="p-4 font-semibold">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4 text-[#00917C]" />
                                      <span>
                                        {new Date(session.created_at).toLocaleDateString(undefined, {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric'
                                        })}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <div>
                                      <p className="font-extrabold text-[#150E56]">{session.interview_mode || 'General Prep'}</p>
                                      <p className="text-[10px] text-[#5C6485] mt-0.5">
                                        {session.interviewer_persona || 'AI Agent'}
                                        {session.difficulty_level && ` • ${session.difficulty_level}`}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-block h-2 w-2 rounded-full ${avgScore >= 85 ? 'bg-[#00917C]' : avgScore >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                                      <span className="font-bold text-[#150E56]">{avgScore}%</span>
                                    </div>
                                  </td>
                                  <td className="p-4 text-right">
                                    <button
                                      onClick={() => setSelectedReport(session)}
                                      className="inline-flex items-center gap-1 text-xs font-bold text-[#00917C] hover:text-[#007a68] transition"
                                    >
                                      View Report <ChevronRight className="h-3 w-3" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Competencies & Course Completions */}
                  <div className="space-y-6">
                    {/* Competency breakdown */}
                    {history.length > 0 && (
                      <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md">
                        <h2 className="text-xl font-extrabold text-[#150E56] mb-4">Competency Breakdown</h2>
                        <div className="space-y-4">
                          {[
                            { label: 'Technical Depth', val: computedAverages.tech, color: 'bg-gradient-to-r from-[#00917C] to-[#00917C]/70' },
                            { label: 'Problem Solving', val: computedAverages.problem, color: 'bg-gradient-to-r from-[#150E56] to-[#150E56]/70' },
                            { label: 'Communication', val: computedAverages.comms, color: 'bg-gradient-to-r from-[#00917C] to-[#150E56]' },
                            { label: 'Leadership skills', val: computedAverages.leader, color: 'bg-gradient-to-r from-amber-500 to-amber-500/70' },
                            { label: 'Confidence & Demeanor', val: computedAverages.confidence, color: 'bg-gradient-to-r from-pink-500 to-pink-500/70' }
                          ].map((comp) => (
                            <div key={comp.label} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[#5C6485] font-semibold">{comp.label}</span>
                                <span className="font-extrabold text-[#150E56]">{comp.val}%</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-[#FFF6F0] border border-[#150E56]/5 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${comp.val}%` }}
                                  transition={{ duration: 0.8, ease: 'easeOut' }}
                                  className={`h-full rounded-full ${comp.color}`}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Course Completions */}
                    <div className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-extrabold text-[#150E56]">Course Completions</h2>
                        <span className="rounded-full bg-[#00917C]/10 border border-[#00917C]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#00917C]">Modules</span>
                      </div>
                      <div className="space-y-4">
                        {courses.map((course, idx) => (
                          <div key={idx} className="rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/55 p-4 shadow-clayBtn relative overflow-hidden">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[9px] text-[#5C6485]/80 font-bold uppercase tracking-wider">{course.category}</p>
                                <h4 className="text-xs font-black text-[#150E56] mt-1">{course.title}</h4>
                              </div>
                              {course.completed ? (
                                <span className="text-[#00917C]" title="Completed"><CheckCircle2 className="h-5 w-5" /></span>
                              ) : (
                                <span className="text-[#150E56] text-[9px] font-bold bg-white border border-[#150E56]/10 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-clayBtn">
                                  <Clock className="h-3 w-3 text-[#00917C]" /> {course.progress}%
                                </span>
                              )}
                            </div>
                            <div className="mt-3.5 h-1.5 w-full rounded-full bg-white border border-[#150E56]/5 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
                              <div className={`h-full rounded-full ${course.completed ? 'bg-[#00917C]' : 'bg-[#150E56]'}`} style={{ width: `${course.progress}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.main>
        </div>
      </div>

      {/* DETAILED REPORT DRAWER/MODAL */}
      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#150E56]/35 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="relative w-full max-w-4xl h-[85vh] rounded-[3.25rem] border border-white bg-white/90 backdrop-blur-md shadow-2xl p-6 md:p-8 flex flex-col"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedReport(null)}
                className="absolute top-6 right-6 h-10 w-10 inline-flex items-center justify-center rounded-2xl border border-[#150E56]/10 bg-white text-[#150E56] hover:bg-[#FFF6F0]/80 shadow-clayBtn hover:shadow-clayBtnHover transition"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Modal Header */}
              <div className="pb-6 border-b border-[#150E56]/10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#00917C]/10 border border-[#00917C]/15 px-3 py-1 text-[10px] font-bold text-[#00917C] uppercase tracking-widest">
                    Assessment Card
                  </span>
                  {selectedReport.difficulty_level && (
                    <span className="rounded-full bg-[#150E56]/10 border border-[#150E56]/15 px-3 py-1 text-[10px] font-bold text-[#150E56] uppercase tracking-widest">
                      {selectedReport.difficulty_level}
                    </span>
                  )}
                </div>
                <h2 className="text-3xl font-black text-[#150E56] mt-3">{selectedReport.interview_mode || 'General Mock session'}</h2>
                <p className="text-xs text-[#5C6485] mt-1 font-semibold">Conducted on {new Date(selectedReport.created_at).toLocaleString()}</p>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto pr-2 py-6 space-y-6 scrollbar-thin">
                {/* Scores breakdown */}
                <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                  {[
                    { label: 'Technical Depth', val: selectedReport.technical_depth_score || 80, bg: 'bg-[#FFF6F0]/50 border-[#00917C]/20 text-[#00917C]' },
                    { label: 'Problem Solving', val: selectedReport.problem_solving_score || 80, bg: 'bg-[#FFF6F0]/50 border-[#150E56]/20 text-[#150E56]' },
                    { label: 'Communication', val: selectedReport.communication_score || 80, bg: 'bg-[#FFF6F0]/50 border-[#00917C]/20 text-[#00917C]' },
                    { label: 'Leadership', val: selectedReport.leadership_score || 80, bg: 'bg-[#FFF6F0]/50 border-amber-500/20 text-amber-600' },
                    { label: 'Confidence', val: selectedReport.confidence_score || 80, bg: 'bg-[#FFF6F0]/50 border-pink-500/20 text-pink-600' },
                  ].map((card) => (
                    <div key={card.label} className={`rounded-2xl border ${card.bg} p-3.5 text-center shadow-clayBtn`}>
                      <p className="text-[10px] uppercase tracking-wider text-[#5C6485] font-bold">{card.label}</p>
                      <p className="text-2xl font-black mt-1.5">{card.val}%</p>
                    </div>
                  ))}
                </div>

                {/* Areas for Improvement */}
                {selectedReport.areas_for_improvement && selectedReport.areas_for_improvement.length > 0 && (
                  <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-5 text-red-900">
                    <h3 className="text-red-700 font-bold text-base mb-2">💡 Crucial Areas for Improvement</h3>
                    <ul className="list-disc pl-5 text-xs text-red-900/90 space-y-1 font-semibold">
                      {selectedReport.areas_for_improvement.map((area: string, idx: number) => (
                        <li key={idx}>{area}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detailed Feedback Text */}
                <div
                  className="prose prose-slate max-w-none text-[#2C3454] leading-relaxed text-xs md:text-sm"
                  dangerouslySetInnerHTML={{ __html: formatFeedbackMarkdown(selectedReport.detailed_feedback || '# Assessment Details') }}
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-[#150E56]/10 flex justify-end">
                <button
                  onClick={() => setSelectedReport(null)}
                  className="rounded-3xl bg-[#00917C] hover:bg-[#007a68] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#00917C]/15 transition duration-200 active:scale-95"
                >
                  Close Feedback Card
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
