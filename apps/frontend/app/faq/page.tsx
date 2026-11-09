"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  HelpCircle, 
  Search, 
  Compass, 
  Grid, 
  Sparkles, 
  User, 
  Brain, 
  ChevronDown, 
  CheckCircle2,
  BookOpen,
  ArrowRight
} from "lucide-react";
import Sidebar from "../components/dashboard/Sidebar";
import Navbar from "../components/dashboard/Navbar";

interface FAQItem {
  id: string;
  category: "general" | "pathway" | "interview" | "neuroai" | "profile" | "intelligence";
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  // General Platform FAQs
  {
    id: "g1",
    category: "general",
    question: "What is JoBro 2.0?",
    answer: "JoBro 2.0 is an enterprise-grade multimodal AI mock interview, assessment, and career intelligence platform. It features interactive mock workspaces, automated profile generation, specialized neuro-inclusive tools, and dashboard analytics for candidate evaluation."
  },
  {
    id: "g2",
    category: "general",
    question: "How are role permissions handled on the platform?",
    answer: "JoBro 2.0 features Role-Based Access Control (RBAC). For example, Student accounts have access to the Dashboard, Pathway Selection, Mock Interviews, NeuroAI Prep, and Profiles. Founders, Admins, and Program Managers have additional access to the Interview Intelligence, Users, Permissions, and Analytics screens."
  },
  // Pathway Discovery AI FAQs
  {
    id: "p1",
    category: "pathway",
    question: "What is Pathway Discovery AI?",
    answer: "Pathway Discovery AI is a module designed to help candidates identify suitable career or internship pathways (such as Masterclass, GenAI Strategy, or Cloud Engineering). It analyzes candidate interests, educational background, and goals to suggest optimal structured learning tracks."
  },
  {
    id: "p2",
    category: "pathway",
    question: "How do I choose or update my suggested pathway?",
    answer: "You can navigate to the 'Pathway Discovery' page in the sidebar and complete a quick self-assessment or dialogue session. The AI uses the results to align your profile and recommend primary and secondary pathways."
  },
  // Interview AI FAQs
  {
    id: "i1",
    category: "interview",
    question: "How do I set up and start a mock interview?",
    answer: "Navigate to the 'Interview AI' page. You can select an interviewer persona (e.g., Senior Software Engineer, AI Architect, Product Manager), set the difficulty level (Easy, Medium, Hard), and upload a PDF resume or enter your CV text. The AI will tailor the case mix (70% case scenarios, 20% CV deep-dive, 10% theory) specifically to your profile."
  },
  {
    id: "i2",
    category: "interview",
    question: "Does the system support voice responses and narration?",
    answer: "Yes. In the mock workspace, you can enable Speech-to-Text (STT) to dictate your answers, or play back interviewer statements using Text-to-Speech (TTS). Additionally, you can launch Live Speech-to-Speech Mode (powered by Azure Speech Voice APIs) for a sub-second latency conversation with animated voice activity meters and real-time volume feedback."
  },
  // NeuroAI Prep FAQs
  {
    id: "n1",
    category: "neuroai",
    question: "What is NeuroAI Prep and what makes it unique?",
    answer: "NeuroAI Prep is a specialized neuro-inclusive interview preparation space. It features calm, warm, and highly supportive interviewer personas (such as Geethanjali and Panchali) and custom UI helpers. The AI asks single, simple questions, offers concrete examples when requested, and supports processing-time buffers to eliminate anxiety and ensure safety."
  },
  {
    id: "n2",
    category: "neuroai",
    question: "How can I import my CV/pitch into NeuroAI Prep?",
    answer: "You can use the 'Load CV & Self Pitch' quick-configuration button. It programmatically retrieves your latest saved resume text and pitch from the database so you don't have to upload or type them repeatedly."
  },
  // Intern Profile FAQs
  {
    id: "pr1",
    category: "profile",
    question: "What is the Intern Profile / Intern Understanding Engine (IUE)?",
    answer: "The IUE is a background service that parses transcripts, resume achievements, and self-pitches to compile a comprehensive profile. It tracks strengths (technical, behavioral, transferable), environmental preferences, accommodation needs, and long-term career aspirations."
  },
  {
    id: "pr2",
    category: "profile",
    question: "How does the system use vector databases to save my profile?",
    answer: "After a mock interview completes, the IUE compiles a character summary of your performance. The summary is embedded into a 1536-dimensional vector using OpenAI embeddings and saved in a Supabase pgvector table. This lets the system search similar profiles and generate highly customized coaching strategies."
  },
  {
    id: "pr3",
    category: "profile",
    question: "What are longitudinal growth timelines?",
    answer: "Every time you complete an interview session, the AI evaluates your self-expression, confidence, and career clarity. These scores are graphed over time on your dashboard to visualize your progress."
  },
  // Interview Intelligence FAQs
  {
    id: "it1",
    category: "intelligence",
    question: "What is the Interview Intelligence module?",
    answer: "It is an administrative intelligence center for Founders and Program Managers. It operates as a combined CRM and ATS dashboard, transforming long, 45-minute screening recordings into a 2-minute decision-making process by displaying AI-generated summaries, candidate tags, waitlist recommendations, and alert flags."
  },
  {
    id: "it2",
    category: "intelligence",
    question: "How does candidate search and tag extraction work?",
    answer: "The platform's AI pipeline automatically extracts tags (e.g., #VideoEditing, #NeuroAI, #DEI) based on transcript topics. Founders can perform text searches or filter by tag categories to locate high-potential candidates or waiting list leads instantly."
  }
];

