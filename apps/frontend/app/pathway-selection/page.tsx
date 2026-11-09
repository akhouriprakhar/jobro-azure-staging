"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../components/dashboard/Sidebar";
import Navbar from "../components/dashboard/Navbar";
import ConsentManager from "../components/pathway-selection-ai/consent-manager/ConsentManager";
import InterviewWorkspace from "../components/pathway-selection-ai/interview-workspace/InterviewWorkspace";
import PathwayResults from "../components/pathway-selection-ai/pathway-results/PathwayResults";
import { ClipboardList, ArrowRight, User, Mail, Link as LinkIcon } from "lucide-react";

export default function PathwaySelectionPage() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [candidateId, setCandidateId] = useState("cand-temp-999");
    const [userName, setUserName] = useState("Candidate");

    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            setSidebarCollapsed(true);
        }
        const fetchSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.id) {
                    setCandidateId(session.user.id);
                    
                    let emailName = "";
                    if (session.user.email) {
                        const prefix = session.user.email.split("@")[0];
                        emailName = prefix
                            .split(/[._-]/)
                            .map(word => word.replace(/\d+/g, ""))
                            .filter(Boolean)
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(" ");
                    }
                    const defaultName = session.user.user_metadata?.full_name || emailName || "Candidate";
                    setUserName(defaultName);
                    
                    setFormData(prev => ({
                        ...prev,
                        full_name: defaultName
                    }));

                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", session.user.id)
                        .single();

                    if (profile) {
                        setFormData(prev => ({
                            ...prev,
                            full_name: profile.full_name || prev.full_name
                        }));
                    }
                }
            } catch (err) {
                console.warn("Could not retrieve session logs:", err);
            }
        };
        fetchSession();
    }, []);

    // Session Unique ID for the Pathway Interview run
    const [sessionId] = useState(() => {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `pathway-session-${Date.now()}`;
    });

    // Workflow step: 1: Registration Form, 2: Consent Checkbox, 3: Active Workspace chat, 4: Results
    const [step, setStep] = useState(1);

    // Registration state values
    const [formData, setFormData] = useState({
        full_name: "",
        age: "",
        location: "",
        education: "",
        preferred_language: "English",
        interests: "",
        career_aspirations: "",
        employment_status: "",
        self_introduction: "",
        linkedin: "",
        github: "",
        behance: "",
        canva: "",
        portfolio: ""
    });

    // Post-assessment results state values
    const [results, setResults] = useState<{
        primaryPathway: string;
        secondaryPathway: string;
        scores: Record<string, number>;
        evidence: string;
    } | null>(null);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Fallback default name if empty
        if (!formData.full_name) formData.full_name = userName;
        setStep(2);
    };

    const handleAutoFill = () => {
        const interestsList = [
            "Coding simple apps, watching sci-fi movies, and reading biography books.",
            "Creating digital art in Canva, photography, and running social media fan pages.",
            "Data entries, sorting physical and digital files, and playing strategy video games.",
            "Creative writing, listening to educational podcasts, and community volunteering."
        ];
        
        const aspirationsList = [
            "To build accessible, neuro-inclusive software solutions.",
            "To specialize in creative designing, Canva production, and marketing campaigns.",
            "To gain high expertise in structured data annotation and database systems.",
            "To work as a research analyst or administrative facilitator."
        ];
        
        const introsList = [
            "Hello, I am enthusiastic about computer software and learning new digital skills. I want to build a career in technology.",
            "Hi there! I am a creative soul who enjoys visual designs, graphics, and layout setups. I am eager to learn business pathways.",
            "Hello! I am a structured and organized individual who likes dealing with numbers, files, and annotations. I am hoping to get assigned to data operations.",
            "Greetings! I am a passionate learner looking to acquire key skills to prepare for professional job roles and employment tracks."
        ];

        setFormData(prev => ({
            ...prev,
            interests: interestsList[Math.floor(Math.random() * interestsList.length)],
            career_aspirations: aspirationsList[Math.floor(Math.random() * aspirationsList.length)],
            self_introduction: introsList[Math.floor(Math.random() * introsList.length)]
        }));
    };

    const handleConsentSubmit = async (consents: any) => {
        // Save consent status to backend
        try {
            const apiurl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" 
                ? "http://localhost:8000/api/v1/pathway-selection/consent"
                : "/api/v1/pathway-selection/consent";

            await fetch(apiurl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: candidateId,
                    timestamp: new Date().toISOString(),
                    consent_status: consents.video && consents.audio && consents.transcript && consents.ai
                })
            });
        } catch (e) {
            console.warn("Consent save fallback:", e);
        }
        setStep(3);
    };

    const handleAssessmentFinished = (outcome: any) => {
        setResults(outcome);
        setStep(4);
    };

    return (
        <div className="h-screen max-h-screen bg-transparent text-[#2C3454] overflow-hidden">
            <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25]"></div>
            
            <div className="relative w-full flex h-screen max-h-screen overflow-hidden">
                <Sidebar collapsed={sidebarCollapsed} onClose={() => setSidebarCollapsed(true)} />

                <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
                    <Navbar onToggle={() => setSidebarCollapsed((prev) => !prev)} />

                    <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
                        <AnimatePresence mode="wait">
                            
                            {/* Step 1: Onboarding Registration Fields */}
                            {step === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -15 }}
                                    className="w-full max-w-4xl mx-auto rounded-[2.75rem] border border-white bg-white/70 p-6 md:p-10 backdrop-blur-md shadow-clay space-y-6"
                                >
                                    <div className="text-center space-y-3">
                                        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/15 mb-2">
                                            <ClipboardList className="h-7 w-7" />
                                        </div>
                                        <h1 className="text-3xl font-black text-[#150E56]">Candidate Registration</h1>
                                        <p className="text-[#5C6485] text-xs md:text-sm max-w-lg mx-auto leading-relaxed">
                                            Let's start by gathering your profile baseline context to customize your pathway discovery interview.
                                        </p>
                                    </div>

                                    <form onSubmit={handleFormSubmit} className="space-y-6">
                                        
                                        {/* Core Inputs Grid */}
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Full Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder={userName}
                                                    value={formData.full_name}
                                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Age Group</label>
                                                <select
                                                    required
                                                    value={formData.age}
                                                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                >
                                                    <option value="">Choose age brackets...</option>
                                                    <option value="18-21">18-21 years</option>
                                                    <option value="22-25">22-25 years</option>
                                                    <option value="26-30">26-30 years</option>
                                                    <option value="31+">31+ years</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Location (State/Region)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="e.g. Kerala, Delhi NCR"
                                                    value={formData.location}
                                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Highest Education Level</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="e.g. Bachelor's in CS, High School"
                                                    value={formData.education}
                                                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Preferred Language</label>
                                                <select
                                                    value={formData.preferred_language}
                                                    onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                >
                                                    <option value="English">English</option>
                                                    <option value="Malayalam">Malayalam</option>
                                                    <option value="Hindi">Hindi</option>
                                                    <option value="Tamil">Tamil</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Employment Status</label>
                                                <select
                                                    required
                                                    value={formData.employment_status}
                                                    onChange={(e) => setFormData({ ...formData, employment_status: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                >
                                                    <option value="">Choose status...</option>
                                                    <option value="Seeking Employment">Seeking Employment</option>
                                                    <option value="Student">Student</option>
                                                    <option value="Unemployed">Part-time / Intern</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Long Texts */}
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Interests & Hobbies</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="What activities do you enjoy?"
                                                    value={formData.interests}
                                                    onChange={(e) => setFormData({ ...formData, interests: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Career Aspirations</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="What kind of work excites you?"
                                                    value={formData.career_aspirations}
                                                    onChange={(e) => setFormData({ ...formData, career_aspirations: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-[#5C6485] uppercase tracking-wider">Self Introduction</label>
                                                <textarea
                                                    required
                                                    rows={3}
                                                    placeholder="Introduce yourself to the welcome agent..."
                                                    value={formData.self_introduction}
                                                    onChange={(e) => setFormData({ ...formData, self_introduction: e.target.value })}
                                                    className="w-full bg-[#FFF6F0]/50 border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2.5 text-sm text-[#150E56] font-bold focus:outline-none transition resize-none shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                                                />
                                            </div>
                                        </div>

                                        {/* Optional External Portfolio Links */}
                                        <div className="p-4 rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/40 space-y-4 shadow-clayBtn">
                                            <h4 className="text-xs font-bold text-[#5C6485] uppercase tracking-wider border-b border-[#150E56]/10 pb-2">
                                                Optional Portfolio Links (Uploads NOT required)
                                            </h4>
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-[#5C6485] uppercase tracking-wider">LinkedIn URL</label>
                                                    <input
                                                        type="url"
                                                        placeholder="https://linkedin.com/in/..."
                                                        value={formData.linkedin}
                                                        onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                                                        className="w-full bg-white border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2 text-xs text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_2px_rgba(0,0,0,0.01)]"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-[#5C6485] uppercase tracking-wider">GitHub Link</label>
                                                    <input
                                                        type="url"
                                                        placeholder="https://github.com/..."
                                                        value={formData.github}
                                                        onChange={(e) => setFormData({ ...formData, github: e.target.value })}
                                                        className="w-full bg-white border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2 text-xs text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_2px_rgba(0,0,0,0.01)]"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-[#5C6485] uppercase tracking-wider">Canva Portfolio Link</label>
                                                    <input
                                                        type="url"
                                                        placeholder="https://canva.com/..."
                                                        value={formData.canva}
                                                        onChange={(e) => setFormData({ ...formData, canva: e.target.value })}
                                                        className="w-full bg-white border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2 text-xs text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_2px_rgba(0,0,0,0.01)]"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-[#5C6485] uppercase tracking-wider">General Portfolio / CV Link</label>
                                                    <input
                                                        type="url"
                                                        placeholder="https://..."
                                                        value={formData.portfolio}
                                                        onChange={(e) => setFormData({ ...formData, portfolio: e.target.value })}
                                                        className="w-full bg-white border border-[#150E56]/10 focus:border-[#00917C]/50 rounded-xl px-4 py-2 text-xs text-[#150E56] font-bold focus:outline-none transition shadow-[inset_1px_1px_2px_rgba(0,0,0,0.01)]"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Proceed & Auto Fill Buttons */}
                                        <div className="flex justify-between items-center pt-4">
                                            <button
                                                type="button"
                                                onClick={handleAutoFill}
                                                className="inline-flex items-center gap-2 rounded-3xl bg-white hover:bg-[#FFF6F0]/80 text-[#00917C] border border-[#150E56]/10 px-6 py-3.5 text-xs font-bold shadow-clayBtn hover:shadow-clayBtnHover transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
                                            >
                                                ⚡ Auto Fill Form
                                            </button>
                                            <button
                                                type="submit"
                                                className="inline-flex items-center gap-2 rounded-3xl bg-[#00917C] hover:bg-[#007a68] text-white px-8 py-3.5 text-xs font-bold shadow-md shadow-[#00917C]/15 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer"
                                            >
                                                Proceed to Consent <ArrowRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </form>
                                </motion.div>
                            )}

                            {/* Step 2: Consent Form Checklist */}
                            {step === 2 && (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -15 }}
                                >
                                    <ConsentManager onConsentGiven={handleConsentSubmit} />
                                </motion.div>
                            )}

                            {/* Step 3: Interactive Dynamic Assessment Workspace */}
                            {step === 3 && (
                                <motion.div
                                    key="step3"
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -15 }}
                                >
                                    <InterviewWorkspace
                                        candidateId={candidateId}
                                        interviewId={sessionId}
                                        registrationData={formData}
                                        onCompleted={handleAssessmentFinished}
                                    />
                                </motion.div>
                            )}

                            {/* Step 4: Pathway Scoring and Explainable AI Results */}
                            {step === 4 && results && (
                                <motion.div
                                    key="step4"
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <PathwayResults
                                        primaryPathway={results.primaryPathway}
                                        secondaryPathway={results.secondaryPathway}
                                        scores={results.scores}
                                        evidence={results.evidence}
                                        onFinish={() => {
                                            window.location.href = "/";
                                        }}
                                    />
                                </motion.div>
                            )}

                        </AnimatePresence>
                    </main>
                </div>
            </div>
        </div>
    );
}
