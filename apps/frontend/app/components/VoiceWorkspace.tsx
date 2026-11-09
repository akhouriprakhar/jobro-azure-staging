"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../InterviewExperience.module.css";

interface VoiceWorkspaceProps {
  interviewId: string;
  candidateId: string;
  systemPrompt: string;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  onClose: () => void;
  onNewTranscript: (role: "user" | "assistant", content: string) => void;
  onNewOptions?: (options: string[]) => void;
  onInitRef?: (ref: any) => void;
  speechSpeed: string;
  onSpeedChange: (speed: string) => void;
  hideVoiceControls?: boolean;
  onStatusChange?: (status: "connecting" | "idle" | "listening" | "thinking" | "speaking") => void;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

export default function VoiceWorkspace({
  interviewId,
  systemPrompt,
  selectedVoice,
  onVoiceChange,
  onClose,
  onNewTranscript,
  onNewOptions,
  onInitRef,
  speechSpeed,
  onSpeedChange,
  hideVoiceControls = false,
  onStatusChange,
  showSidebar = true,
  onToggleSidebar
}: VoiceWorkspaceProps) {
  const [status, setStatus] = useState<"connecting" | "idle" | "listening" | "thinking" | "speaking">("connecting");
  const [aiTranscript, setAiTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [showTextEncouragement, setShowTextEncouragement] = useState(false);
  const ignoreDeltasRef = useRef(false);
  const ignoreDeltasTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Accumulate text transcripts to send back to chat history on delta finish
  const currentAiSpeechTextRef = useRef<string>("");
  const currentUserSpeechTextRef = useRef<string>("");
  const speechSpeedRef = useRef<string>("1.0");
  const hasConnectedRef = useRef<boolean>(false);

  // Sync speechSpeed state to speechSpeedRef to avoid React stale closure in WebSocket listener
  useEffect(() => {
    speechSpeedRef.current = speechSpeed;
  }, [speechSpeed]);

  // Encourage text input if candidate is taking time to respond
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === "listening") {
      timer = setTimeout(() => {
        setShowTextEncouragement(true);
      }, 15000); // 15 seconds of silence
    } else {
      setShowTextEncouragement(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  // Expose status changes to parent components
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Resume AudioContexts on any user interaction to prevent browser autoplay blocks
  useEffect(() => {
    const resumeAudio = async () => {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume().catch(() => {});
      }
      if (playAudioContextRef.current && playAudioContextRef.current.state === "suspended") {
        await playAudioContextRef.current.resume().catch(() => {});
      }
    };
    
    window.addEventListener("click", resumeAudio);
    window.addEventListener("touchstart", resumeAudio);
    window.addEventListener("keydown", resumeAudio);
    
    return () => {
      window.removeEventListener("click", resumeAudio);
      window.removeEventListener("touchstart", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
    };
  }, []);

  useEffect(() => {
    onInitRef?.({
      sendTextOption: (text: string) => {
        // Stop current playback
        stopAllAiPlayback();
        setAiTranscript("");
        currentAiSpeechTextRef.current = "";
        
        // Clear suggestions immediately
        onNewOptions?.([]);

        // Ignore deltas from old response
        ignoreDeltasRef.current = true;
        if (ignoreDeltasTimeoutRef.current) clearTimeout(ignoreDeltasTimeoutRef.current);
        ignoreDeltasTimeoutRef.current = setTimeout(() => {
          ignoreDeltasRef.current = false;
        }, 1000);

        // Commit candidate choice to screen list
        setUserTranscript(text);
        currentUserSpeechTextRef.current = text;
        onNewTranscript("user", text);

        // Set status to thinking
        setStatus("thinking");

        // Send cancel and then the text option to websocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "cancel" }));
          wsRef.current.send(JSON.stringify({ type: "text", data: text }));
        }
      },
      sendInclusiveAction: (action: "rephrase" | "give_example" | "need_more_time" | "skip") => {
        stopAllAiPlayback();
        setAiTranscript("");
        currentAiSpeechTextRef.current = "";
        onNewOptions?.([]);

        // Ignore deltas from old response
        ignoreDeltasRef.current = true;
        if (ignoreDeltasTimeoutRef.current) clearTimeout(ignoreDeltasTimeoutRef.current);
        ignoreDeltasTimeoutRef.current = setTimeout(() => {
          ignoreDeltasRef.current = false;
        }, 1000);

        const displayMap = {
          rephrase: "Could you please rephrase the question?",
          give_example: "Could you give me an example?",
          need_more_time: "I need a moment to think, please.",
          skip: "Let's skip this question."
        };

        const systemNoteMap = {
          rephrase: "[System Note: The candidate has requested that you rephrase your last question. Please rephrase the last question to be simpler or clearer.]",
          give_example: "[System Note: The candidate requested an example answer. Please provide a brief, helpful example response to guide them.]",
          need_more_time: "[System Note: The candidate needs more time to think. Acknowledge this patiently and encourage them to take their time.]",
          skip: "[System Note: The candidate decided to skip this question. Please move on to the next topic or question in your track.]"
        };

        const displayText = displayMap[action];
        const socketText = systemNoteMap[action];

        setUserTranscript(displayText);
        currentUserSpeechTextRef.current = displayText;
        onNewTranscript("user", displayText);
        setStatus("thinking");

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "cancel" }));
          wsRef.current.send(JSON.stringify({ type: "text", data: socketText }));
        }
      }
    });