const CATEGORIES = [
  { value: "all", label: "All Modules", icon: HelpCircle },
  { value: "general", label: "General", icon: BookOpen },
  { value: "pathway", label: "Pathway Discovery", icon: Compass },
  { value: "interview", label: "Interview AI", icon: Grid },
  { value: "neuroai", label: "NeuroAI Prep", icon: Sparkles },
  { value: "profile", label: "Intern Profile", icon: User },
  { value: "intelligence", label: "Intelligence", icon: Brain }
] as const;

export default function FAQPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const filteredFAQs = useMemo(() => {
    return FAQ_DATA.filter(faq => {
      const matchesCategory = selectedCategory === "all" || faq.category === selectedCategory;
      const matchesSearch = 
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="h-screen max-h-screen bg-transparent text-[#2C3454] overflow-hidden">
      {/* Background Grids */}
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25] pointer-events-none"></div>

      <div className="relative w-full flex h-screen max-h-screen overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onClose={() => setSidebarCollapsed(true)} />

        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <Navbar onToggle={() => setSidebarCollapsed((prev) => !prev)} />

          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8" style={{ scrollbarWidth: "none" }}>
            <div className="max-w-4xl mx-auto space-y-6 pb-12">
              
              {/* Header Title Banner */}
              <div className="space-y-2">
                <p className="text-xs uppercase font-extrabold tracking-[0.3em] text-[#00917C]">
                  Platform Help Center
                </p>
                <h1 className="text-3xl md:text-5xl font-black text-[#150E56] tracking-tight">
                  Frequently Asked Questions
                </h1>
                <p className="text-sm text-[#5C6485] max-w-2xl leading-relaxed">
                  Have questions about JoBro 2.0 modules? Explore the modules below, search for specific terms, or review the step-by-step FAQ guides.
                </p>
              </div>

              {/* Search & Categories Bar */}
              <div className="p-4 rounded-3xl bg-white/60 border border-[#150E56]/5 backdrop-blur-md shadow-clay space-y-4">
                {/* Search Input */}
                <div className="relative flex items-center rounded-2xl border border-[#150E56]/10 bg-[#FFF6F0]/45 px-4 py-3 text-[#5C6485] shadow-[inset_2px_2px_4px_rgba(180,160,150,0.05)] focus-within:border-[#00917C]/30 focus-within:bg-white transition-all duration-300">
                  <Search className="h-5 w-5 text-[#00917C] mr-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for questions, terms (e.g. vector, speech, Azure)..."
                    className="w-full bg-transparent text-sm font-semibold text-[#150E56] outline-none placeholder:text-[#5C6485]/60"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="text-xs font-bold text-[#5C6485] hover:text-[#150E56] transition"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Categories Tab Group */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = selectedCategory === cat.value;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setSelectedCategory(cat.value)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition duration-200 border ${
                          isSelected 
                            ? "bg-[#150E56] text-white border-transparent shadow-md"
                            : "bg-white text-[#5C6485] border-[#150E56]/5 hover:bg-[#FFF6F0]/50 hover:text-[#150E56]"
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-[#00917C]"}`} />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* FAQ Accordion List */}
              <div className="space-y-3">
                {filteredFAQs.length > 0 ? (
                  filteredFAQs.map((faq) => {
                    const isExpanded = !!expandedItems[faq.id];
                    const categoryObj = CATEGORIES.find(c => c.value === faq.category);
                    const CategoryIcon = categoryObj?.icon || HelpCircle;

                    return (
                      <div 
                        key={faq.id}
                        className="rounded-3xl border border-[#150E56]/5 bg-white/70 backdrop-blur-md overflow-hidden shadow-clay transition duration-300"
                      >
                        <button
                          onClick={() => toggleExpand(faq.id)}
                          className="w-full flex items-center justify-between p-5 text-left font-bold text-[#150E56] hover:bg-[#FFF6F0]/20 transition-colors"
                        >
                          <div className="flex items-start gap-3.5 pr-4">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#00917C]/10 text-[#00917C] flex-shrink-0 mt-0.5 border border-[#00917C]/5">
                              <CategoryIcon className="h-4 w-4" />
                            </span>
                            <span className="text-sm md:text-base font-extrabold tracking-tight pt-1 leading-snug">
                              {faq.question}
                            </span>
                          </div>
                          <ChevronDown 
                            className={`h-5 w-5 text-[#5C6485] transition-transform duration-300 flex-shrink-0 ${
                              isExpanded ? "transform rotate-180 text-[#00917C]" : ""
                            }`} 
                          />
                        </button>

                        <div 
                          className={`transition-all duration-300 ease-in-out overflow-hidden ${
                            isExpanded ? "max-h-[300px] border-t border-[#150E56]/5" : "max-h-0"
                          }`}
                        >
                          <div className="p-5 text-sm text-[#5C6485] leading-relaxed bg-[#FFF6F0]/20">
                            {faq.answer}
                            <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-[#00917C]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Verified Platform Module Information</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center p-12 rounded-3xl bg-white/40 border border-[#150E56]/5 backdrop-blur-md">
                    <p className="text-sm font-semibold text-[#5C6485]">No FAQ entries matches your search criteria.</p>
                    <button 
                      onClick={() => { setSelectedCategory("all"); setSearchQuery(""); }} 
                      className="mt-3 text-xs font-bold text-[#00917C] hover:underline"
                    >
                      Reset Search Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Call to Action Footer */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-[#150E56] to-[#00917C] text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-[#150E56]/10 mt-8">
                <div>
                  <h3 className="text-lg font-black tracking-tight">Need further help or custom configurations?</h3>
                  <p className="text-xs text-white/80 mt-1">Contact platform support or consult your assigned Program Manager.</p>
                </div>
                <a 
                  href="/" 
                  className="inline-flex items-center gap-2 self-start md:self-auto px-5 py-2.5 rounded-2xl bg-white text-[#150E56] hover:bg-[#FFF6F0] font-bold text-xs shadow-md transition duration-300"
                >
                  Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
