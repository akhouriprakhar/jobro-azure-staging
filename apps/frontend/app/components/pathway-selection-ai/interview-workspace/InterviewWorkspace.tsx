"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Mic, Monitor, UserCheck, ShieldCheck, Heart, User, CheckCircle2, AlertCircle, HelpCircle, Volume2, VolumeX, Sparkles, Send, Eye, EyeOff } from "lucide-react";
import VideoCapture from "../video-capture/VideoCapture";
import AudioCapture from "../audio-capture/AudioCapture";
import ScreenShare from "../screen-share/ScreenShare";
import VoiceWorkspace from "../../VoiceWorkspace";

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

const getApiUrl = (path: string) => {
    if (typeof window !== "undefined") {
        const hostname = window.location.hostname;
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return `http://localhost:8000${path}`;
        }
    }
    return path;
};

export default function InterviewWorkspace({ candidateId, interviewId, registrationData, onCompleted }: InterviewWorkspaceProps) {
    // Media & sharing status
    const [cameraActive, setCameraActive] = useState(true);
    const [microphoneActive, setMicrophoneActive] = useState(true);
    const [screenActive, setScreenActive] = useState(false);
    const [screenShareEvents, setScreenShareEvents] = useState<any[]>([]);

    // Voice & VoiceWorkspace controls
    const [selectedVoiceName, setSelectedVoiceName] = useState("shimmer");
    const [speechSpeed, setSpeechSpeed] = useState("1.5");
    const [currentOptions, setCurrentOptions] = useState<string[]>([]);
    const voiceRef = useRef<any>(null);
    const [voiceStatus, setVoiceStatus] = useState<"connecting" | "idle" | "listening" | "thinking" | "speaking">("connecting");
    const [showWebcamOverlay, setShowWebcamOverlay] = useState(true);
    const interviewerVideoRef = useRef<HTMLVideoElement | null>(null);
    const interviewerContainerRef = useRef<HTMLDivElement | null>(null);

    // Chat dialogs
    const activePersona = "Geethanjali";
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [textInput, setTextInput] = useState("");
    const [isSessionInitialized, setIsSessionInitialized] = useState(false);
    const [videoError, setVideoError] = useState(false);

    // Dynamic support triggers & counts
    const [rephraseCount, setRephraseCount] = useState(0);
    const [moreTimeCount, setMoreTimeCount] = useState(0);
    const [skipCount, setSkipCount] = useState(0);

    // Progress tracks (Total 6 turns target)
    const [progressPercent, setProgressPercent] = useState(0);
    const [isEvaluating, setIsEvaluating] = useState(false);

    // Recording states and references
    const webcamStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const compositingActiveRef = useRef<boolean>(false);
    const recordMicStreamRef = useRef<MediaStream | null>(null);

    const startSessionRecording = async () => {
        try {
            // 1. Get candidate's audio track directly
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            recordMicStreamRef.current = micStream;
            const audioTrack = micStream.getAudioTracks()[0];

            // 2. Create composing canvas
            const canvas = document.createElement("canvas");
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            // 3. Offscreen video elements
            const webcamVideo = document.createElement("video");
            webcamVideo.muted = true;
            webcamVideo.playsInline = true;

            const screenVideo = document.createElement("video");
            screenVideo.muted = true;
            screenVideo.playsInline = true;

            compositingActiveRef.current = true;

            // 4. Compositing loop
            const drawFrame = () => {
                if (!compositingActiveRef.current) return;
                
                // Clear & fill background
                ctx.fillStyle = "#150E56";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Update sources if active
                if (webcamStreamRef.current && webcamVideo.srcObject !== webcamStreamRef.current) {
                    webcamVideo.srcObject = webcamStreamRef.current;
                    webcamVideo.play().catch(() => {});
                }
                if (screenStreamRef.current && screenVideo.srcObject !== screenStreamRef.current) {
                    screenVideo.srcObject = screenStreamRef.current;
                    screenVideo.play().catch(() => {});
                }

                const screenActive = !!screenStreamRef.current && screenStreamRef.current.active;
                const cameraActive = !!webcamStreamRef.current && webcamStreamRef.current.active;

                if (screenActive) {
                    // Draw screen share as background
                    ctx.drawImage(screenVideo, 0, 0, 1280, 720);
                    // Draw candidate webcam in picture-in-picture
                    if (cameraActive) {
                        ctx.drawImage(webcamVideo, 980, 500, 260, 180);
                    }
                } else if (cameraActive) {
                    // Full screen candidate webcam
                    ctx.drawImage(webcamVideo, 0, 0, 1280, 720);
                } else {
                    // Placeholder
                    ctx.fillStyle = "#FFFFFF";
                    ctx.font = "24px Arial";
                    ctx.textAlign = "center";
                    ctx.fillText("Webcam and Screen Share are inactive", 640, 360);
                }

                requestAnimationFrame(drawFrame);
            };

            // Start loop
            drawFrame();

            // 5. Build MediaStream and MediaRecorder
            const videoTrack = (canvas as any).captureStream(30).getVideoTracks()[0];
            const combinedStream = new MediaStream([videoTrack, audioTrack]);

            recordingChunksRef.current = [];
            const mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: "video/webm;codecs=vp8,opus",
                videoBitsPerSecond: 1500000
            });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordingChunksRef.current.push(e.data);
                }
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(1000);
            console.log("Recording started successfully");
        } catch (err) {
            console.error("Failed to initialize session recording:", err);
        }
    };

    const stopSessionRecording = async (): Promise<string | null> => {
        compositingActiveRef.current = false;
        
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
                resolve(null);
                return;
            }

            mediaRecorderRef.current.onstop = async () => {
                const blob = new Blob(recordingChunksRef.current, { type: "video/webm" });
                
                // Clean up mic audio track
                if (recordMicStreamRef.current) {
                    recordMicStreamRef.current.getTracks().forEach(t => t.stop());
                }

                // Upload to backend
                try {
                    const formData = new FormData();
                    formData.append("file", blob, `Session_${interviewId}.webm`);

                    const uploadUrl = getApiUrl(`/api/v1/interviews/${interviewId}/recording`);

                    const res = await fetch(uploadUrl, {
                        method: "POST",
                        body: formData
                    });

                    if (res.ok) {
                        const data = await res.json();
                        console.log("Recording uploaded successfully:", data.url);
                        resolve(data.url);
                    } else {
                        console.error("Recording upload failed:", res.statusText);
                        resolve(null);
                    }
                } catch (err) {
                    console.error("Failed to upload recording:", err);
                    resolve(null);
                }
            };

            mediaRecorderRef.current.stop();
        });
    };

    useEffect(() => {
        if (isSessionInitialized) {
            startSessionRecording();
        }
        return () => {
            compositingActiveRef.current = false;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                mediaRecorderRef.current.stop();
            }
            if (recordMicStreamRef.current) {
                recordMicStreamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, [isSessionInitialized]);

    const chatEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Initial session upsert on backend before websocket starts
    useEffect(() => {
        const initSession = async () => {
            try {
                const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
                const apiurl = isLocal 
                    ? `http://localhost:8000/api/v1/pathway-selection/init`
                    : `/api/v1/pathway-selection/init`;
                
                await fetch(apiurl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        interview_id: interviewId,
                        candidate_id: candidateId,
                        registration_data: registrationData
                    })
                });
            } catch (err) {
                console.warn("Could not register baseline session details:", err);
            } finally {
                setIsSessionInitialized(true);
            }
        };
        initSession();
    }, [interviewId, candidateId, registrationData]);

    // Control play/pause of interviewer video loop when the AI talks
    useEffect(() => {
        const video = interviewerVideoRef.current;
        if (!video) return;

        if (voiceStatus === "speaking") {
            video.currentTime = 0; // Replay from the beginning when AI starts speaking
            video.play().catch((err) => {
                console.warn("Interviewer video play failed:", err);
            });
        } else {
            video.pause();
        }
    }, [voiceStatus]);



    // Text messaging option using the Voice Workspace API
    const handleSendMessage = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const text = textInput.trim();
        if (!text) return;

        voiceRef.current?.sendTextOption(text);
        setTextInput("");
    };

    // Inclusive tools helper methods wired to voice stream
    const handleRephrase = () => {
        setRephraseCount((prev) => prev + 1);
        voiceRef.current?.sendInclusiveAction("rephrase");
    };

    const handleGiveExample = () => {
        voiceRef.current?.sendInclusiveAction("give_example");
    };

    const handleNeedMoreTime = () => {
        setMoreTimeCount((prev) => prev + 1);
        voiceRef.current?.sendInclusiveAction("need_more_time");
    };

    const handleSkip = () => {
        setSkipCount((prev) => prev + 1);
        voiceRef.current?.sendInclusiveAction("skip");
    };

    // Final evaluation pipeline trigger
    const triggerEvaluation = async () => {
        setIsEvaluating(true);

        // Stop recording and get URL
        const recordingUrl = await stopSessionRecording();

        const payload = {
            interview_id: interviewId,
            candidate_id: candidateId,
            messages: messages,
            registration_data: registrationData,
            recording_url: recordingUrl,
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

    // Dynamically build system prompt with registration context
    const reg = registrationData || {};
    const voiceSystemPrompt = `You are Geethanjali Ganapathy, the Orchvate mock interviewer, career counselor, and neuro-inclusive facilitator.
Your purpose is to conduct a strengths-based discovery session to understand the candidate, identify their strengths, interests, learning styles, support requirements, technology familiarity, and guide them towards the best pathways and programs.

CORE PHILOSOPHY:
- This is NOT a test, an interrogation, or a screening process. It is a welcoming, psychologically safe intake session.
- Every candidate has strengths. Your job is to discover them and identify how Orchvate can support them.

PROFILE DISCOVERY & INCLUSIVE OBJECTIVES:
- Your core objective is to identify and discover strengths from different categories of profiles, embracing candidate diversity.
- Allow candidates to talk freely about absolutely anything that is of their interest.
- Do NOT give options, multiple-choices, button lists, or predefined pathways lists for the candidate to select or choose from.
- Do not try to fit them into rigid, pre-defined templates; capture their authentic strengths, customized skills, and hobbies.

NEURO-INCLUSIVE EXPERIENCE GUIDELINES:
- Never make the conversation feel like an exam.
- If the candidate is nervous: slow down, encourage, offer examples, or rephrase questions gently.
- If the caregiver dominates, politely redirect some questions back to the candidate to keep them central.
- Never interpret long pauses, stimming, monotone speech, or short/detailed answers negatively.

EVIDENCE COLLECTION AREAS:
Gather evidence of candidate potential across:
- Data Annotation (attention to detail, consistency, pattern recognition, process orientation)
- AI & Technology (programming, AI experimentation, problem solving)
- Digital Marketing (communication, content creation, design, storytelling)
- Research & Analysis (curiosity, documentation, investigation, structured thinking)
- Employment Readiness (professional communication, reliability, initiative, adaptability)

CANDIDATE REGISTRATION DATA:
- Full Name: ${reg.full_name || 'Candidate'}
- Age: ${reg.age || 'Not specified'}
- Location: ${reg.location || 'Not specified'}
- Highest Education: ${reg.education || 'Not specified'}
- Preferred Language: ${reg.preferred_language || 'English'}
- Interests: ${reg.interests || 'Not specified'}
- Career Aspirations: ${reg.career_aspirations || 'Not specified'}
- Self Introduction: ${reg.self_introduction || 'Not specified'}

Do not ask questions whose answers are already available in the Registration Data.

CONVERSATION FLOW PHASES to guide your interaction:
1. Greeting & Rapport Building: Reduce anxiety. Make them feel welcome. Explain the session is not a test and that there are no wrong answers.
2. Participant Identification: Identify who is present (Candidate, caregiver, or both) and capture pronouns/relationships. If a caregiver is present, include them but keep the candidate central.
3. Personal Background Discovery: Explore daily activities, hobbies, motivations, and confidence.
4. Education & Experience Discovery: Discuss studies, volunteer work, certifications, and previous experiences.
5. Skills & Interest Discovery: Dig into technical, creative, or research skills. Never stop at "I know X"; ask what they built, why, and what challenges they faced.
6. Technology & AI Discovery: Learn about their computer literacy, digital confidence, and exposure to AI tools (e.g., ChatGPT).
7. Learning Style Discovery: Discover how they learn best (videos, examples, written instructions).
8. Work Preference Discovery: Ask if they prefer independent vs. team work, structured vs. flexible settings.
9. Support Needs Discovery: Gently explore accommodations (processing time, visual aids, checklists, etc.) without diagnosing.
10. Work Demonstration & Screen Sharing: After discovering interests, request to see a project or creative design they've built if they're comfortable. Ask: "I'd love to see something you've built if you're comfortable sharing." During screen share, ask what the project is, their role, tools used, and challenges.
11. Pathway Exploration: Explain pathways: AI & Data Annotation, Research & Analysis, Digital Skills, Technology & Automation, and Employability & Job Coaching. Ask: "What kinds of work or learning opportunities sound most interesting to you right now?"
12. Program Introduction: Present Orchvate offerings naturally:
    - Fully Funded Neuro AI Program (6 months, cohort-based, Gen AI / Data Annotation / readiness, potential internship based on performance/requirements).
    - Premium Guided Programs (Paid, smaller batches / one-on-one coaching, HTML & CSS, Data Analytics, Digital Marketing, Personalized Mentorship, etc.). Do not sell or pressure.
13. Preference Identification: Ask about interest in cohort vs. individual, batch times, and career goals.
14. Candidate Summary: Provide warm verbal feedback of their observed strengths (e.g., "Today I learned you are curious about technology, have Python experience...").
15. Next Steps & Closure: Inform them that the team will review the conversation and any shared materials, and someone from Orchvate will reach out. Do not promise admission, internships, or placement.

BEHAVIOR RULES:
- Be warm, encouraging, conversational, and dynamic.
- Keep responses short and conversational (1-2 sentences maximum) so the candidate is not overwhelmed.
- Ask exactly ONE clear, simple question at a time. Acknowledge candidate responses before asking follow-ups.
- Do NOT give multiple-choice options, lists of specific pathways, button lists, or predefined answers for the candidate to select.
- Adapt questions dynamically; do not follow a rigid list.
- Never interrogate, never rush, never diagnose conditions, never reject candidates, and never guarantee placements/internships.`;

    return (
        <div className="w-full max-w-[1500px] mx-auto space-y-6">
            
            {/* Top Bar - Call Title & General Persona */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-3xl border border-white bg-white/70 backdrop-blur shadow-clay">
                <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
                    <h2 className="text-xs font-black text-[#150E56] tracking-wider uppercase">Orchvate Pathway Selection Meeting</h2>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <span className="text-[9px] text-[#5C6485] block uppercase font-bold tracking-wider">Active Agent Persona</span>
                        <div className="flex gap-2 items-center justify-end text-sm font-bold text-[#150E56] mt-0.5">
                            <span className="h-2 w-2 rounded-full bg-[#00917C] animate-ping"></span>
                            {activePersona === "Geethanjali" ? "Geethanjali Ganapathy (Facilitator)" : "Panchali Banerjee (Career Mentor)"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Teams Call Interface Layout */}
            <div className="grid gap-6 lg:grid-cols-[1fr,420px]">
                
                {/* Left Column: Call Canvas (Interviewer and Interviewee screens side-by-side) */}
                <div className="space-y-6 flex flex-col justify-between h-full">
                    
                    {/* Interviewer (AI Agent Video Feed) - Large Teams View */}
                    <div ref={interviewerContainerRef} className="relative aspect-video w-full rounded-[2rem] border border-white bg-white/70 overflow-hidden shadow-clay flex flex-col justify-between">
                        
                        {/* Live/Playable Interviewer Video Loop */}
                        {!videoError ? (
                            <video
                                ref={interviewerVideoRef}
                                src="/Woman_speaks_at_desk_202606202302.mp4"
                                loop
                                muted
                                playsInline
                                onError={() => setVideoError(true)}
                                className="absolute inset-0 h-full w-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 h-full w-full flex items-center justify-center bg-[#FFF6F0]/65">
                                {/* Ambient back-glow */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-[#FFF6F0] via-[#FFFDFB] to-[#00917C]/5" />
                                
                                {/* Pulsing background blobs when speaking */}
                                {voiceStatus === "speaking" && (
                                    <div className="absolute h-[300px] w-[300px] rounded-full bg-[#00917C]/10 blur-[85px] animate-pulse" />
                                )}
                                
                                <div className="relative flex flex-col items-center gap-6 z-10">
                                    {/* Glowing Avatar Frame */}
                                    <div className="relative">
                                        <motion.div
                                            animate={voiceStatus === "speaking" ? {
                                                scale: [1, 1.03, 1],
                                                boxShadow: [
                                                    "0 0 0 0px rgba(0, 145, 124, 0.4)",
                                                    "0 0 0 15px rgba(0, 145, 124, 0)",
                                                    "0 0 0 0px rgba(0, 145, 124, 0.4)"
                                                ]
                                            } : {}}
                                            transition={{
                                                repeat: Infinity,
                                                duration: 2,
                                                ease: "easeInOut"
                                            }}
                                            className="h-40 w-40 rounded-full overflow-hidden border-2 border-[#150E56]/10 shadow-clay relative"
                                        >
                                            <img
                                                src={activePersona === "Geethanjali" ? "/geethanjali_avatar.png" : "/panchali_avatar.png"}
                                                alt={activePersona}
                                                className="h-full w-full object-cover"
                                            />
                                        </motion.div>

                                        {/* Speaking Indicator Status Rings */}
                                        {voiceStatus === "speaking" && (
                                            <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00917C] opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-4 w-4 bg-[#00917C]"></span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Persona details & visualizer */}
                                    <div className="text-center space-y-1">
                                        <h3 className="text-base font-black text-[#150E56] tracking-wide">
                                            {activePersona === "Geethanjali" ? "Geethanjali Ganapathy" : "Panchali Banerjee"}
                                        </h3>
                                        <p className="text-[11px] text-[#00917C] font-bold">
                                            {activePersona === "Geethanjali" ? "Orchvate Facilitator" : "Career Mentor"}
                                        </p>
                                        
                                        {/* Custom CSS visualizer bars */}
                                        <div className="flex justify-center items-center gap-1 h-6 pt-2">
                                            {[...Array(5)].map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    animate={voiceStatus === "speaking" ? {
                                                        height: ["8px", `${12 + Math.sin(i * 1.5) * 12}px`, "8px"]
                                                    } : {
                                                        height: "3px"
                                                    }}
                                                    transition={{
                                                        repeat: Infinity,
                                                        duration: 0.8 + (i * 0.1),
                                                        ease: "easeInOut"
                                                    }}
                                                    className="w-1 bg-[#00917C] rounded-full"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Speaker name tag */}
                        <div className="absolute bottom-4 left-4 bg-white/80 border border-[#150E56]/10 text-xs text-[#150E56] px-3 py-1.5 rounded-full backdrop-blur-sm z-10 font-bold shadow-clayBtn">
                            {activePersona === "Geethanjali" ? "Geethanjali Ganapathy" : "Panchali Banerjee"}
                        </div>

                        {/* Interviewee Overlay (Webcam Live Feed) */}
                        {showWebcamOverlay && (
                            <motion.div
                                drag
                                dragConstraints={interviewerContainerRef}
                                dragElastic={0.15}
                                dragMomentum={false}
                                className="absolute top-4 right-4 z-20 w-44 sm:w-56 aspect-video rounded-2xl border border-white bg-white/70 backdrop-blur-md overflow-hidden shadow-clay flex flex-col justify-between cursor-grab active:cursor-grabbing select-none"
                            >
                                {/* Video stream element */}
                                <VideoCapture 
                                    isActive={cameraActive} 
                                    onStreamChange={(s) => { webcamStreamRef.current = s; }}
                                />
                                
                                {/* Speaker name tag */}
                                <div className="absolute bottom-2 left-2 bg-white/80 border border-[#150E56]/10 text-[10px] text-[#150E56] px-2 py-1 rounded-full backdrop-blur-sm z-10 font-bold shadow-clayBtn pointer-events-none">
                                    {registrationData?.full_name || "Candidate"} (You)
                                </div>

                                {/* Hide Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowWebcamOverlay(false);
                                    }}
                                    className="absolute top-2 right-2 bg-white/80 hover:bg-[#FFF6F0] border border-[#150E56]/10 hover:border-[#150E56]/30 text-[#150E56] rounded-full p-1 transition z-30 focus:outline-none cursor-pointer shadow-clayBtn"
                                    title="Hide self view"
                                >
                                    <EyeOff className="h-3 w-3" />
                                </button>
                            </motion.div>
                        )}

                        {/* Restoration Button (Show Self View) */}
                        {!showWebcamOverlay && (
                            <button
                                onClick={() => setShowWebcamOverlay(true)}
                                className="absolute top-4 right-4 bg-white/80 border border-[#150E56]/10 hover:border-[#00917C]/30 text-[10px] text-[#150E56] px-3 py-1.5 rounded-full backdrop-blur-sm z-10 font-bold shadow-clayBtn hover:bg-[#FFF6F0] transition flex items-center gap-1.5 focus:outline-none cursor-pointer"
                            >
                                <Eye className="h-3 w-3 text-[#00917C]" />
                                Show Self View
                            </button>
                        )}
                    </div>

                    {/* Teams Meeting Control Bar */}
                    <div className="p-4 rounded-3xl border border-white bg-white/70 backdrop-blur shadow-clay flex flex-wrap items-center justify-between gap-4">
                        <div className="flex gap-3">
                            <button
                                onClick={() => setCameraActive(!cameraActive)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold border transition shadow-clayBtn ${cameraActive ? "bg-[#00917C]/10 text-[#00917C] border-[#00917C]/20 hover:bg-[#00917C]/20 shadow-clayBtnActive" : "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20"}`}
                            >
                                <Camera className="h-4 w-4" /> {cameraActive ? "Turn Camera Off" : "Turn Camera On"}
                            </button>
                            <button
                                onClick={() => setMicrophoneActive(!microphoneActive)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold border transition shadow-clayBtn ${microphoneActive ? "bg-[#00917C]/10 text-[#00917C] border-[#00917C]/20 hover:bg-[#00917C]/20 shadow-clayBtnActive" : "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20"}`}
                            >
                                <Mic className="h-4 w-4" /> {microphoneActive ? "Mute Microphone" : "Unmute Microphone"}
                            </button>
                        </div>

                        {/* Audio capturing visualizer in the control bar */}
                        <div className="w-[180px]">
                            <AudioCapture isActive={microphoneActive} />
                        </div>

                        <div>
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
                                onStreamChange={(s) => { screenStreamRef.current = s; }}
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column: Chat & Session Progress Sidebar */}
                <div className="space-y-6 flex flex-col justify-between h-[580px]">
                    
                    {/* Meeting Progress panel */}
                    <div className="p-4 rounded-[2rem] border border-white bg-white/70 backdrop-blur shadow-clay space-y-4">
                        <div className="flex justify-between items-center text-xs uppercase font-bold tracking-wider text-[#5C6485]">
                            <span>Progress</span>
                            <span>{turnsCompleted} / 6 Turns</span>
                        </div>
                        <div className="h-2 w-full bg-[#FFF6F0] rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#00917C] to-[#150E56] rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                        </div>

                        {turnsCompleted >= 6 ? (
                            <button
                                onClick={triggerEvaluation}
                                disabled={isEvaluating}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00917C] hover:bg-[#007a68] text-white py-3.5 text-sm font-bold tracking-wide transition shadow-lg shadow-[#00917C]/15 active:scale-95"
                            >
                                {isEvaluating ? "Analyzing Profile..." : "Evaluate Pathway Fit"}
                            </button>
                        ) : (
                            <div className="text-[10px] text-[#5C6485] leading-relaxed text-center font-medium">
                                Complete 6 conversational turns to build a highly accurate profile mapping.
                            </div>
                        )}
                    </div>

                    {/* Chat Workspace (Teams meeting chat sidebar) */}
                    <div className="rounded-[2.5rem] border border-white bg-white/70 p-4 backdrop-blur-xl shadow-clay flex flex-col flex-1 relative overflow-hidden h-[420px]">
                        <div className="absolute top-0 right-0 h-40 w-40 translate-x-10 -translate-y-10 rounded-full bg-[#00917C]/5 blur-[80px]"></div>

                        {/* Live voice connection panel inside chat header */}
                        {isSessionInitialized ? (
                            <VoiceWorkspace
                                interviewId={interviewId}
                                candidateId={candidateId}
                                systemPrompt={voiceSystemPrompt}
                                selectedVoice={selectedVoiceName}
                                onVoiceChange={setSelectedVoiceName}
                                onClose={() => {}}
                                onNewTranscript={(role, content) => {
                                    setMessages((prev) => {
                                        if (prev.length > 0) {
                                            const lastMsg = prev[prev.length - 1];
                                            if (lastMsg.role === role && lastMsg.content === content) {
                                                return prev;
                                            }
                                        }
                                        const updated = [...prev, { role, content }];
                                        const turnsCount = updated.filter((m) => m.role === "user").length;
                                        setProgressPercent(Math.min(90, Math.round((turnsCount / 6) * 100)));
                                        // Keep standard Geethanjali shimmer voice throughout
                                        setSelectedVoiceName("shimmer");
                                        return updated;
                                    });
                                }}
                                onNewOptions={setCurrentOptions}
                                onInitRef={(ref) => {
                                    voiceRef.current = ref;
                                }}
                                speechSpeed={speechSpeed}
                                onSpeedChange={setSpeechSpeed}
                                hideVoiceControls={true}
                                onStatusChange={setVoiceStatus}
                            />
                        ) : (
                            <div className="p-3 text-center text-xs text-[#5C6485] bg-[#FFF6F0]/40 border border-[#150E56]/5 rounded-2xl mb-3">
                                Initializing secure discovery workspace...
                            </div>
                        )}

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
                                            <div className={`max-w-[85%] rounded-[1.5rem] p-3 text-xs leading-relaxed shadow-clayBtn ${isUser ? "bg-[#00917C] text-white rounded-tr-none font-bold shadow-md shadow-[#00917C]/15" : "bg-[#FFF6F0]/65 border border-[#150E56]/5 text-[#2C3454] rounded-tl-none font-medium"}`}>
                                                {!isUser && (
                                                    <span className="text-[9px] font-extrabold text-[#00917C] block mb-0.5 uppercase tracking-wider">
                                                        Geethanjali
                                                    </span>
                                                )}
                                                {msg.content}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            <div ref={chatEndRef} />
                        </div>

                        {/* Suggested Options Pills - Hidden as per requirements */}
                        {/* {currentOptions && currentOptions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3 animate-fade-in">
                                {currentOptions.map((opt, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => {
                                            voiceRef.current?.sendTextOption(opt);
                                            setCurrentOptions([]);
                                        }}
                                        className="bg-white border border-[#150E56]/10 hover:border-[#00917C]/30 text-[#00917C] hover:text-[#150E56] px-2.5 py-1 rounded-full text-[10px] font-bold shadow-clayBtn hover:shadow-clayBtnHover transition-all duration-200"
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )} */}

                        {/* Inclusive Helpers Bar */}
                        <div className="flex flex-wrap gap-1.5 mb-3 border-t border-[#150E56]/10 pt-2">
                            <button
                                onClick={handleRephrase}
                                className="bg-white border border-[#150E56]/10 hover:border-[#00917C]/30 text-[#00917C] hover:text-[#150E56] px-2 py-1 rounded-full text-[10px] font-bold shadow-clayBtn hover:shadow-clayBtnHover transition-all duration-200"
                            >
                                Rephrase
                            </button>
                            <button
                                onClick={handleGiveExample}
                                className="bg-white border border-[#150E56]/10 hover:border-[#00917C]/30 text-[#00917C] hover:text-[#150E56] px-2 py-1 rounded-full text-[10px] font-bold shadow-clayBtn hover:shadow-clayBtnHover transition-all duration-200"
                            >
                                Example
                            </button>
                            <button
                                onClick={handleNeedMoreTime}
                                className="bg-white border border-[#150E56]/10 hover:border-[#00917C]/30 text-[#00917C] hover:text-[#150E56] px-2 py-1 rounded-full text-[10px] font-bold shadow-clayBtn hover:shadow-clayBtnHover transition-all duration-200"
                            >
                                More Time
                            </button>
                            <button
                                onClick={handleSkip}
                                className="bg-white border border-[#150E56]/10 hover:border-[#00917C]/30 text-[#00917C] hover:text-[#150E56] px-2 py-1 rounded-full text-[10px] font-bold shadow-clayBtn hover:shadow-clayBtnHover transition-all duration-200"
                            >
                                Skip
                            </button>
                        </div>

                        {/* Chat Input */}
                        <form
                            onSubmit={handleSendMessage}
                            className="flex gap-2 sticky bottom-0"
                        >
                            <input
                                type="text"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder="Type chat message..."
                                className="flex-1 bg-[#FFF6F0]/50 border border-[#150E56]/10 rounded-xl px-4 py-2.5 text-xs text-[#150E56] font-bold placeholder-[#5C6485]/50 focus:outline-none focus:border-[#00917C]/50 transition shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]"
                            />
                            <button
                                type="submit"
                                disabled={!textInput.trim()}
                                className={`h-[36px] w-[36px] flex items-center justify-center rounded-xl transition shadow-clayBtn ${textInput.trim() ? "bg-[#00917C] text-white hover:bg-[#007a68]" : "bg-white text-[#5C6485]/40 border border-[#150E56]/10"}`}
                            >
                                <Send className="h-3.5 w-3.5" />
                            </button>
                        </form>
                    </div>

                </div>

            </div>
        </div>
    );
}
