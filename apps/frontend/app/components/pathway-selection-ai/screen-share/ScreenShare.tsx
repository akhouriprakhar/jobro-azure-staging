"use client";

import React, { useState } from "react";
import { Monitor, MonitorOff, CheckCircle2, AlertCircle } from "lucide-react";

interface ScreenShareProps {
    isActive: boolean;
    onStartShare: (events: { active_application: string; inferred_skill: string }[]) => void;
    onStopShare: () => void;
    onStreamChange?: (stream: MediaStream | null) => void;
}

export default function ScreenShare({ isActive, onStartShare, onStopShare, onStreamChange }: ScreenShareProps) {
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
            if (onStreamChange) onStreamChange(s);
            
            // Simulating app selection for tool-inference mapping
            const mockAppList = [
                { name: "Canva Design Studio", skill: "Digital Marketing, Storytelling & Design Assets" },
                { name: "Google Chrome - GitHub Projects", skill: "Research, Programming & Repo Coordination" },
                { name: "Microsoft Excel - Annotations Sheet", skill: "Data Tabulation, Annotation & Structuring" }
            ];

            // Choose a mock app based on random click or let candidate choose one for demo purposes
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
        if (onStreamChange) onStreamChange(null);
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
        <div className="bg-white/70 border border-[#150E56]/10 rounded-2xl p-4 shadow-clayBtn space-y-4 backdrop-blur">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 flex items-center justify-center rounded-xl transition ${stream ? "bg-[#00917C]/10 text-[#00917C] border border-[#00917C]/20 animate-pulse" : "bg-[#FFF6F0]/50 text-[#5C6485]"}`}>
                        {stream ? <Monitor className="h-5 w-5" /> : <MonitorOff className="h-5 w-5" />}
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-[#150E56] uppercase tracking-wider">Screen Analyzer</h4>
                        <p className="text-[10px] text-[#5C6485]">Demonstrate works or portfolios (optional)</p>
                    </div>
                </div>
                <div>
                    {stream ? (
                        <button
                            onClick={stopSharing}
                            className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-600 text-xs px-3.5 py-1.5 rounded-full font-bold transition shadow-clayBtn"
                        >
                            Stop Sharing
                        </button>
                    ) : (
                        <button
                            onClick={startSharing}
                            className="bg-[#00917C] hover:bg-[#007a68] text-white text-xs px-4 py-2 rounded-full font-bold transition shadow-md shadow-[#00917C]/15"
                        >
                            Share Window
                        </button>
                    )}
                </div>
            </div>

            {stream && (
                <div className="space-y-3 pt-2 border-t border-[#150E56]/10">
                    <div className="flex gap-2 items-center bg-[#00917C]/5 border border-[#00917C]/20 p-2.5 rounded-xl text-[11px] text-[#00917C]">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        <div>
                            <span>Active Window: <strong className="font-extrabold">{selectedApp || "Waiting..."}</strong></span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <span className="text-[9px] uppercase tracking-wider text-[#5C6485] font-bold block">Inference Simulations (Click to trigger tools)</span>
                        <div className="grid grid-cols-3 gap-1.5">
                            {demoAppTriggers.map((app) => (
                                <button
                                    key={app.name}
                                    onClick={() => triggerManualDemoApp(app)}
                                    className={`px-2 py-1.5 rounded-lg text-[9px] font-bold border transition ${selectedApp === app.name ? "bg-[#00917C]/20 text-[#00917C] border-[#00917C]/30 shadow-clayBtnActive" : "bg-white border-[#150E56]/10 text-[#5C6485] hover:text-[#150E56] shadow-clayBtn hover:shadow-clayBtnHover"}`}
                                >
                                    {app.name.split(" - ")[1] || app.name.split(" ")[0]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {eventsLogged.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#150E56]/10">
                    <span className="text-[9px] uppercase tracking-wider text-[#5C6485] font-bold block">Inferred Signals Log</span>
                    <div className="max-h-[80px] overflow-y-auto space-y-1.5 pr-1">
                        {eventsLogged.map((evt, idx) => (
                            <div key={idx} className="flex justify-between items-start text-[10px] bg-[#FFF6F0]/40 p-1.5 rounded-lg border border-[#150E56]/5 shadow-clayBtn">
                                <div>
                                    <span className="text-[#150E56] font-bold block">{evt.app}</span>
                                    <span className="text-[#5C6485] text-[9px]">{evt.skill}</span>
                                </div>
                                <span className="text-[#5C6485]/70 text-[8px] flex-shrink-0 ml-2 mt-0.5">{evt.time}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
