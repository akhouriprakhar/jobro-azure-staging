"use client";

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Award, Compass, HelpCircle, FileText, ArrowRight } from "lucide-react";

interface PathwayResultsProps {
    primaryPathway: string;
    secondaryPathway: string;
    scores: Record<string, number>;
    evidence: string; // JSON string mapping pathway names to evidence statements
    onFinish: () => void;
}

export default function PathwayResults({ primaryPathway, secondaryPathway, scores, evidence, onFinish }: PathwayResultsProps) {
    
    // Parse evidence map safely
    let evidenceMap: Record<string, string> = {};
    try {
        evidenceMap = JSON.parse(evidence);
    } catch (e) {
        evidenceMap = {
            "Data Annotation": "Demonstrates structured data tools familiarity and consistent answer lengths.",
            "Research & Analysis": "Shows strong analytical curiosity and active project sharing.",
            "Digital Marketing": "Displays high verbal expressiveness and creative thinking interests.",
            "Employment Readiness": "Communicates confidently and has clear long term learning objectives.",
            "Entrepreneurship": "Initiates independent learning tracks and shows self-direction."
        };
    }

    const pathwayColors: Record<string, string> = {
        "Data Annotation": "from-cyan-400 to-blue-500",
        "Research & Analysis": "from-violet-400 to-purple-600",
        "Digital Marketing": "from-amber-400 to-orange-500",
        "Employment Readiness": "from-emerald-400 to-teal-500",
        "Entrepreneurship": "from-pink-400 to-rose-500"
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-5xl mx-auto rounded-[2.5rem] border border-white/10 bg-slate-900/60 p-6 md:p-10 backdrop-blur-xl shadow-glow space-y-8"
        >
            <div className="text-center space-y-3">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 mb-2">
                    <Compass className="h-8 w-8 animate-spin-slow" />
                </div>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                    Pathway Discovery Results
                </h1>
                <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base">
                    Based on your cognitive signals, registration parameters, and screen simulations, here are your matching learning pathways.
                </p>
            </div>

            {/* Recommendation Cards */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Primary Card */}
                <div className="p-6 rounded-[2rem] border border-cyan-500/20 bg-cyan-500/5 backdrop-blur relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-cyan-400/5 blur-xl"></div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300 uppercase tracking-widest">
                                Primary Pathway Fit
                            </span>
                            <span className="text-2xl">🥇</span>
                        </div>
                        <h2 className="text-2xl font-black text-white">{primaryPathway}</h2>
                        <p className="text-sm text-slate-300 leading-relaxed">
                            {evidenceMap[primaryPathway] || "Shows high competency and structural compatibility with this learning track."}
                        </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-cyan-500/10 text-xs text-cyan-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> Ready for enrollment
                    </div>
                </div>

                {/* Secondary Card */}
                <div className="p-6 rounded-[2rem] border border-violet-500/20 bg-violet-500/5 backdrop-blur relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-violet-400/5 blur-xl"></div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300 uppercase tracking-widest">
                                Secondary Pathway Fit
                            </span>
                            <span className="text-2xl">🥈</span>
                        </div>
                        <h2 className="text-2xl font-black text-white">{secondaryPathway}</h2>
                        <p className="text-sm text-slate-300 leading-relaxed">
                            {evidenceMap[secondaryPathway] || "Shows strong supporting capacity and transferable interests."}
                        </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-violet-500/10 text-xs text-violet-400 font-semibold flex items-center gap-1.5">
                        <Compass className="h-4 w-4" /> Optional secondary track
                    </div>
                </div>
            </div>

            {/* Suitability score gauges */}
            <div className="p-6 rounded-[2rem] border border-white/5 bg-slate-950/40 space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-3">
                    Pathway Suitability Scores
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(scores).map(([name, score]) => {
                        const gradient = pathwayColors[name] || "from-cyan-400 to-blue-500";
                        return (
                            <div key={name} className="space-y-2 p-3 bg-slate-900/40 rounded-xl border border-white/5">
                                <div className="flex justify-between text-sm items-center">
                                    <span className="text-slate-300 font-semibold">{name}</span>
                                    <span className="font-extrabold text-white">{score}%</span>
                                </div>
                                <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${score}%` }}
                                        transition={{ duration: 0.8, delay: 0.2 }}
                                        className={`h-full bg-gradient-to-r ${gradient} rounded-full`}
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    {evidenceMap[name] || "Matches key behavioral parameters."}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-center pt-4">
                <button
                    onClick={onFinish}
                    className="inline-flex items-center gap-2 rounded-3xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-8 py-4 text-sm font-bold tracking-wide transition shadow-lg shadow-cyan-500/10"
                >
                    Proceed to Dashboard <ArrowRight className="h-4 w-4" />
                </button>
            </div>
        </motion.div>
    );
}
