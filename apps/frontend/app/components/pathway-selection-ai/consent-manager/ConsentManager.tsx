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
            className="w-full max-w-4xl mx-auto rounded-[2.75rem] border border-white bg-white/70 p-6 md:p-10 backdrop-blur-md shadow-clay relative overflow-hidden"
        >
            <div className="absolute top-0 right-0 h-40 w-40 translate-x-10 -translate-y-10 rounded-full bg-[#00917C]/5 blur-[80px]"></div>
            <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-10 translate-y-10 rounded-full bg-[#150E56]/5 blur-[80px]"></div>

            <div className="text-center space-y-4 mb-8">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/15 mb-2">
                    <HeartHandshake className="h-8 w-8" />
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[#150E56]">
                    Compliance & Consent Manager
                </h1>
                <p className="text-[#5C6485] max-w-xl mx-auto text-xs md:text-sm leading-relaxed">
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
                            className={`p-4 rounded-2xl border transition duration-300 cursor-pointer flex gap-4 items-start select-none ${checked ? "bg-white border-[#00917C]/30 text-[#150E56] shadow-clayBtn" : "bg-[#FFF6F0]/40 border-[#150E56]/5 text-[#5C6485] hover:border-[#150E56]/15 hover:bg-[#FFF6F0]/60"}`}
                        >
                            <div className="mt-1 flex-shrink-0">
                                {checked ? (
                                    <CheckSquare className="h-5 w-5 text-[#00917C]" />
                                ) : (
                                    <Square className="h-5 w-5 text-[#5C6485]/40" />
                                )}
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Icon className={`h-4 w-4 ${checked ? "text-[#00917C]" : "text-[#5C6485]/70"}`} />
                                    <span className="font-bold text-xs md:text-sm">{item.label}</span>
                                </div>
                                <p className="text-[11px] text-[#5C6485]/80 leading-relaxed">{item.desc}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center border-t border-[#150E56]/10 pt-6 mt-6">
                <button
                    onClick={handleAcceptAll}
                    className="text-xs text-[#00917C] hover:text-[#007a68] font-bold border-b border-[#00917C]/20 hover:border-[#007a68]/40 transition pb-0.5"
                >
                    Enable All Permissions
                </button>
                <div className="flex gap-4">
                    <button
                        onClick={handleSubmit}
                        disabled={!isAllChecked}
                        className={`inline-flex items-center gap-2 rounded-3xl px-8 py-3.5 text-xs font-bold tracking-wide transition shadow-lg ${isAllChecked ? "bg-[#00917C] hover:bg-[#007a68] text-white cursor-pointer hover:shadow-md hover:shadow-[#00917C]/15" : "bg-[#FFF6F0]/50 border border-[#150E56]/10 text-[#5C6485]/50 cursor-not-allowed"}`}
                    >
                        Accept & Proceed <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