    return () => {
      onInitRef?.(null);
    };
  }, [onInitRef, onNewOptions, onNewTranscript]);

  useEffect(() => {
    // 1. Establish secure WebSocket connection
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const protocol = isLocal ? (window.location.protocol === "https:" ? "wss" : "ws") : "wss";
    const host = isLocal
      ? "localhost:8000"
      : (process.env.NEXT_PUBLIC_BACKEND_URL || "https://jobro-2-0.onrender.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
    const wsUrl = `${protocol}://${host}/api/v1/voice/voice-stream/${interviewId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("idle");
      // Clear options immediately on start
      onNewOptions?.([]);
      // Send initialization payload
      ws.send(JSON.stringify({
        system_prompt: systemPrompt,
        voice: selectedVoice,
        is_reconnect: hasConnectedRef.current
      }));
      hasConnectedRef.current = true;
      // Microphone will now start only after the AI finishes its first response
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const msgType = message.type;

        if (msgType === "response_created") {
          ignoreDeltasRef.current = false;
          if (ignoreDeltasTimeoutRef.current) {
            clearTimeout(ignoreDeltasTimeoutRef.current);
            ignoreDeltasTimeoutRef.current = null;
          }
        } else if (msgType === "audio") {
          if (ignoreDeltasRef.current) return;
          setStatus("speaking");
          playAudioChunk(message.data);
        } else if (msgType === "transcript") {
          if (ignoreDeltasRef.current) return;
          setStatus("speaking");
          if (currentAiSpeechTextRef.current === "") {
            onNewOptions?.([]);
          }
          setAiTranscript((prev) => prev + message.data);
          currentAiSpeechTextRef.current += message.data;
        } else if (msgType === "options") {
          if (message.data && Array.isArray(message.data)) {
            onNewOptions?.(message.data);
          }
        } else if (msgType === "user_transcript") {
          setUserTranscript(message.data);
          currentUserSpeechTextRef.current = message.data;
          // Commit user message to chat list
          onNewTranscript("user", message.data);
          // Clear options when user successfully completes speaking
          onNewOptions?.([]);
        } else if (msgType === "debug") {
          console.warn("[SERVER DEBUG]:", message.data);
        } else if (msgType === "response_done") {
          if (!streamRef.current) {
            startRecording();
          }
        } else if (msgType === "speech_started") {
          // Interruption: User started speaking while AI was talking
          setStatus("listening");
          stopAllAiPlayback();
          // Notify backend
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "cancel" }));
          }
          // Commit whatever the AI said so far to parent chat lists
          if (currentAiSpeechTextRef.current.trim()) {
            onNewTranscript("assistant", currentAiSpeechTextRef.current);
            currentAiSpeechTextRef.current = "";
          }
          setAiTranscript("");
        } else if (msgType === "error") {
          setErrorMessage(message.message);
          setStatus("idle");
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    ws.onerror = () => {
      setErrorMessage("WebSocket connection encountered an error.");
      setStatus("idle");
    };

    ws.onclose = () => {
      setStatus("connecting");
      stopRecording();
      stopAllAiPlayback();
    };

    return () => {
      ws.close();
      stopRecording();
      stopAllAiPlayback();
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [interviewId, selectedVoice]);



  // Audio Capture (Recording)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Add Analyser node for mic volume visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      micAnalyserRef.current = analyser;
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      // Mic level render loop
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const drawVolume = () => {
        if (!micAnalyserRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setMicLevel(average / 128.0); // Normalize roughly between 0 and 1
        animationFrameIdRef.current = requestAnimationFrame(drawVolume);
      };
      drawVolume();

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0); // Float32 samples
        const l = inputData.length;
        const buffer = new Int16Array(l);
        for (let i = 0; i < l; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const bytes = new Uint8Array(buffer.buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Str = btoa(binary);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "audio",
            data: base64Str
          }));
        }
      };

      setStatus("listening");
    } catch (err) {
      console.error("Microphone capture failed", err);
      setErrorMessage("Cannot access your microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    setMicLevel(0);
  };

  // Audio Playback (AI voice output)
  const playAudioChunk = (base64Data: string) => {
    if (typeof window === "undefined") return;

    if (!playAudioContextRef.current) {
      playAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      nextStartTimeRef.current = playAudioContextRef.current.currentTime;
    }

    const playAudioCtx = playAudioContextRef.current;
    if (playAudioCtx.state === "suspended") {
      playAudioCtx.resume().catch((err) => console.warn("Failed to resume AudioContext inside playAudioChunk:", err));
    }

    // Decode base64
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16Data = new Int16Array(bytes.buffer);

    // Convert Int16 to Float32
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0;
    }

    // Load into AudioBuffer
    const audioBuffer = playAudioCtx.createBuffer(1, float32Data.length, 16000);
    audioBuffer.getChannelData(0).set(float32Data);

    const sourceNode = playAudioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.playbackRate.value = parseFloat(speechSpeedRef.current);
    sourceNode.connect(playAudioCtx.destination);

    // Schedule playback start time sequentially
    const startTime = Math.max(playAudioCtx.currentTime, nextStartTimeRef.current);
    sourceNode.start(startTime);

    nextStartTimeRef.current = startTime + (audioBuffer.duration / parseFloat(speechSpeedRef.current));

    // Keep track of node to cancel on interruption
    activeSourceNodesRef.current.push(sourceNode);

    sourceNode.onended = () => {
      activeSourceNodesRef.current = activeSourceNodesRef.current.filter((n) => n !== sourceNode);
      if (activeSourceNodesRef.current.length === 0 && playAudioCtx.currentTime >= nextStartTimeRef.current) {
        setStatus("listening");
        // Commit text to parent history once speaking completes
        if (currentAiSpeechTextRef.current.trim()) {
          onNewTranscript("assistant", currentAiSpeechTextRef.current);
          currentAiSpeechTextRef.current = "";
        }
      }
    };
  };

  const stopAllAiPlayback = () => {
    activeSourceNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch (e) {}
    });
    activeSourceNodesRef.current = [];
    nextStartTimeRef.current = 0;
    if (playAudioContextRef.current) {
      playAudioContextRef.current.close();
      playAudioContextRef.current = null;
    }
  };

  // Helper to choose color of halo based on state
  const getStatusColor = () => {
    switch (status) {
      case "connecting": return "rgba(92, 100, 133, 0.15)";
      case "idle": return "rgba(21, 14, 86, 0.12)";
      case "listening": return "rgba(0, 145, 124, 0.15)";
      case "thinking": return "rgba(21, 14, 86, 0.22)";
      case "speaking": return "rgba(0, 145, 124, 0.25)";
      default: return "rgba(21, 14, 86, 0.12)";
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/70 border border-[#150E56]/10 mb-4 relative overflow-hidden flex-shrink-0 shadow-clay backdrop-blur">
      
      {/* Left: Persona Details + Mini visualizer */}
      <div className="flex items-center gap-4">
        <div className="relative flex items-center justify-center">
          {/* Glowing visualizer halo */}
          <div
            className="absolute rounded-full blur transition-all duration-300 pointer-events-none"
            style={{
              width: "60px",
              height: "60px",
              backgroundColor: getStatusColor(),
              transform: `scale(${1 + micLevel * 0.8})`,
            }}
          />
          {/* Outer Rotating border */}
          <div
            className="absolute rounded-full border border-dashed pointer-events-none"
            style={{
              width: "52px",
              height: "52px",
              borderColor: status === "speaking" ? "#00917C" : status === "thinking" ? "#150E56" : "rgba(21, 14, 86, 0.2)",
              animation: status === "thinking" ? "spin 2s linear infinite" : "spin 10s linear infinite",
            }}
          />
          {/* Center core */}
          <div className="relative h-10 w-10 rounded-full bg-white border border-[#150E56]/10 flex items-center justify-center text-sm font-bold text-[#150E56] shadow-clayBtn z-10">
            {status === "speaking" ? "🗣️" : status === "thinking" ? "⚡" : "🎙️"}
          </div>
        </div>

        <div>
          <span className="text-xs uppercase tracking-[0.2em] text-[#00917C] font-extrabold flex items-center gap-2">
            Live Voice Mode
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </span>
          <h2 className="text-sm font-bold text-[#5C6485] mt-0.5">
            Status: <span className="text-[#00917C] font-black capitalize">{status}</span>
          </h2>
        </div>
      </div>

      {/* Right: Controls & Voice / Speed Selects */}
      <div className="flex items-center gap-3 flex-wrap ml-auto">
        {errorMessage && (
          <span className="text-xs text-red-500 font-bold max-w-[200px] truncate" title={errorMessage}>
            ⚠️ {errorMessage}
          </span>
        )}

        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex items-center gap-2 bg-white hover:bg-[#FFF6F0] border border-[#150E56]/10 hover:border-[#00917C]/30 px-3 py-1.5 rounded-xl shadow-clayBtn transition-all duration-200 focus:outline-none cursor-pointer"
            title={showSidebar ? "Hide Jobro AI Sidebar" : "Show Jobro AI Sidebar"}
          >
            <span>👁️</span>
            <span className="text-xs font-bold text-[#5C6485]">{showSidebar ? "Hide Sidebar" : "Show Sidebar"}</span>
          </button>
        )}

        {!hideVoiceControls && (
          <>
            <div className="flex items-center gap-2 bg-white border border-[#150E56]/10 px-3 py-1.5 rounded-xl shadow-clayBtn">
              <span className="text-[10px] uppercase tracking-wider text-[#5C6485] font-bold">Voice</span>
              <select
                value={selectedVoice}
                onChange={(e) => onVoiceChange(e.target.value)}
                className="bg-transparent border-none text-xs text-[#00917C] font-bold focus:outline-none cursor-pointer outline-none"
              >
                <option value="shimmer" className="bg-[#FFF6F0] text-[#150E56]">Shimmer (Female)</option>
                <option value="alloy" className="bg-[#FFF6F0] text-[#150E56]">Alloy (Neutral)</option>
                <option value="echo" className="bg-[#FFF6F0] text-[#150E56]">Echo (Male)</option>
                <option value="coral" className="bg-[#FFF6F0] text-[#150E56]">Coral (Female)</option>
                <option value="ballad" className="bg-[#FFF6F0] text-[#150E56]">Ballad (Female)</option>
                <option value="sage" className="bg-[#FFF6F0] text-[#150E56]">Sage (Female)</option>
                <option value="verse" className="bg-[#FFF6F0] text-[#150E56]">Verse (Male)</option>
                <option value="marin" className="bg-[#FFF6F0] text-[#150E56]">Marin (Female)</option>
                <option value="cedar" className="bg-[#FFF6F0] text-[#150E56]">Cedar (Male)</option>
                <option value="ash" className="bg-[#FFF6F0] text-[#150E56]">Ash (Neutral)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white border border-[#150E56]/10 px-3 py-1.5 rounded-xl shadow-clayBtn">
              <span className="text-[10px] uppercase tracking-wider text-[#5C6485] font-bold">Speed</span>
              <select
                value={speechSpeed}
                onChange={(e) => onSpeedChange(e.target.value)}
                className="bg-transparent border-none text-xs text-[#00917C] font-bold focus:outline-none cursor-pointer outline-none"
              >
                <option value="0.8" className="bg-[#FFF6F0] text-[#150E56]">0.8x</option>
                <option value="1.0" className="bg-[#FFF6F0] text-[#150E56]">1.0x</option>
                <option value="1.15" className="bg-[#FFF6F0] text-[#150E56]">1.15x</option>
                <option value="1.3" className="bg-[#FFF6F0] text-[#150E56]">1.3x</option>
                <option value="1.5" className="bg-[#FFF6F0] text-[#150E56]">1.5x</option>
              </select>
            </div>
          </>
        )}
      </div>

      {showTextEncouragement && (
        <div className="absolute inset-x-0 bottom-0 bg-white/95 border-t border-[#00917C]/20 py-3 px-4 flex items-center justify-between text-xs text-[#150E56] font-medium animate-pulse z-20 shadow-clay">
          <span>Take your time! No rush at all. If you prefer, feel free to type your response in the box below.</span>
          <button 
            type="button"
            onClick={() => setShowTextEncouragement(false)} 
            className="text-[#00917C] hover:text-[#150E56] font-black ml-2 text-sm focus:outline-none cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
