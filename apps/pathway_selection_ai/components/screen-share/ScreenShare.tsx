"use client";

import React, { useState } from "react";
import { Monitor, MonitorOff, CheckCircle2, AlertCircle } from "lucide-react";

interface ScreenShareProps {
    isActive: boolean;
    onStartShare: (events: { active_application: string; inferred_skill: string }[]) => void;
    onStopShare: () => void;
}

export default function ScreenShare({ isActive, onStartShare, onStopShare }: ScreenShareProps) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [selectedApp, setSelectedApp] = useState<string | null>(null);
    const [eventsLogged, setEventsLogged] = useState<{ app: string; skill: string; time: string }[]>([]);

    const startSharing = async () => {
        try {
            const s = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });
            setStream(s);
            
            // Simulating app selection for tool-inference mapping
            const mockAppList = [
                { name: "Canva Design Studio", skill: "Digital Marketing, Storytelling & Design Assets" },
                { name: "Google Chrome - GitHub Projects", skill: "Research, Programming & Repo Coordination" },
                { name: "Microsoft Excel - Annotations Sheet", skill: "Data Tabulation, Annotation & Structuring" }
            ];

            // Choose a mock app based on random click or let candidate choose one for demo purposes
            // Let's set a random app to keep flow non-blocking, but provide a select box for demo!
            const chosen = mockAppList[Math.floor(Math.random() * mockAppList.length)];
            setSelectedApp(chosen.name);

            const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const newEvent = { app: chosen.name, skill: chosen.skill, time: now };
            setEventsLogged([newEvent, ...eventsLogged]);

            onStartShare([{ active_application: chosen.name, inferred_skill: chosen.skill }]);

            const [track] = s.getVideoTracks();
            track.onended = () => {
                stopSharing();
            };
        } catch (err) {
            console.error("Screen acquisition failed:", err);
        }
    };

    const stopSharing = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
        setSelectedApp(null);
        onStopShare();
    };

    const demoAppTriggers = [
        { name: "Canva Design Studio", skill: "Digital Marketing, Storytelling & Design Assets" },
        { name: "Google Chrome - GitHub Projects", skill: "Research, Programming & Repo Coordination" },
        { name: "Microsoft Excel - Annotations Sheet", skill: "Data Tabulation, Annotation & Structuring" }
    ];

    const triggerManualDemoApp = (app: typeof demoAppTriggers[0]) => {
        if (!stream) return;
        setSelectedApp(app.name);
        const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const newEvent = { app: app.name, skill: app.skill, time: now };
        setEventsLogged((prev) => [newEvent, ...prev]);
        onStartShare([{ active_application: app.name, inferred_skill: app.skill }]);
    };

    return (
        <div className="bg-slate-950 border border-white/10 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 flex items-center justify-center rounded-xl ${stream ? "bg-cyan-500/10 text-cyan-300 animate-pulse" : "bg-slate-900 text-slate-500"}`}>
                        {stream ? <Monitor className="h-5 w-5" /> : <MonitorOff className="h-5 w-5" />}
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Screen Analyzer</h4>
                        <p className="text-[10px] text-slate-500">Demonstrate works or portfolios (optional)</p>
                    </div>
                </div>
                <div>
                    {stream ? (
                        <button
                            onClick={stopSharing}
                            className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 text-xs px-3.5 py-1.5 rounded-full font-semibold transition"
                        >
                            Stop Sharing
                        </button>
                    ) : (
                        <button
                            onClick={startSharing}
                            className="bg-cyan-500 text-slate-950 hover:bg-cyan-400 text-xs px-4 py-2 rounded-full font-bold transition shadow-md shadow-cyan-500/10"
                        >
                            Share Window
                        </button>
                    )}
                </div>
            </div>

            {stream && (
                <div className="space-y-3 pt-2 border-t border-white/5">
                    <div className="flex gap-2 items-center bg-cyan-500/5 border border-cyan-500/20 p-2.5 rounded-xl text-[11px] text-cyan-300">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        <div>
                            <span>Active Window: <strong>{selectedApp || "Waiting..."}</strong></span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Inference Simulations (Click to trigger tools)</span>
                        <div className="grid grid-cols-3 gap-1.5">
                            {demoAppTriggers.map((app) => (
                                <button
                                    key={app.name}
                                    onClick={() => triggerManualDemoApp(app)}
                                    className={`px-2 py-1.5 rounded-lg text-[9px] font-semibold border transition ${selectedApp === app.name ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/30" : "bg-slate-900 border-white/5 text-slate-400 hover:text-white"}`}
                                >
                                    {app.name.split(" - ")[1] || app.name.split(" ")[0]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {eventsLogged.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/5">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">Inferred Signals Log</span>
                    <div className="max-h-[80px] overflow-y-auto space-y-1.5 pr-1">
                        {eventsLogged.map((evt, idx) => (
                            <div key={idx} className="flex justify-between items-start text-[10px] bg-slate-900/40 p-1.5 rounded-lg border border-white/5">
                                <div>
                                    <span className="text-white font-medium block">{evt.app}</span>
                                    <span className="text-slate-400 text-[9px]">{evt.skill}</span>
                                </div>
                                <span className="text-slate-500 text-[8px] flex-shrink-0 ml-2 mt-0.5">{evt.time}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
