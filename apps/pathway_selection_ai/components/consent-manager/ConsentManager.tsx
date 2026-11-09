"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, CheckSquare, Square, ArrowRight, Video, Mic, Monitor, Database, FolderOpen, HeartHandshake } from "lucide-react";

interface ConsentManagerProps {
    onConsentGiven: (consents: {
        video: boolean;
        audio: boolean;
        screen: boolean;
        transcript: boolean;
        ai: boolean;
        sharepoint: boolean;
    }) => void;
}

export default function ConsentManager({ onConsentGiven }: ConsentManagerProps) {
    const [consents, setConsents] = useState({
        video: false,
        audio: false,
        screen: false,
        transcript: false,
        ai: false,
        sharepoint: false,
    });

    const toggleConsent = (key: keyof typeof consents) => {
        setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const isAllChecked = Object.values(consents).every(Boolean);

    const handleAcceptAll = () => {
        setConsents({
            video: true,
            audio: true,
            screen: true,
            transcript: true,
            ai: true,
            sharepoint: true,
        });
    };

    const handleSubmit = () => {
        if (!isAllChecked) return;
        onConsentGiven(consents);
    };

    const consentItems = [
        { key: "video" as const, label: "Webcam / Video Recording", desc: "Captures participation and physical presence signals.", icon: Video },
        { key: "audio" as const, label: "Microphone / Voice Audio Recording", desc: "Analyzes audio latency, pacing, and tone parameters.", icon: Mic },
        { key: "screen" as const, label: "Screen Share Recording (Optional)", desc: "Enables recording shared workspace windows for portfolio evaluation.", icon: Monitor },
        { key: "transcript" as const, label: "Dialogue Transcript Storage", desc: "Stores dialogue history for profile extraction and alignment.", icon: ShieldCheck },
        { key: "ai" as const, label: "AI Analysis & Cognitive Profiling", desc: "Permits Azure OpenAI analysis of transcripts and signals.", icon: Database },
        { key: "sharepoint" as const, label: "SharePoint Secure Archival", desc: "Saves final session reports in secure database tables.", icon: FolderOpen },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-4xl mx-auto rounded-[2.5rem] border border-white/10 bg-slate-900/60 p-6 md:p-10 backdrop-blur-xl shadow-glow relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 h-40 w-40 translate-x-10 -translate-y-10 rounded-full bg-cyan-400/5 blur-[80px]"></div>
            <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-10 translate-y-10 rounded-full bg-blue-500/5 blur-[80px]"></div>

            <div className="text-center space-y-4 mb-8">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 mb-2">
                    <HeartHandshake className="h-8 w-8" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                    Compliance & Consent Manager
                </h1>
                <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base">
                    Before beginning the Pathway Discovery assessment, we require your explicit permission to collect and analyze signals.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mb-8">
                {consentItems.map((item) => {
                    const Icon = item.icon;
                    const checked = consents[item.key];
                    return (
                        <div
                            key={item.key}
                            onClick={() => toggleConsent(item.key)}
                            className={`p-4 rounded-2xl border transition duration-300 cursor-pointer flex gap-4 items-start select-none ${checked ? "bg-cyan-500/5 border-cyan-500/30 text-white" : "bg-slate-950/40 border-white/5 text-slate-300 hover:border-white/10"}`}
                        >
                            <div className="mt-1 flex-shrink-0">
                                {checked ? (
                                    <CheckSquare className="h-5 w-5 text-cyan-400" />
                                ) : (
                                    <Square className="h-5 w-5 text-slate-500" />
                                )}
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Icon className={`h-4 w-4 ${checked ? "text-cyan-400" : "text-slate-400"}`} />
                                    <span className="font-semibold text-sm">{item.label}</span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center border-t border-white/5 pt-6 mt-6">
                <button
                    onClick={handleAcceptAll}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold border-b border-cyan-400/20 hover:border-cyan-300/40 transition pb-0.5"
                >
                    Enable All Permissions
                </button>
                <div className="flex gap-4">
                    <button
                        onClick={handleSubmit}
                        disabled={!isAllChecked}
                        className={`inline-flex items-center gap-2 rounded-3xl px-8 py-3.5 text-sm font-semibold tracking-wide transition shadow-lg ${isAllChecked ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer" : "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"}`}
                    >
                        Accept & Proceed <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
