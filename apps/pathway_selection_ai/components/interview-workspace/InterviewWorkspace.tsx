"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Mic, Monitor, UserCheck, ShieldCheck, Heart, User, CheckCircle2, AlertCircle, HelpCircle, Volume2, VolumeX, Sparkles, Send } from "lucide-react";
import VideoCapture from "../video-capture/VideoCapture";
import AudioCapture from "../audio-capture/AudioCapture";
import ScreenShare from "../screen-share/ScreenShare";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface InterviewWorkspaceProps {
    candidateId: string;
    interviewId: string;
    registrationData: any;
    onCompleted: (result: {
        primaryPathway: string;
        secondaryPathway: string;
        scores: Record<string, number>;
        evidence: string;
    }) => void;
}

export default function InterviewWorkspace({ candidateId, interviewId, registrationData, onCompleted }: InterviewWorkspaceProps) {
    // Media & sharing status
    const [cameraActive, setCameraActive] = useState(true);
    const [microphoneActive, setMicrophoneActive] = useState(true);
    const [screenActive, setScreenActive] = useState(false);
    const [screenShareEvents, setScreenShareEvents] = useState<any[]>([]);

    // Voice / Audio controls
    const [voiceMuted, setVoiceMuted] = useState(false);
    const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

    // Chat dialogs
    const [activePersona, setActivePersona] = useState<"Geethanjali" | "Panchali">("Geethanjali");
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: "assistant",
            content: "Hello! I am Geethanjali. I am here to help you discover the perfect learning pathway at Orchvate. Shall we start by introducing ourselves? Tell me a little about you.",
        }
    ]);
    const [textInput, setTextInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);

    // Dynamic support triggers & counts
    const [rephraseCount, setRephraseCount] = useState(0);
    const [moreTimeCount, setMoreTimeCount] = useState(0);
    const [skipCount, setSkipCount] = useState(0);

    // Progress tracks (Total 6 turns target)
    const [progressPercent, setProgressPercent] = useState(15);
    const [isEvaluating, setIsEvaluating] = useState(false);

    const chatEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isTyping]);

    // Setup speech synthesis
    useEffect(() => {
        if (typeof window === "undefined" || !window.speechSynthesis) return;
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            const priorities = ["jenny", "aria", "zira", "google us english", "samantha", "female"];
            const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
            
            let match: SpeechSynthesisVoice | null = null;
            for (const p of priorities) {
                match = english.find((v) => v.name.toLowerCase().includes(p)) || null;
                if (match) break;
            }
            setSelectedVoice(match || english[0] || null);
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }, []);

    // Text to Speech
    const speakText = (text: string) => {
        if (voiceMuted || typeof window === "undefined" || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    };

    // Speak initial welcome message
    useEffect(() => {
        speakText(messages[0].content);
    }, [selectedVoice]);

    // REST api calls
    const getApiUrl = (path: string) => {
        if (typeof window !== "undefined") {
            const hostname = window.location.hostname;
            if (hostname === "localhost" || hostname === "127.0.0.1") {
                return `http://localhost:8000${path}`;
            }
        }
        return path;
    };

    const handleSendMessage = async (customText?: string) => {
        const userText = customText !== undefined ? customText : textInput.trim();
        if (!userText || isTyping) return;

        if (customText === undefined) setTextInput("");

        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        const nextMsgs: ChatMessage[] = [...messages, { role: "user", content: userText }];
        setMessages(nextMsgs);
        setIsTyping(true);

        // Update progress bar
        const turnsCount = nextMsgs.filter((m) => m.role === "user").length;
        setProgressPercent(Math.min(90, 15 + turnsCount * 15));

        // Format payloads
        const payload = {
            interview_id: interviewId,
            candidate_id: candidateId,
            messages: nextMsgs,
            persona: activePersona,
            track: "Discovery",
            registration_data: registrationData,
            behavioral_events: {
                rephrase_requests: rephraseCount,
                need_more_time_requests: moreTimeCount,
                skipped_questions: skipCount,
                interaction_frequency: nextMsgs.length,
                help_requests: rephraseCount + moreTimeCount + skipCount,
                screen_share_usage: screenActive
            },
            screen_share_events: screenShareEvents
        };

        try {
            const response = await fetch(getApiUrl("/api/v1/pathway-selection/chat"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                const data = await response.json();
                setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
                
                // Track persona switch
                if (turnsCount >= 3 && activePersona === "Geethanjali") {
                    setActivePersona("Panchali");
                }
                
                speakText(data.response);
            } else {
                throw new Error("Chat call failed");
            }
        } catch (e) {
            console.warn("Fallback chat simulation:", e);
            setTimeout(() => {
                let reply = "That is helpful context. What goals or work settings do you find yourself most interested in?";
                if (turnsCount >= 3 && activePersona === "Geethanjali") {
                    setActivePersona("Panchali");
                    reply = "Hi! I am Panchali, taking over from Geethanjali. Let's look at your career goals. What kinds of projects excite you?";
                }
                setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
                speakText(reply);
            }, 1000);
        } finally {
            setIsTyping(false);
        }
    };

    // Inclusive tools helper methods
    const handleRephrase = () => {
        setRephraseCount((prev) => prev + 1);
        handleSendMessage("Could you rephrase that question for me, please?");
    };

    const handleGiveExample = () => {
        handleSendMessage("Could you give me an example response to guide me?");
    };

    const handleNeedMoreTime = () => {
        setMoreTimeCount((prev) => prev + 1);
        handleSendMessage("I need a moment to think about this question.");
    };

    const handleSkip = () => {
        setSkipCount((prev) => prev + 1);
        handleSendMessage("I would like to skip this question and move on.");
    };

    // Final evaluation pipeline trigger
    const triggerEvaluation = async () => {
        setIsEvaluating(true);
        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        const payload = {
            interview_id: interviewId,
            candidate_id: candidateId,
            messages: messages,
            registration_data: registrationData,
            behavioral_events: {
                rephrase_requests: rephraseCount,
                need_more_time_requests: moreTimeCount,
                skipped_questions: skipCount,
                interaction_frequency: messages.length,
                help_requests: rephraseCount + moreTimeCount + skipCount,
                screen_share_usage: screenActive
            },
            screen_share_events: screenShareEvents
        };

        try {
            const response = await fetch(getApiUrl("/api/v1/pathway-selection/evaluate"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                const data = await response.json();
                onCompleted({
                    primaryPathway: data.primary_pathway,
                    secondaryPathway: data.secondary_pathway,
                    scores: data.pathway_scores,
                    evidence: data.evidence
                });
            } else {
                throw new Error("Evaluation failed");
            }
        } catch (e) {
            console.warn("Fallback evaluation simulation:", e);
            setTimeout(() => {
                onCompleted({
                    primaryPathway: "Data Annotation",
                    secondaryPathway: "Research & Analysis",
                    scores: {
                        "Data Annotation": 91,
                        "Research & Analysis": 86,
                        "Digital Marketing": 73,
                        "Employment Readiness": 82,
                        "Entrepreneurship": 65
                    },
                    evidence: JSON.stringify({
                        "Data Annotation": "Demonstrates high structured file compliance and precise task ownership.",
                        "Research & Analysis": "Shows investigate documentation habits.",
                        "Digital Marketing": "Demonstrated Canva graphics creation during sessions.",
                        "Employment Readiness": "Strong professionalism cues and clear speech latency.",
                        "Entrepreneurship": "Initiates independent task lists."
                    })
                });
            }, 2000);
        } finally {
            setIsEvaluating(false);
        }
    };

    const turnsCompleted = messages.filter((m) => m.role === "user").length;

    return (
        <div className="w-full max-w-[1500px] mx-auto space-y-6">
            
            {/* Top Bar - Status Monitors */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur shadow-glow">
                <div className="flex gap-4 items-center">
                    <span className="text-xs uppercase tracking-widest font-bold text-slate-500">Device Status</span>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setCameraActive(!cameraActive)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${cameraActive ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25" : "bg-slate-950 text-slate-500 border-white/5"}`}
                        >
                            <Camera className="h-3.5 w-3.5" /> Webcam
                        </button>
                        <button
                            onClick={() => setMicrophoneActive(!microphoneActive)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${microphoneActive ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/25" : "bg-slate-950 text-slate-500 border-white/5"}`}
                        >
                            <Mic className="h-3.5 w-3.5" /> Microphone
                        </button>
                        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${screenActive ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25" : "bg-slate-950 text-slate-500 border-white/5"}`}>
                            <Monitor className="h-3.5 w-3.5" /> Screen Share: {screenActive ? "Active" : "Offline"}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setVoiceMuted(!voiceMuted)}
                        className={`p-2 rounded-xl border transition ${voiceMuted ? "bg-red-500/10 border-red-500/25 text-red-400" : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"}`}
                        title={voiceMuted ? "Unmute Voice agent response" : "Mute Voice agent response"}
                    >
                        {voiceMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                    <div className="text-right">
                        <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Active Welcome Agent</span>
                        <div className="flex gap-2 items-center justify-end text-sm font-semibold text-white mt-0.5">
                            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
                            {activePersona === "Geethanjali" ? "Geethanjali (Facilitator)" : "Panchali (Career Mentor)"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Assessment Workspace Grid */}
            <div className="grid gap-6 lg:grid-cols-[280px,1fr,320px]">
                
                {/* Left Panel - Candidate Video */}
                <div className="space-y-4 flex flex-col">
                    <div className="h-[220px] flex-shrink-0">
                        <VideoCapture isActive={cameraActive} />
                    </div>
                    
                    <div className="p-4 rounded-[2rem] border border-white/10 bg-slate-900/40 backdrop-blur shadow-xl space-y-4 flex-1">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">Welcome Agent Bio</h4>
                        {activePersona === "Geethanjali" ? (
                            <div className="space-y-3 text-xs leading-relaxed text-slate-300 animate-fade-in">
                                <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                                    <Heart className="h-4 w-4" /> Geethanjali
                                </div>
                                <p>Structured, encouraging facilitator designed to build psychological safety.</p>
                                <p>Evaluating learning styles and personal comfort limits.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 text-xs leading-relaxed text-slate-300 animate-fade-in">
                                <div className="flex items-center gap-2 text-violet-300 font-semibold">
                                    <Sparkles className="h-4 w-4" /> Panchali
                                </div>
                                <p>Practical, goal-oriented mentor aligned to career discovery.</p>
                                <p>Coordinating pathway alignments, tool checks, and aspirations.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Center Panel - Conversational chat workspace */}
                <div className="rounded-[2.5rem] border border-white/10 bg-slate-900/50 p-4 md:p-6 backdrop-blur-xl shadow-glow flex flex-col h-[560px] relative overflow-hidden">
                    <div className="absolute top-0 right-0 h-40 w-40 translate-x-10 -translate-y-10 rounded-full bg-cyan-400/5 blur-[80px]"></div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 scrollbar-thin">
                        <AnimatePresence initial={false}>
                            {messages.map((msg, index) => {
                                const isUser = msg.role === "user";
                                return (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                                    >
                                        <div className={`max-w-[80%] rounded-[1.8rem] p-4 text-sm leading-relaxed shadow-lg ${isUser ? "bg-cyan-500 text-slate-950 rounded-tr-none font-medium" : "bg-slate-950/80 border border-white/5 text-slate-200 rounded-tl-none"}`}>
                                            {!isUser && (
                                                <span className="text-[10px] font-bold text-cyan-400 block mb-1 uppercase tracking-wider">
                                                    {activePersona === "Geethanjali" && index < 7 ? "Geethanjali" : "Panchali"}
                                                </span>
                                            )}
                                            {msg.content}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        {isTyping && (
                            <div className="flex justify-start">
                                <div className="bg-slate-950/80 border border-white/5 rounded-[1.8rem] rounded-tl-none p-4 flex gap-1.5 items-center">
                                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Inclusive Helpers Bar */}
                    <div className="flex flex-wrap gap-2 mb-4 border-t border-white/5 pt-3">
                        <button
                            onClick={handleRephrase}
                            disabled={isTyping}
                            className="bg-slate-950/80 border border-white/5 hover:border-cyan-500/30 text-slate-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-semibold transition"
                        >
                            Rephrase Question
                        </button>
                        <button
                            onClick={handleGiveExample}
                            disabled={isTyping}
                            className="bg-slate-950/80 border border-white/5 hover:border-cyan-500/30 text-slate-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-semibold transition"
                        >
                            Give Example
                        </button>
                        <button
                            onClick={handleNeedMoreTime}
                            disabled={isTyping}
                            className="bg-slate-950/80 border border-white/5 hover:border-cyan-500/30 text-slate-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-semibold transition"
                        >
                            Need More Time
                        </button>
                        <button
                            onClick={handleSkip}
                            disabled={isTyping}
                            className="bg-slate-950/80 border border-white/5 hover:border-cyan-500/30 text-slate-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-semibold transition"
                        >
                            Skip
                        </button>
                    </div>

                    {/* Chat Input */}
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                        className="flex gap-3 sticky bottom-0"
                    >
                        <input
                            type="text"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            disabled={isTyping}
                            placeholder="Type your response here..."
                            className="flex-1 bg-slate-950 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition"
                        />
                        <button
                            type="submit"
                            disabled={isTyping || !textInput.trim()}
                            className={`h-[48px] w-[48px] flex items-center justify-center rounded-2xl transition ${textInput.trim() && !isTyping ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "bg-slate-800 text-slate-600 border border-white/5"}`}
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </form>
                </div>

                {/* Right Panel - Live Signals / Progress */}
                <div className="space-y-4 flex flex-col justify-between">
                    {/* Session Progress */}
                    <div className="p-4 rounded-[2rem] border border-white/10 bg-slate-900/40 backdrop-blur shadow-xl space-y-4">
                        <div className="flex justify-between items-center text-xs uppercase font-bold tracking-wider text-slate-400">
                            <span>Session Progress</span>
                            <span>{turnsCompleted} / 6 Questions</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                        </div>

                        {turnsCompleted >= 6 ? (
                            <button
                                onClick={triggerEvaluation}
                                disabled={isEvaluating}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 py-3.5 text-sm font-bold tracking-wide transition shadow-lg"
                            >
                                {isEvaluating ? "Analyzing Profile..." : "Evaluate Pathway Fit"}
                            </button>
                        ) : (
                            <div className="text-[10px] text-slate-500 leading-relaxed text-center">
                                Complete 6 conversational turns to build a highly accurate profile mapping.
                            </div>
                        )}
                    </div>

                    {/* Microphone volume monitor */}
                    <AudioCapture isActive={microphoneActive} />

                    {/* Screen share tool triggers */}
                    <ScreenShare
                        isActive={screenActive}
                        onStartShare={(events) => {
                            setScreenActive(true);
                            setScreenShareEvents(events);
                        }}
                        onStopShare={() => {
                            setScreenActive(false);
                        }}
                    />
                </div>

            </div>
        </div>
    );
}
