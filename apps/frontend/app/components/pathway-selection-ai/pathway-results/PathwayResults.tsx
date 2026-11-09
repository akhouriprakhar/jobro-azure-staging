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
        "Data Annotation": "from-[#00917C] to-[#00917C]/70",
        "Research & Analysis": "from-[#150E56] to-[#150E56]/70",
        "Digital Marketing": "from-amber-500 to-amber-500/70",
        "Employment Readiness": "from-[#00917C] to-[#150E56]",
        "Entrepreneurship": "from-pink-500 to-pink-500/70"
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-5xl mx-auto rounded-[2.75rem] border border-white bg-white/70 p-6 md:p-10 backdrop-blur-md shadow-clay space-y-8"
        >
            <div className="text-center space-y-3">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/15 mb-2">
                    <Compass className="h-8 w-8 animate-spin-slow" />
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[#150E56]">
                    Pathway Discovery Results
                </h1>
                <p className="text-[#5C6485] max-w-lg mx-auto text-xs md:text-sm leading-relaxed">
                    Based on your cognitive signals, registration parameters, and screen simulations, here are your matching learning pathways.
                </p>
            </div>

            {/* Recommendation Cards */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Primary Card */}
                <div className="p-6 rounded-[2rem] border border-[#00917C]/25 bg-[#00917C]/5 backdrop-blur relative overflow-hidden flex flex-col justify-between shadow-clayBtn">
                    <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-[#00917C]/5 blur-xl"></div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="rounded-full bg-[#00917C]/10 px-3 py-1 text-[10px] font-bold text-[#00917C] uppercase tracking-widest">
                                Primary Pathway Fit
                            </span>
                            <span className="text-2xl">🥇</span>
                        </div>
                        <h2 className="text-2xl font-black text-[#150E56]">{primaryPathway}</h2>
                        <p className="text-xs md:text-sm text-[#5C6485] leading-relaxed">
                            {evidenceMap[primaryPathway] || "Shows high competency and structural compatibility with this learning track."}
                        </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-[#00917C]/10 text-xs text-[#00917C] font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> Ready for enrollment
                    </div>
                </div>

                {/* Secondary Card */}
                <div className="p-6 rounded-[2rem] border border-[#150E56]/20 bg-[#150E56]/5 backdrop-blur relative overflow-hidden flex flex-col justify-between shadow-clayBtn">
                    <div className="absolute top-0 right-0 h-24 w-24 translate-x-4 -translate-y-4 rounded-full bg-[#150E56]/5 blur-xl"></div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="rounded-full bg-[#150E56]/10 px-3 py-1 text-[10px] font-bold text-[#150E56] uppercase tracking-widest">
                                Secondary Pathway Fit
                            </span>
                            <span className="text-2xl">🥈</span>
                        </div>
                        <h2 className="text-2xl font-black text-[#150E56]">{secondaryPathway}</h2>
                        <p className="text-xs md:text-sm text-[#5C6485] leading-relaxed">
                            {evidenceMap[secondaryPathway] || "Shows strong supporting capacity and transferable interests."}
                        </p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-[#150E56]/10 text-xs text-[#150E56] font-semibold flex items-center gap-1.5">
                        <Compass className="h-4 w-4" /> Optional secondary track
                    </div>
                </div>
            </div>

            {/* Suitability score gauges */}
            <div className="p-6 rounded-[2rem] border border-[#150E56]/5 bg-white/70 shadow-clay space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#150E56] border-b border-[#150E56]/10 pb-3">
                    Pathway Suitability Scores
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(scores).map(([name, score]) => {
                        const gradient = pathwayColors[name] || "from-[#00917C] to-[#150E56]";
                        return (
                            <div key={name} className="space-y-2 p-3.5 bg-[#FFF6F0]/40 rounded-xl border border-[#150E56]/5 shadow-clayBtn">
                                <div className="flex justify-between text-xs items-center">
                                    <span className="text-[#5C6485] font-bold">{name}</span>
                                    <span className="font-extrabold text-[#150E56]">{score}%</span>
                                </div>
                                <div className="h-3 w-full bg-white border border-[#150E56]/5 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.06)] rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${score}%` }}
                                        transition={{ duration: 0.8, delay: 0.2 }}
                                        className={`h-full bg-gradient-to-r ${gradient} rounded-full`}
                                    />
                                </div>
                                <p className="text-[10px] text-[#5C6485]/80 leading-relaxed font-semibold">
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
                    className="inline-flex items-center gap-2 rounded-3xl bg-[#00917C] hover:bg-[#007a68] text-white px-8 py-4 text-xs font-bold tracking-wide transition shadow-lg shadow-[#00917C]/15 active:scale-95"
                >
                    Proceed to Dashboard <ArrowRight className="h-4 w-4" />
                </button>
            </div>
        </motion.div>
    );
}
